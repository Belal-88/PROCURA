import { Router, Response } from 'express';
import { db } from '../db';
import { authMiddleware, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { recordAuditLog } from '../middleware/audit';
import {
  CreateRequestPayload,
  PurchaseRequest,
  RequestStatus,
  UpdateRequestStatusPayload
} from '../../src/types/procurement';

export const requestsRouter = Router();

// Apply auth middleware to all request endpoints
requestsRouter.use(authMiddleware);

// GET /api/v1/requests
requestsRouter.get('/', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const allRequests = db.getRequests();

  if (user.role === 'requester') {
    // Only return own requests
    const ownRequests = allRequests.filter((r) => r.requesterId === user.id);
    res.status(200).json(ownRequests);
    return;
  }

  if (user.role === 'supplier') {
    // Security Rule 1: Only return requests where supplierId is invited, and mask estimatedBudget to 0
    const supplierId = user.supplierId || 'SUP-01';
    const supplierRequests = allRequests
      .filter((r) => r.invitedSupplierIds?.includes(supplierId))
      .map((r) => ({
        ...r,
        estimatedBudget: 0 // Confidential internal budget masked for vendors
      }));

    res.status(200).json(supplierRequests);
    return;
  }

  // Officers and managers see all requests
  res.status(200).json(allRequests);
});

// POST /api/v1/requests
requestsRouter.post(
  '/',
  requireRole('requester'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const body = req.body as CreateRequestPayload;

    if (!body.title || !body.title.trim()) {
      res.status(400).json({ message: 'Request title is required.' });
      return;
    }

    if (!body.quantity || body.quantity <= 0) {
      res.status(400).json({ message: 'Quantity must be a positive number.' });
      return;
    }

    if (!body.estimatedBudget || body.estimatedBudget <= 0) {
      res.status(400).json({ message: 'Estimated budget must be a positive number.' });
      return;
    }

    const allRequests = db.getRequests();
    // Generate next PR-ID
    const nextNumber =
      allRequests.reduce((max, r) => {
        const num = parseInt(r.id.replace(/\D/g, ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 1050) + 1;

    const newId = `PR-${nextNumber}`;
    const today = new Date().toISOString().substring(0, 10);

    // Auto-invite matching suppliers based on Category (Tech vs Furniture)
    const category = body.category === 'furniture' ? 'furniture' : 'tech';
    const matchingSuppliers = db.findSuppliersByCategory(category);
    const autoInvitedSupplierIds = matchingSuppliers.map((s) => s.id);

    const newRequest: PurchaseRequest = {
      id: newId,
      title: body.title.trim(),
      titleAr: body.titleAr?.trim() || body.title.trim(),
      category,
      description: body.description?.trim() || 'Enterprise procurement requisition.',
      descriptionAr: body.descriptionAr?.trim() || 'طلب شراء مؤسسي معتمد.',
      quantity: Number(body.quantity),
      estimatedBudget: Number(body.estimatedBudget),
      reason: body.reason?.trim() || 'Operational requirement.',
      reasonAr: body.reasonAr?.trim() || 'احتياج تشغيلي.',
      deliveryDate: body.deliveryDate || today,
      requesterId: user.id,
      requesterName: user.name,
      requesterNameAr: user.nameAr,
      status: body.status === 'Draft' ? 'Draft' : 'Submitted',
      createdDate: today,
      invitedSupplierIds: autoInvitedSupplierIds
    };

    const saved = db.addRequest(newRequest);

    const matchingNames = matchingSuppliers.map((s) => s.name).join(', ');
    const matchingNamesAr = matchingSuppliers.map((s) => s.nameAr).join('، ');

    recordAuditLog(
      user,
      body.status === 'Draft' ? 'Created Draft' : 'Submitted Request',
      body.status === 'Draft' ? 'إنشاء مسودة طلب' : 'إرسال طلب شراء',
      newId,
      `Created ${category.toUpperCase()} request ${newId}: ${newRequest.title} ($${newRequest.estimatedBudget.toLocaleString()}). Auto-invited ${matchingSuppliers.length} ${category} suppliers: [${matchingNames}].`,
      `تم إنشاء طلب ${category === 'tech' ? 'تقني' : 'أثاث'} ${newId}: ${newRequest.titleAr}. تم توجيه الدعوة تلقائياً لـ ${matchingSuppliers.length} موردين: [${matchingNamesAr}].`
    );

    res.status(201).json(saved);
  }
);

// PATCH /api/v1/requests/:id/status
requestsRouter.patch('/:id/status', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.user!;
  const { id } = req.params;
  const { status: nextStatus, reason } = req.body as UpdateRequestStatusPayload;

  const existing = db.findRequestById(id);
  if (!existing) {
    res.status(404).json({ message: `Purchase request ${id} not found.` });
    return;
  }

  // RBAC validation for status transitions
  if (user.role === 'requester') {
    if (existing.requesterId !== user.id) {
      res.status(403).json({ message: 'Forbidden: You can only update your own requests.' });
      return;
    }
    if (existing.status !== 'Draft' || nextStatus !== 'Submitted') {
      res.status(400).json({
        message: 'Requesters can only transition a Draft request to Submitted status.'
      });
      return;
    }
  } else if (user.role === 'officer') {
    const allowedForOfficer: RequestStatus[] = ['PendingApproval', 'Compared', 'Submitted'];
    if (!allowedForOfficer.includes(nextStatus)) {
      res.status(403).json({
        message: `Officers cannot transition requests to ${nextStatus}. Only PendingApproval or Compared is allowed.`
      });
      return;
    }
  } else if (user.role === 'manager') {
    if (nextStatus !== 'Approved' && nextStatus !== 'Rejected') {
      res.status(400).json({
        message: 'Approvers can only mark requests as Approved or Rejected.'
      });
      return;
    }
    if (nextStatus === 'Rejected' && (!reason || !reason.trim())) {
      res.status(400).json({
        message: 'A rejection reason is strictly required when declining a purchase request.'
      });
      return;
    }
  } else {
    res.status(403).json({ message: 'Suppliers are not permitted to update request statuses.' });
    return;
  }

  const updated = db.updateRequest(id, {
    status: nextStatus,
    reason: nextStatus === 'Rejected' ? reason?.trim() || existing.reason : existing.reason
  });

  // Determine audit log wording
  let action = 'Updated Request Status';
  let actionAr = 'تحديث حالة الطلب';
  let details = `Status changed from ${existing.status} -> ${nextStatus}`;
  let detailsAr = `تغيرت الحالة من ${existing.status} -> ${nextStatus}`;

  if (nextStatus === 'Submitted') {
    action = 'Submitted Request';
    actionAr = 'إرسال طلب شراء';
  } else if (nextStatus === 'PendingApproval') {
    action = 'Sent for Approval';
    actionAr = 'إرسال للاعتماد';
  } else if (nextStatus === 'Approved') {
    action = 'Approved Request';
    actionAr = 'اعتماد طلب الشراء';
    details = `Executive approval granted by ${user.name}`;
    detailsAr = `تمت الموافقة التنفيذية بواسطة ${user.nameAr}`;
  } else if (nextStatus === 'Rejected') {
    action = 'Rejected Request';
    actionAr = 'رفض طلب الشراء';
    details = `Request rejected by ${user.name}. Reason: ${reason}`;
    detailsAr = `تم رفض الطلب بواسطة ${user.nameAr}. السبب: ${reason}`;
  }

  recordAuditLog(user, action, actionAr, id, details, detailsAr);

  res.status(200).json(updated);
});

// DELETE /api/v1/requests/:id
requestsRouter.delete(
  '/:id',
  requireRole('requester'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const { id } = req.params;

    const existing = db.findRequestById(id);
    if (!existing) {
      res.status(404).json({ message: `Purchase request ${id} not found.` });
      return;
    }

    if (existing.requesterId !== user.id) {
      res.status(403).json({ message: 'Forbidden: You can only delete your own draft requests.' });
      return;
    }

    if (existing.status !== 'Draft') {
      res.status(400).json({
        message: `Cannot delete request ${id} because it has already been submitted (status: ${existing.status}). Only Drafts can be deleted.`
      });
      return;
    }

    db.deleteRequest(id);

    recordAuditLog(
      user,
      'Deleted Draft',
      'حذف مسودة طلب',
      id,
      `Draft ${id} was deleted by ${user.name}`,
      `تم حذف المسودة ${id} بواسطة ${user.nameAr}`
    );

    res.status(204).send();
  }
);

// POST /api/v1/requests/:id/invite
requestsRouter.post(
  '/:id/invite',
  requireRole('officer'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const { id } = req.params;
    const { supplierIds } = req.body as { supplierIds: string[] };

    if (!Array.isArray(supplierIds) || supplierIds.length === 0) {
      res.status(400).json({ message: 'Please provide at least one supplier ID to invite.' });
      return;
    }

    const existing = db.findRequestById(id);
    if (!existing) {
      res.status(404).json({ message: `Purchase request ${id} not found.` });
      return;
    }

    const updated = db.updateRequest(id, { invitedSupplierIds: supplierIds });

    const allSuppliers = db.getSuppliers();
    const invitedNames = supplierIds
      .map((sid) => allSuppliers.find((s) => s.id === sid)?.name || sid)
      .join(', ');
    const invitedNamesAr = supplierIds
      .map((sid) => allSuppliers.find((s) => s.id === sid)?.nameAr || sid)
      .join('، ');

    recordAuditLog(
      user,
      'Invited Suppliers',
      'دعوة موردين',
      id,
      `Invited ${supplierIds.length} suppliers: ${invitedNames}`,
      `تمت دعوة ${supplierIds.length} موردين: ${invitedNamesAr}`
    );

    res.status(200).json(updated);
  }
);
