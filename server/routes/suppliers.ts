import { Router, Response } from 'express';
import { db } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

export const suppliersRouter = Router();

// GET /api/v1/suppliers
suppliersRouter.get('/', authMiddleware, (_req: AuthenticatedRequest, res: Response): void => {
  const suppliers = db.getSuppliers();
  res.status(200).json(suppliers);
});
