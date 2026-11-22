<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# PROCURA — Enterprise Procurement & AI Extraction Platform

Bilingual enterprise procurement portal with AI-powered supplier quotation parsing, role-based governance workflows, and executive approval chains.

---

## 🚀 Running the Project

### Prerequisites
- Node.js (v18+)
- npm or bun

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (`.env`)
The `.env` file is already configured with:
```env
GEMINI_API_KEY="your-gemini-api-key"
PORT=4000
JWT_SECRET="procura-enterprise-jwt-secret-key-2026"
VITE_USE_LIVE_API="true"
VITE_API_BASE_URL="http://localhost:4000/api/v1"
```

### 3. Start Backend Server
```bash
npm run server
```
Or with auto-restart on changes:
```bash
npm run server:watch
```
The REST API server will start on `http://localhost:4000` with endpoints mounted under `/api/v1`.

### 4. Start Frontend
In a separate terminal:
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### 5. Run Automated Backend Integration Tests
```bash
npm run test:backend
```

---

## 🏛️ Backend Architecture & Endpoints

The backend is built in **Node.js + Express + TypeScript** in the `server/` directory:

- **`server/index.ts`**: Main entry point, CORS configuration, iframe-friendly PDF static file server, error handling.
- **`server/db.ts`**: Persistent JSON database engine (`server/data/db.json`), pre-seeded with enterprise profiles, requests, quotations, and audit logs.
- **`server/middleware/auth.ts`**: JWT verification and role-based access control (RBAC).
- **`server/middleware/audit.ts`**: Automated governance logging for all mutating procurement events.
- **`server/services/gemini.ts`**: Multimodal AI extraction service using Google Gemini (`@google/genai`) to parse commercial PDF quotations.
- **`server/services/pdfGenerator.ts`**: PDF-1.4 quotation sheet generator for demo data.

### REST Endpoints
- **Authentication**:
  - `POST /api/v1/auth/login` (Requester, Officer, Manager, and Supplier credentials)
  - `GET /api/v1/auth/me` (Session hydration via Bearer JWT)
  - `POST /api/v1/auth/logout`
- **Purchase Requests**:
  - `GET /api/v1/requests` (Role-filtered; internal budgets masked to `0` for suppliers)
  - `POST /api/v1/requests` (Requesters create Draft or Submitted requests)
  - `PATCH /api/v1/requests/:id/status` (Workflow state machine: Draft -> Submitted -> Compared -> PendingApproval -> Approved / Rejected)
  - `DELETE /api/v1/requests/:id` (Requesters delete Draft requests)
  - `POST /api/v1/requests/:id/invite` (Officers invite verified suppliers)
- **Suppliers**:
  - `GET /api/v1/suppliers`
- **Quotations & AI Extraction**:
  - `GET /api/v1/quotations` (Filterable by `?requestId=...`)
  - `POST /api/v1/quotations/upload` (Multipart PDF upload, disk persistence, and automated Gemini AI extraction)
  - `POST /api/v1/quotations/:id/retry-extraction` (Re-run AI extraction)
  - `PUT /api/v1/quotations/:id/verify` (Officer verification & approval)
- **Audit Logs**:
  - `GET /api/v1/audit-logs` (Immutable system activity and compliance ledger)
- **PDF Previews**:
  - `GET /uploads/:filename` (Direct PDF rendering inside modal iframes without `X-Frame-Options` blocks)

---

## 👥 Demo Accounts (Default Password: `password123`)
1. **Requester**: `belal.khalil@procura.io`
2. **Procurement Officer**: `mona.officer@procura.io`
3. **Approving Manager**: `youssef.vp@procura.io`
4. **Supplier Partner**: `quotes@techsupply.io`
