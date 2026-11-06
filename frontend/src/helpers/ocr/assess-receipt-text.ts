const MIN_LETTER_COUNT = 8;
const SHORT_TEXT_LETTER_COUNT = 24;
const LOW_CONFIDENCE = 15;
const MIN_PRICE_COUNT = 2;
const MIN_DIGITS_WITH_KEYWORD = 6;

const PRICE_PATTERN = /\d{1,7}[.,]\d{2}/g;
const RECEIPT_KEYWORD =
  /\b(total|vat|vatable|invoice|subtotal|amount|qty|receipt|peso|php|cash|change|tendered|tender|sales)\b/i;
const STRONG_KEYWORD = /\b(total|vat|vatable|invoice|subtotal)\b/i;

export const UNREADABLE_PHOTO_MESSAGE =
  "This photo is too hard to read. Crop to the receipt and take a clearer picture.";
export const NOT_A_RECEIPT_MESSAGE =
  "This does not look like a receipt. Crop to the receipt and try again.";

export type ReceiptTextAssessment =
  | { ok: true }
  | { ok: false; code: "unreadable" | "not-receipt"; reason: string };

function letterCount(text: string): number {
  return text.match(/[a-z]/gi)?.length ?? 0;
}

function digitCount(text: string): number {
  return text.match(/\d/g)?.length ?? 0;
}

/**
 * Decides whether a photo is worth a Gemini call.
 * Confidence is only used to reject short, doubtful reads. Thermal receipt
 * photos often score low even when the prices are present, and those should
 * still go to Gemini.
 */
export function assessReceiptText(text: string, confidence: number | null): ReceiptTextAssessment {
  const normalized = text.replace(/\s+/g, " ").trim();
  const letters = letterCount(normalized);
  const confidenceIsLow = confidence != null && confidence < LOW_CONFIDENCE;
  if (letters < MIN_LETTER_COUNT || (confidenceIsLow && letters < SHORT_TEXT_LETTER_COUNT)) {
    return { ok: false, code: "unreadable", reason: UNREADABLE_PHOTO_MESSAGE };
  }

  const prices = normalized.match(PRICE_PATTERN)?.length ?? 0;
  const hasKeyword = RECEIPT_KEYWORD.test(normalized);
  const hasStrongKeyword = STRONG_KEYWORD.test(normalized);
  const looksLikeReceipt =
    prices >= MIN_PRICE_COUNT
    || (prices >= 1 && hasKeyword)
    || (hasStrongKeyword && digitCount(normalized) >= MIN_DIGITS_WITH_KEYWORD);

  if (!looksLikeReceipt) {
    return { ok: false, code: "not-receipt", reason: NOT_A_RECEIPT_MESSAGE };
  }
  return { ok: true };
}
