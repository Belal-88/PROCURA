import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db';
import { CONFIG } from '../config';
import { authMiddleware, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { recordAuditLog } from '../middleware/audit';
import { extractQuotationWithGemini } from '../services/gemini';
import { SupplierOffer, VerifyOfferPayload } from '../../src/types/procurement';

export const quotationsRouter = Router();

// Store uploaded files in memory initially so we can pass buffer directly to Gemini and write to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files (.pdf) are supported for quotation uploads.'));
    }
  }
});

// GET /api/v1/quotations
quotationsRouter.get(
  '/',
  authMiddleware,
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const { requestId } = req.query as { requestId?: string };

    let offers = db.getOffers();

    if (requestId) {
      offers = offers.filter((o) => o.requestId === requestId);
    }

    if (user.role === 'supplier') {
      const supplierId = user.supplierId || 'SUP-01';
      // Supplier only sees offers they submitted
      offers = offers.filter((o) => o.supplierId === supplierId);
    }

    res.status(200).json(offers);
  }
);

// POST /api/v1/quotations/upload
quotationsRouter.post(
  '/upload',
  authMiddleware,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const { requestId, supplierId } = req.body as { requestId: string; supplierId: string };
      const file = req.file;

      if (!file) {
        res.status(400).json({ message: 'A PDF quotation file is required.' });
        return;
      }

      if (!requestId || !supplierId) {
        res.status(400).json({ message: 'Both requestId and supplierId are required.' });
        return;
      }

      const request = db.findRequestById(requestId);
      if (!request) {
        res.status(404).json({ message: `Purchase request ${requestId} not found.` });
        return;
      }

      // Security check: If user is a supplier, ensure they are submitting for their own company and were invited
      if (user.role === 'supplier') {
        const userSupplierId = user.supplierId || 'SUP-01';
        if (supplierId !== userSupplierId) {
          res.status(403).json({
            message: 'Forbidden: You can only upload quotations under your own supplier account.'
          });
          return;
        }

        if (!request.invitedSupplierIds?.includes(userSupplierId)) {
          res.status(403).json({
            message: `Forbidden: Your organization was not invited to participate in request ${requestId}.`
          });
          return;
        }
      }

      // Sanitize filename and save to uploads folder
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueFileName = `${Date.now()}_${sanitizedName}`;
      const targetFilePath = path.join(CONFIG.UPLOADS_DIR, uniqueFileName);

      fs.writeFileSync(targetFilePath, file.buffer);

      const fileUrl = `http://localhost:${CONFIG.PORT}/uploads/${uniqueFileName}`;

      const supplierObj = db.findSupplierById(supplierId);
      const supplierName =
        user.companyName || supplierObj?.name || user.name || 'Vendor Partner';

      // Perform Gemini AI extraction
      console.log(`[AI Extraction] Running Gemini analysis on ${sanitizedName}...`);
      let extractionStatus: 'Completed' | 'Failed' = 'Completed';
      let extractedData: any;

      try {
        const extraction = await extractQuotationWithGemini(file.buffer, supplierName);
        extractedData = extraction.data;
        console.log(`[AI Extraction] Extracted successfully:`, extractedData);
      } catch (err) {
        console.error('[AI Extraction] Extraction error:', err);
        extractionStatus = 'Failed';
        extractedData = {
          supplierName,
          totalPrice: 0,
          currency: 'USD',
          deliveryDays: 10,
          paymentTerms: '',
          warrantyMonths: 12,
          notes: 'Automated extraction failed. Please review manually or retry.'
        };
      }

      const allOffers = db.getOffers();
      const nextOfferNum =
        allOffers.reduce((max, o) => {
          const num = parseInt(o.id.replace(/\D/g, ''), 10);
          return isNaN(num) ? max : Math.max(max, num);
        }, 205) + 1;

      const offerId = `OFF-${nextOfferNum}`;
      const now = new Date().toISOString().replace('T', ' ').substring(0, 16);

      const newOffer: SupplierOffer = {
        id: offerId,
        requestId,
        supplierId,
        supplierName: extractedData.supplierName || supplierName,
        fileName: uniqueFileName,
        fileUrl,
        uploadedAt: now,
        extractionStatus,
        reviewed: false,
        totalPrice: extractedData.totalPrice || 0,
        currency: extractedData.currency || 'USD',
        deliveryDays: extractedData.deliveryDays || 7,
        paymentTerms: extractedData.paymentTerms || '',
        warrantyMonths: extractedData.warrantyMonths || 24,
        notes: extractedData.notes || 'Extracted via PROCURA Gemini AI engine.'
      };

      const savedOffer = db.addOffer(newOffer);

      // Auto-advance request status if currently Submitted
      if (request.status === 'Submitted') {
        db.updateRequest(requestId, { status: 'OffersReceived' });
      }

      recordAuditLog(
        user,
        'Uploaded Quotation',
        'رفع عرض سعر',
        requestId,
        `${supplierName} uploaded quotation ${sanitizedName} (${offerId})`,
        `قام المورد ${supplierName} برفع عرض السعر ${sanitizedName}`
      );

      res.status(201).json(savedOffer);
    } catch (err: any) {
      console.error('[Quotations Upload Error]:', err);
      res.status(500).json({ message: err?.message || 'Quotation upload failed.' });
    }
  }
);

// POST /api/v1/quotations/:id/retry-extraction
quotationsRouter.post(
  '/:id/retry-extraction',
  authMiddleware,
  requireRole('officer'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const { id } = req.params;

      const offer = db.findOfferById(id);
      if (!offer) {
        res.status(404).json({ message: `Quotation offer ${id} not found.` });
        return;
      }

      const filePath = path.join(CONFIG.UPLOADS_DIR, offer.fileName);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ message: 'Original quotation PDF file was not found on disk.' });
        return;
      }

      const fileBuffer = fs.readFileSync(filePath);
      const extraction = await extractQuotationWithGemini(fileBuffer, offer.supplierName);

      const updated = db.updateOffer(id, {
        supplierName: extraction.data.supplierName || offer.supplierName,
        totalPrice: extraction.data.totalPrice || offer.totalPrice,
        currency: extraction.data.currency || offer.currency,
        deliveryDays: extraction.data.deliveryDays || offer.deliveryDays,
        paymentTerms: extraction.data.paymentTerms || offer.paymentTerms,
        warrantyMonths: extraction.data.warrantyMonths || offer.warrantyMonths,
        notes: extraction.data.notes || offer.notes,
        extractionStatus: 'Completed'
      });

      recordAuditLog(
        user,
        'Retried AI Extraction',
        'إعادة الاستخراج بالذكاء الاصطناعي',
        offer.requestId,
        `Retried AI extraction on offer ${id} (${offer.supplierName})`,
        `تمت إعادة استخراج بيانات العرض ${id}`
      );

      res.status(200).json(updated);
    } catch (err: any) {
      console.error('[Retry AI Extraction Error]:', err);
      res.status(500).json({ message: err?.message || 'Failed to re-run AI extraction.' });
    }
  }
);

// PUT /api/v1/quotations/:id/verify
quotationsRouter.put(
  '/:id/verify',
  authMiddleware,
  requireRole('officer'),
  (req: AuthenticatedRequest, res: Response): void => {
    const user = req.user!;
    const { id } = req.params;
    const body = req.body as VerifyOfferPayload;

    const offer = db.findOfferById(id);
    if (!offer) {
      res.status(404).json({ message: `Quotation offer ${id} not found.` });
      return;
    }

    const updated = db.updateOffer(id, {
      supplierName: body.supplierName?.trim() || offer.supplierName,
      totalPrice: Number(body.totalPrice) || offer.totalPrice,
      currency: body.currency?.trim() || offer.currency,
      deliveryDays: Number(body.deliveryDays) || offer.deliveryDays,
      paymentTerms: body.paymentTerms?.trim() ?? offer.paymentTerms,
      warrantyMonths: Number(body.warrantyMonths) ?? offer.warrantyMonths,
      notes: body.notes?.trim() ?? offer.notes,
      reviewed: true,
      extractionStatus: 'Completed'
    });

    recordAuditLog(
      user,
      'Verified AI Extraction',
      'اعتماد استخراج البيانات',
      offer.requestId,
      `Verified offer ${id} (${body.supplierName || offer.supplierName}): $${Number(body.totalPrice).toLocaleString()}, ${body.deliveryDays}d`,
      `تمت مراجعة واعتماد بيانات عرض السعر ${id}`
    );

    res.status(200).json(updated);
  }
);
