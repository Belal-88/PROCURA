import { db, UserWithAuth } from '../db';
import { AuditLogEntry } from '../../src/types/procurement';

export function recordAuditLog(
  actor: UserWithAuth | { name: string; nameAr: string },
  action: string,
  actionAr: string,
  requestId: string,
  details: string,
  detailsAr: string
): AuditLogEntry {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const id = `AUD-${Math.floor(1000 + Math.random() * 9000)}`;

  const entry: AuditLogEntry = {
    id,
    timestamp,
    user: actor.name,
    userAr: actor.nameAr,
    action,
    actionAr,
    requestId,
    details,
    detailsAr
  };

  db.addAuditLog(entry);
  return entry;
}
