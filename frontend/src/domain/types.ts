/** VAT-inclusive line. The printed VAT portion of a VATable line is lineTotal × 12/112. */
export const VAT_NUMERATOR = 12;
export const VAT_DENOMINATOR = 112;

/** Printed peso amounts are cents. A few centavos of rounding across lines is expected. */
export const MONEY_TOLERANCE = 0.05;

export const GROUP_ID = "GO";

export const LINE_FLAGS = [
  "struck_through",
  "unclear_name",
  "unclear_price",
  "unclear_sku",
] as const;

export const VAT_TYPES = ["VAT", "EXEMPT", "FREE"] as const;

export type LineFlag = (typeof LINE_FLAGS)[number];
export type VatType = (typeof VAT_TYPES)[number];

export type ReceiptLine = {
  sku: string | null;
  rawName: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  vatType: VatType | null;
  flags: LineFlag[];
  unit?: string;
  productId?: string | null;
  linkedItemKey?: string | null;
};

export type ReceiptTotals = {
  subtotal: number | null;
  vatableNet: number | null;
  vatExemptSales: number;
  vat: number | null;
  total: number;
};

export type ReceiptStore = {
  id?: string | null;
  name: string;
  branch: string | null;
  date: string;
  time: string | null;
  invoiceNo: string | null;
};

export type ExtractedReceipt = {
  store: ReceiptStore;
  items: ReceiptLine[];
  totals: ReceiptTotals;
};

export type ValidationCode =
  | "line_sum"
  | "vat_amount"
  | "total_parts"
  | "flags"
  | "free_price"
  | "empty";

export type ValidationIssue = {
  code: ValidationCode;
  message: string;
};

export type ValidationResult = {
  /** Math checks passed. Flags still require a human look, but they do not block save. */
  ok: boolean;
  needsReview: boolean;
  issues: ValidationIssue[];
};

export type SavedReceipt = {
  groupId: string;
  storeId: string;
  storeName: string;
  branch: string | null;
  date: string;
  time: string | null;
  invoiceNo: string | null;
  vatableNet: number | null;
  vatExemptSales: number;
  vat: number | null;
  total: number;
  imagePath: string | null;
  createdBy: string;
  createdByName: string;
  itemCount: number;
  discrepancyNote?: string | null;
};
