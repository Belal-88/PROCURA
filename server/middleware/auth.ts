import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config';
import { db, UserWithAuth } from '../db';
import { UserRole } from '../../src/types/procurement';

export interface AuthenticatedRequest extends Request {
  user?: UserWithAuth;
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Unauthorized: Authentication token is missing.' });
    return;
  }

  const token = authHeader.substring(7).trim();

  try {
    const decoded = jwt.verify(token, CONFIG.JWT_SECRET) as { id: string; email: string };
    const user = db.findUserById(decoded.id) || db.findUserByEmail(decoded.email);

    if (!user) {
      res.status(401).json({ message: 'Unauthorized: User account no longer exists.' });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Unauthorized: Invalid or expired authentication session.' });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized: Please authenticate.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        message: `Forbidden: Access restricted. Required roles: ${allowedRoles.join(', ')}.`
      });
      return;
    }

    next();
  };
}
