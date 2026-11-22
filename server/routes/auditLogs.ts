import { Router, Response } from 'express';
import { db } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

export const auditLogsRouter = Router();

// GET /api/v1/audit-logs
auditLogsRouter.get('/', authMiddleware, (_req: AuthenticatedRequest, res: Response): void => {
  const logs = db.getAuditLogs();
  res.status(200).json(logs);
});
