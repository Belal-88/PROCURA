export interface QuotationPdfData {
  offerId: string;
  requestId: string;
  supplierName: string;
  totalPrice: number;
  currency: string;
  deliveryDays: number;
  paymentTerms: string;
  warrantyMonths: number;
  notes: string;
  uploadedAt?: string;
}

/**
 * Generates a clean, standards-compliant single-page PDF (PDF-1.4)
 * containing an authentic commercial quotation sheet for procurement.
 */
export function generateQuotationPdf(data: QuotationPdfData): Buffer {
  const sanitize = (str: string) => (str || '').replace(/[\\()]/g, '');

  const dateStr = data.uploadedAt || new Date().toISOString().substring(0, 10);
  const supplier = sanitize(data.supplierName || 'Enterprise Vendor');
  const reqId = sanitize(data.requestId || 'PR-1000');
  const offerId = sanitize(data.offerId || 'OFF-000');
  const price = `${Number(data.totalPrice || 0).toLocaleString()} ${sanitize(data.currency || 'USD')}`;
  const delivery = `${data.deliveryDays || 10} Days`;
  const warranty = `${data.warrantyMonths || 12} Months`;
  const terms = sanitize(data.paymentTerms || 'Net 30');
  const notes = sanitize(data.notes || 'Standard enterprise delivery terms apply.');

  const streamLines = [
    'BT',
    '/F1 22 Tf',
    '50 730 Td',
    '(COMMERCIAL PURCHASE QUOTATION) Tj',
    '/F1 10 Tf',
    '0 -18 Td',
    '(PROCURA ENTERPRISE SOURCING PLATFORM - OFFICIAL VENDOR OFFER) Tj',
    '/F1 12 Tf',
    '0 -36 Td',
    `(${supplier}) Tj`,
    '/F1 10 Tf',
    '0 -16 Td',
    `(Quotation ID: ${offerId}  |  Purchase Request: ${reqId}  |  Date: ${dateStr}) Tj`,
    '0 -30 Td',
    '(-------------------------------------------------------------------------------------------------) Tj',
    '/F1 11 Tf',
    '0 -24 Td',
    `(Total Proposed Budget:   ${price}) Tj`,
    '0 -20 Td',
    `(Delivery Lead Time:       ${delivery}) Tj`,
    '0 -20 Td',
    `(Warranty Coverage:        ${warranty}) Tj`,
    '0 -20 Td',
    `(Payment Terms:            ${terms}) Tj`,
    '0 -26 Td',
    '(-------------------------------------------------------------------------------------------------) Tj',
    '/F1 10 Tf',
    '0 -24 Td',
    '(Commercial Terms & Technical Specifications Notes:) Tj',
    '0 -16 Td',
    `(${notes.substring(0, 90)}) Tj`,
    notes.length > 90 ? `0 -14 Td (${notes.substring(90, 180)}) Tj` : '',
    '0 -40 Td',
    '(Authorized Corporate Signature: _______________________      Date: ______________) Tj',
    'ET'
  ].filter(Boolean);

  const streamContent = streamLines.join('\n');
  const streamLength = Buffer.byteLength(streamContent, 'utf-8');

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];

  const addObject = (content: string) => {
    offsets.push(Buffer.byteLength(body, 'utf-8'));
    body += content + '\n';
  };

  // 1: Catalog
  addObject('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  // 2: Pages
  addObject('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  // 3: Page
  addObject('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj');
  // 4: Font
  addObject('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  // 5: Contents stream
  addObject(`5 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj`);

  const startxref = Buffer.byteLength(body, 'utf-8');
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }

  const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`;
  return Buffer.from(body + xref + trailer, 'utf-8');
}
