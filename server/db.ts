import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { CONFIG, IS_RAILWAY } from './config';
import {
  AuditLogEntry,
  PurchaseRequest,
  Supplier,
  SupplierOffer,
  User
} from '../src/types/procurement';
import {
  DEFAULT_PORTAL_PROFILES,
  INITIAL_AUDIT_LOG,
  INITIAL_OFFERS,
  INITIAL_REQUESTS,
  REGISTERED_SUPPLIERS
} from '../src/data/mockData';
import { generateQuotationPdf } from './services/pdfGenerator';

export interface UserWithAuth extends User {
  passwordHash: string;
}

export interface DatabaseSchema {
  users: UserWithAuth[];
  suppliers: Supplier[];
  requests: PurchaseRequest[];
  offers: SupplierOffer[];
  auditLogs: AuditLogEntry[];
}

class Database {
  private data: DatabaseSchema;
  private dbFilePath: string;

  constructor() {
    this.dbFilePath = path.join(CONFIG.DATA_DIR, 'db.json');
    this.ensureDirectories();
    this.data = this.loadDatabase();
    this.seedPdfsIfMissing();
  }

  private ensureDirectories() {
    if (!fs.existsSync(CONFIG.DATA_DIR)) {
      fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(CONFIG.UPLOADS_DIR)) {
      fs.mkdirSync(CONFIG.UPLOADS_DIR, { recursive: true });
    }
  }

  private loadDatabase(): DatabaseSchema {
    if (fs.existsSync(this.dbFilePath)) {
      try {
        const raw = fs.readFileSync(this.dbFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.users && parsed.requests && parsed.offers) {
          console.log('[Database] Loaded existing database from disk.');
          // Merge any newly introduced suppliers if missing
          const existingSupplierIds = new Set(parsed.suppliers.map((s: Supplier) => s.id));
          for (const s of REGISTERED_SUPPLIERS) {
            if (!existingSupplierIds.has(s.id)) {
              parsed.suppliers.push(s);
            }
          }
          return parsed;
        }
      } catch (err) {
        console.warn('[Database] Failed to parse db.json, re-seeding...', err);
      }
    }

    console.log('[Database] Seeding initial database with default records...');
    const defaultPasswordHash = bcrypt.hashSync('password123', 10);

    const baseUrl = IS_RAILWAY
      ? `https://${process.env.RAILWAY_STATIC_URL || 'procura-api.up.railway.app'}`
      : `http://localhost:${CONFIG.PORT}`;

    const seededUsers: UserWithAuth[] = DEFAULT_PORTAL_PROFILES.map((u) => ({
      ...u,
      passwordHash: defaultPasswordHash
    }));

    const seededOffers: SupplierOffer[] = INITIAL_OFFERS.map((o) => ({
      ...o,
      fileUrl: `${baseUrl}/uploads/${o.fileName}`
    }));

    const initialDb: DatabaseSchema = {
      users: seededUsers,
      suppliers: REGISTERED_SUPPLIERS,
      requests: INITIAL_REQUESTS,
      offers: seededOffers,
      auditLogs: INITIAL_AUDIT_LOG
    };

    this.saveData(initialDb);
    return initialDb;
  }

  private saveData(data: DatabaseSchema) {
    try {
      fs.writeFileSync(this.dbFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Database] Failed to write db.json:', err);
    }
  }

  private seedPdfsIfMissing() {
    for (const offer of this.data.offers) {
      const filePath = path.join(CONFIG.UPLOADS_DIR, offer.fileName);
      if (!fs.existsSync(filePath)) {
        try {
          const pdfBuffer = generateQuotationPdf({
            offerId: offer.id,
            requestId: offer.requestId,
            supplierName: offer.supplierName,
            totalPrice: offer.totalPrice,
            currency: offer.currency,
            deliveryDays: offer.deliveryDays,
            paymentTerms: offer.paymentTerms,
            warrantyMonths: offer.warrantyMonths,
            notes: offer.notes,
            uploadedAt: offer.uploadedAt
          });
          fs.writeFileSync(filePath, pdfBuffer);
        } catch (e) {
          console.warn('[Database] Failed to generate seed PDF for', offer.fileName, e);
        }
      }
    }
  }

  public save() {
    this.saveData(this.data);
  }

  // Users
  public getUsers(): UserWithAuth[] {
    return this.data.users;
  }

  public findUserByEmail(email: string): UserWithAuth | undefined {
    return this.data.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  }

  public findUserById(id: string): UserWithAuth | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  public addUser(user: UserWithAuth): UserWithAuth {
    this.data.users.push(user);
    this.save();
    return user;
  }

  // Suppliers
  public getSuppliers(): Supplier[] {
    return this.data.suppliers;
  }

  public findSupplierById(id: string): Supplier | undefined {
    return this.data.suppliers.find((s) => s.id === id);
  }

  public findSuppliersByCategory(category: string): Supplier[] {
    const target = category.toLowerCase().trim();
    return this.data.suppliers.filter((s) => {
      const cat = (s.category || '').toLowerCase();
      const name = (s.name || '').toLowerCase();
      if (target === 'tech') {
        return (
          cat === 'tech' ||
          cat.includes('tech') ||
          cat.includes('hardware') ||
          cat.includes('automation') ||
          cat.includes('systems') ||
          name.includes('tech') ||
          s.id === 'SUP-01' ||
          s.id === 'SUP-03'
        );
      } else if (target === 'furniture') {
        return (
          cat === 'furniture' ||
          cat.includes('furniture') ||
          cat.includes('chair') ||
          cat.includes('desk') ||
          cat.includes('logistics') ||
          name.includes('furniture') ||
          s.id === 'SUP-02' ||
          s.id === 'SUP-04'
        );
      }
      return cat === target || cat.includes(target);
    });
  }

  public addSupplier(supplier: Supplier): Supplier {
    this.data.suppliers.push(supplier);
    this.save();
    return supplier;
  }

  // Requests
  public getRequests(): PurchaseRequest[] {
    return this.data.requests;
  }

  public findRequestById(id: string): PurchaseRequest | undefined {
    return this.data.requests.find((r) => r.id === id);
  }

  public addRequest(req: PurchaseRequest): PurchaseRequest {
    this.data.requests.unshift(req);
    this.save();
    return req;
  }

  public updateRequest(id: string, updates: Partial<PurchaseRequest>): PurchaseRequest | null {
    const idx = this.data.requests.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    this.data.requests[idx] = { ...this.data.requests[idx], ...updates };
    this.save();
    return this.data.requests[idx];
  }

  public deleteRequest(id: string): boolean {
    const initialLen = this.data.requests.length;
    this.data.requests = this.data.requests.filter((r) => r.id !== id);
    const removed = this.data.requests.length < initialLen;
    if (removed) this.save();
    return removed;
  }

  // Offers
  public getOffers(): SupplierOffer[] {
    return this.data.offers;
  }

  public findOfferById(id: string): SupplierOffer | undefined {
    return this.data.offers.find((o) => o.id === id);
  }

  public addOffer(offer: SupplierOffer): SupplierOffer {
    // Replace any existing offer from same supplier on same request
    this.data.offers = this.data.offers.filter(
      (o) => !(o.requestId === offer.requestId && o.supplierId === offer.supplierId)
    );
    this.data.offers.push(offer);
    this.save();
    return offer;
  }

  public updateOffer(id: string, updates: Partial<SupplierOffer>): SupplierOffer | null {
    const idx = this.data.offers.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    this.data.offers[idx] = { ...this.data.offers[idx], ...updates };
    this.save();
    return this.data.offers[idx];
  }

  // Audit Logs
  public getAuditLogs(): AuditLogEntry[] {
    return this.data.auditLogs;
  }

  public addAuditLog(entry: AuditLogEntry): AuditLogEntry {
    this.data.auditLogs.unshift(entry);
    this.save();
    return entry;
  }
}

export const db = new Database();
