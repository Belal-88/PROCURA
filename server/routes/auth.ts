import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { CONFIG } from '../config';
import { db, UserWithAuth } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { recordAuditLog } from '../middleware/audit';
import { LoginPayload, RegisterPayload, Supplier, UserRole } from '../../src/types/procurement';

export const authRouter = Router();

// Helper to omit sensitive fields from returned user
function sanitizeUser(user: UserWithAuth) {
  const { passwordHash, ...safe } = user;
  return safe;
}

// POST /api/v1/auth/register (Create New Account with Stakeholder & Supplier Category Selection)
authRouter.post('/register', async (req, res: Response): Promise<void> => {
  const {
    name,
    nameAr,
    email,
    password,
    role,
    supplierCategory,
    companyName,
    companyNameAr,
    department,
    departmentAr
  } = (req.body || {}) as RegisterPayload;

  if (!email || !email.trim()) {
    res.status(400).json({ message: 'Email address is required.' });
    return;
  }

  if (!password || !password.trim()) {
    res.status(400).json({ message: 'Password is required.' });
    return;
  }

  if (!name || !name.trim()) {
    res.status(400).json({ message: 'Full name is required.' });
    return;
  }

  const validRoles: UserRole[] = ['requester', 'officer', 'manager', 'supplier'];
  if (!role || !validRoles.includes(role)) {
    res.status(400).json({
      message: 'Please choose exactly one valid stakeholder role: requester, officer, manager, or supplier.'
    });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const existing = db.findUserByEmail(cleanEmail);
  if (existing) {
    res.status(409).json({ message: 'An account with this email already exists. Please sign in.' });
    return;
  }

  let supplierId: string | undefined = undefined;
  let finalCompanyName = companyName?.trim();
  let finalCompanyNameAr = companyNameAr?.trim();

  if (role === 'supplier') {
    const validCategories = ['tech', 'furniture'];
    const chosenCategory = supplierCategory && validCategories.includes(supplierCategory)
      ? supplierCategory
      : 'tech';

    // Auto-generate company name if left empty
    if (!finalCompanyName) {
      finalCompanyName = chosenCategory === 'tech'
        ? `${name.trim()} Tech Innovations Ltd.`
        : `${name.trim()} Office Furnishings Co.`;
    }
    if (!finalCompanyNameAr) {
      finalCompanyNameAr = chosenCategory === 'tech'
        ? `شركة ${name.trim()} للحلول التقنية`
        : `شركة ${name.trim()} للأثاث والتجهيزات المكتبية`;
    }

    const allSuppliers = db.getSuppliers();
    const nextSupNum =
      allSuppliers.reduce((max, s) => {
        const num = parseInt(s.id.replace(/\D/g, ''), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 10) + 1;

    supplierId = `SUP-${String(nextSupNum).padStart(2, '0')}`;

    const newSupplier: Supplier = {
      id: supplierId,
      name: finalCompanyName,
      nameAr: finalCompanyNameAr,
      category: chosenCategory,
      categoryAr: chosenCategory === 'tech' ? 'معدات تقنية وأجهزة' : 'أثاث وتجهيزات مكتبية',
      rating: 5.0,
      location: 'Enterprise Vendor Network'
    };

    db.addSupplier(newSupplier);
  }

  const allUsers = db.getUsers();
  const nextUserNum =
    allUsers.reduce((max, u) => {
      const num = parseInt(u.id.replace(/\D/g, ''), 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 10) + 1;

  const newUserId = `USR-${String(nextUserNum).padStart(2, '0')}`;
  const passwordHash = bcrypt.hashSync(password.trim(), 10);

  const defaultDept =
    role === 'requester'
      ? 'Operations & Procurement'
      : role === 'officer'
      ? 'Strategic Sourcing & Evaluation'
      : role === 'manager'
      ? 'Executive Governance & Approvals'
      : undefined;

  const defaultDeptAr =
    role === 'requester'
      ? 'العمليات وطلبات الشراء'
      : role === 'officer'
      ? 'المشتريات الاستراتيجية والتقييم'
      : role === 'manager'
      ? 'الاعتماد والحوكمة التنفيذية'
      : undefined;

  const newUser: UserWithAuth = {
    id: newUserId,
    name: name.trim(),
    nameAr: nameAr?.trim() || name.trim(),
    email: cleanEmail,
    role,
    department: department?.trim() || defaultDept,
    departmentAr: departmentAr?.trim() || defaultDeptAr,
    supplierId,
    supplierCategory: role === 'supplier' ? (supplierCategory || 'tech') : undefined,
    companyName: finalCompanyName,
    companyNameAr: finalCompanyNameAr,
    passwordHash
  };

  const savedUser = db.addUser(newUser);

  // Sign JWT
  const signOptions: SignOptions = { expiresIn: '7d' };
  const token = jwt.sign(
    { id: savedUser.id, email: savedUser.email, role: savedUser.role },
    CONFIG.JWT_SECRET as jwt.Secret,
    signOptions
  );

  recordAuditLog(
    savedUser,
    'User Registered',
    'تسجيل حساب جديد',
    'SYSTEM',
    `Registered new ${savedUser.role} account: ${savedUser.name} (${savedUser.email})${
      savedUser.supplierCategory ? ` [${savedUser.supplierCategory.toUpperCase()} SUPPLIER]` : ''
    }`,
    `تم إنشاء حساب جديد لدور ${savedUser.role}: ${savedUser.nameAr}`
  );

  res.status(201).json({
    user: sanitizeUser(savedUser),
    token
  });
});

// POST /api/v1/auth/login
authRouter.post('/login', async (req, res: Response): Promise<void> => {
  const { email, password } = (req.body || {}) as LoginPayload;

  if (!email || !email.trim()) {
    res.status(400).json({ message: 'Email address is required.' });
    return;
  }

  if (!password || !password.trim()) {
    res.status(400).json({ message: 'Password is required.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = db.findUserByEmail(cleanEmail);

  // Reject unknown emails — users must register first
  if (!user) {
    res.status(401).json({ message: 'No account found with this email. Please register first.' });
    return;
  }

  // Validate password via bcrypt only — no hardcoded shortcuts
  const isMatch = bcrypt.compareSync(password, user.passwordHash);

  if (!isMatch) {
    res.status(401).json({ message: 'Invalid credentials. Please verify your password.' });
    return;
  }

  // Sign JWT
  const signOptions: SignOptions = {
    expiresIn: '7d'
  };

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    CONFIG.JWT_SECRET as jwt.Secret,
    signOptions
  );

  recordAuditLog(
    user,
    'User Authenticated',
    'تسجيل دخول المستخدم',
    'SYSTEM',
    `User ${user.name} signed in successfully (${user.role})`,
    `قام المستخدم ${user.nameAr} بتسجيل الدخول بنجاح`
  );

  res.status(200).json({
    user: sanitizeUser(user),
    token
  });
});

// GET /api/v1/auth/me
authRouter.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ message: 'Unauthorized session.' });
    return;
  }
  res.status(200).json(sanitizeUser(req.user));
});

// POST /api/v1/auth/logout
authRouter.post('/logout', authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  if (req.user) {
    recordAuditLog(
      req.user,
      'User Signed Out',
      'تسجيل خروج المستخدم',
      'SYSTEM',
      `User ${req.user.name} signed out`,
      `قام المستخدم ${req.user.nameAr} بتسجيل الخروج`
    );
  }
  res.status(204).send();
});
