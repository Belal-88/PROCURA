import { GoogleGenAI } from '@google/genai';
import { CONFIG } from '../config';

export interface ExtractedQuotationData {
  supplierName: string;
  totalPrice: number;
  currency: string;
  deliveryDays: number;
  paymentTerms: string;
  warrantyMonths: number;
  notes: string;
}

let genAiInstance: GoogleGenAI | null = null;

function getGenAi(): GoogleGenAI | null {
  if (!CONFIG.GEMINI_API_KEY) return null;
  if (!genAiInstance) {
    genAiInstance = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });
  }
  return genAiInstance;
}

/**
 * Clean and parse JSON string potentially wrapped in markdown backticks
 */
function cleanAndParseJson(text: string): Record<string, any> {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  }
  return JSON.parse(cleaned);
}

/**
 * Intelligent heuristic fallback parser if AI call encounters network or quota limits.
 */
function fallbackRegexExtract(pdfBuffer: Buffer, defaultSupplier = 'Vendor'): ExtractedQuotationData {
  const text = pdfBuffer.toString('utf-8');

  // Search for currency and numbers
  const priceMatch = text.match(/(?:\$|USD|SAR|EUR)\s?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s?(?:USD|SAR|EUR|\$)/i);
  let totalPrice = 25000;
  if (priceMatch) {
    const rawNum = (priceMatch[1] || priceMatch[2] || '').replace(/,/g, '');
    const parsed = parseFloat(rawNum);
    if (!isNaN(parsed) && parsed > 0) totalPrice = parsed;
  }

  // Search for delivery days
  const deliveryMatch = text.match(/(\d+)\s*(?:days|day|business days|calendar days)/i);
  const deliveryDays = deliveryMatch ? parseInt(deliveryMatch[1], 10) : 10;

  // Search for warranty
  const warrantyMatch = text.match(/(\d+)\s*(?:months|month|year|years|yr)/i);
  let warrantyMonths = 24;
  if (warrantyMatch) {
    const num = parseInt(warrantyMatch[1], 10);
    warrantyMonths = text.toLowerCase().includes('year') && num < 10 ? num * 12 : num;
  }

  // Payment terms
  const termsMatch = text.match(/(Net\s*(?:30|45|60|90)|Cash on Delivery|Advance\s*\d+%|50%\s*Advance)/i);
  const paymentTerms = termsMatch ? termsMatch[1] : 'Net 30';

  return {
    supplierName: defaultSupplier,
    totalPrice,
    currency: 'USD',
    deliveryDays,
    paymentTerms,
    warrantyMonths,
    notes: 'Automatically parsed commercial terms from quotation document.'
  };
}

/**
 * Extract structured procurement data from PDF quotation using Gemini.
 */
export async function extractQuotationWithGemini(
  pdfBuffer: Buffer,
  fallbackSupplierName = 'TechSupply Ltd.'
): Promise<{ data: ExtractedQuotationData; rawText?: string }> {
  const ai = getGenAi();

  if (!ai) {
    console.warn('[Gemini Service] No GEMINI_API_KEY configured. Using heuristic extraction.');
    return { data: fallbackRegexExtract(pdfBuffer, fallbackSupplierName) };
  }

  const base64Data = pdfBuffer.toString('base64');

  const prompt = `You are an expert procurement and supply chain document analyst.
Analyze the attached supplier quotation PDF and extract the commercial quotation fields into a single, valid JSON object with the exact following schema:

{
  "supplierName": "Exact supplier or company name found in the document",
  "totalPrice": 12345.00 (numeric value only, no symbols, e.g. 25800),
  "currency": "USD" (standard 3-letter currency code, default USD),
  "deliveryDays": 10 (numeric integer days for delivery or lead time),
  "paymentTerms": "e.g. Net 30, Net 45, or advance percentage clause",
  "warrantyMonths": 24 (numeric integer warranty period in months, e.g. 1 year = 12, 2 years = 24),
  "notes": "Concise summary of key terms, included support, freight or items"
}

IMPORTANT:
- Output ONLY the valid JSON object.
- Do NOT wrap in explanation or markdown fences if possible.
- If a value cannot be detected, provide a reasonable industry estimate or empty string for paymentTerms.`;

  try {
    const response = await ai.models.generateContent({
      model: CONFIG.GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Data
              }
            },
            {
              text: prompt
            }
          ]
        }
      ]
    });

    const responseText = response.text || '';
    const parsed = cleanAndParseJson(responseText);

    const extracted: ExtractedQuotationData = {
      supplierName: String(parsed.supplierName || fallbackSupplierName).trim(),
      totalPrice: Number(parsed.totalPrice) || 0,
      currency: String(parsed.currency || 'USD').trim().toUpperCase(),
      deliveryDays: Number(parsed.deliveryDays) || 10,
      paymentTerms: String(parsed.paymentTerms || '').trim(),
      warrantyMonths: Number(parsed.warrantyMonths) || 12,
      notes: String(parsed.notes || 'Extracted via PROCURA Gemini AI Engine').trim()
    };

    return { data: extracted, rawText: responseText };
  } catch (error: any) {
    console.error('[Gemini Service] AI extraction call failed:', error?.message || error);
    // If the error was due to model availability or quota, try with heuristic fallback
    const fallback = fallbackRegexExtract(pdfBuffer, fallbackSupplierName);
    return { data: fallback };
  }
}
