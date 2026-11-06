import { lineTotalFor, roundMoney } from "./money";
import {
  LINE_FLAGS,
  VAT_TYPES,
  type ExtractedReceipt,
  type LineFlag,
  type ReceiptLine,
  type VatType,
} from "./types";

const FLAG_SET = new Set<string>(LINE_FLAGS);
const VAT_SET = new Set<string>(VAT_TYPES);

export function displayNameFromRaw(rawName: string): string {
  return rawName
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is missing`);
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }
  return value;
}

function asNullableNumber(value: unknown, label: string): number | null {
  if (value == null) return null;
  return asNumber(value, label);
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is missing`);
  }
  return value.trim();
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asVatType(value: unknown): VatType | null {
  if (value == null) return null;
  if (typeof value === "string" && VAT_SET.has(value)) return value as VatType;
  return null;
}

function asFlags(value: unknown): LineFlag[] {
  if (!Array.isArray(value)) return [];
  const flags: LineFlag[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && FLAG_SET.has(entry) && !flags.includes(entry as LineFlag)) {
      flags.push(entry as LineFlag);
    }
  }
  return flags;
}

function normalizeLine(value: unknown, index: number): ReceiptLine {
  const row = asRecord(value, `Item ${index + 1}`);
  const rawName = asString(row.rawName, `Item ${index + 1} name`);
  const qty = asNumber(row.qty, `Item ${index + 1} quantity`);
  const unitPrice = asNumber(row.unitPrice, `Item ${index + 1} price`);
  const lineTotal = asNumber(row.lineTotal, `Item ${index + 1} line total`);
  const name = asNullableString(row.name) ?? displayNameFromRaw(rawName);
  return {
    sku: asNullableString(row.sku),
    rawName,
    name,
    qty,
    unitPrice,
    lineTotal,
    vatType: asVatType(row.vatType),
    flags: asFlags(row.flags),
    unit: asNullableString(row.unit) ?? undefined,
    productId: asNullableString(row.productId),
    linkedItemKey: asNullableString(row.linkedItemKey),
  };
}

/**
 * Turn a Gemini JSON object into a receipt. Buyer name, address, and TIN are
 * not part of the schema and are ignored if a model adds them.
 */
export function normalizeExtraction(input: unknown): ExtractedReceipt {
  const record = asRecord(input, "Extraction");
  if (typeof record.error === "string" && record.error.trim()) {
    throw new Error(record.error.trim());
  }

  if (!Array.isArray(record.items) || record.items.length === 0) {
    throw new Error("No items were found on the receipt");
  }

  const items = record.items.map((item, index) => normalizeLine(item, index));
  const lineSum = roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0));

  const storeRecord = record.store && typeof record.store === "object" && !Array.isArray(record.store)
    ? (record.store as Record<string, unknown>)
    : null;

  const totalsRecord = record.totals && typeof record.totals === "object" && !Array.isArray(record.totals)
    ? (record.totals as Record<string, unknown>)
    : null;

  const rawTotal = totalsRecord?.total;
  const total = typeof rawTotal === "number" && Number.isFinite(rawTotal)
    ? rawTotal
    : lineSum;

  return {
    store: {
      id: asNullableString(storeRecord?.id),
      name: asNullableString(storeRecord?.name) ?? "Unknown Store",
      branch: asNullableString(storeRecord?.branch),
      date: asNullableString(storeRecord?.date) ?? new Date().toISOString().slice(0, 10),
      time: asNullableString(storeRecord?.time),
      invoiceNo: asNullableString(storeRecord?.invoiceNo),
    },
    items,
    totals: {
      subtotal: asNullableNumber(totalsRecord?.subtotal, "Subtotal"),
      vatableNet: asNullableNumber(totalsRecord?.vatableNet, "VATable net"),
      vatExemptSales: asNullableNumber(totalsRecord?.vatExemptSales, "VAT-exempt sales") ?? 0,
      vat: asNullableNumber(totalsRecord?.vat, "VAT"),
      total,
    },
  };
}

export function withRecalculatedLine(line: ReceiptLine, patch: Partial<ReceiptLine>): ReceiptLine {
  const next: ReceiptLine = { ...line, ...patch, flags: patch.flags ?? line.flags };
  if (next.vatType === "FREE") {
    next.unitPrice = 0;
    next.lineTotal = 0;
    return next;
  }
  if (patch.qty != null || patch.unitPrice != null) {
    next.lineTotal = lineTotalFor(next.qty, next.unitPrice);
  }
  return next;
}
