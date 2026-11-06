import { moneyClose, roundMoney } from "./money";
import {
  MONEY_TOLERANCE,
  VAT_DENOMINATOR,
  VAT_NUMERATOR,
  type ExtractedReceipt,
  type ValidationIssue,
  type ValidationResult,
} from "./types";

function vatPortion(vatableLineSum: number): number {
  return roundMoney((vatableLineSum * VAT_NUMERATOR) / VAT_DENOMINATOR);
}

/**
 * Philippine receipts print VAT-inclusive prices.
 * Do not check subtotal + VAT = total. That identity is for US-style receipts.
 */
export function validateReceipt(receipt: ExtractedReceipt): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (receipt.items.length === 0) {
    issues.push({ code: "empty", message: "Add at least one line." });
  }

  const lineSum = roundMoney(receipt.items.reduce((sum, line) => sum + line.lineTotal, 0));
  if (!moneyClose(lineSum, receipt.totals.total, MONEY_TOLERANCE)) {
    issues.push({
      code: "line_sum",
      message: `Line totals add up to ${lineSum.toFixed(2)}, but the receipt total is ${receipt.totals.total.toFixed(2)}.`,
    });
  }

  const vatableSum = receipt.items
    .filter((line) => line.vatType === "VAT")
    .reduce((sum, line) => sum + line.lineTotal, 0);
  if (receipt.totals.vat != null) {
    const expectedVat = vatPortion(vatableSum);
    if (!moneyClose(expectedVat, receipt.totals.vat, MONEY_TOLERANCE)) {
      issues.push({
        code: "vat_amount",
        message: `VATable lines imply VAT ${expectedVat.toFixed(2)}, but the receipt prints ${receipt.totals.vat.toFixed(2)}.`,
      });
    }
  }

  const vatableNet = receipt.totals.vatableNet ?? 0;
  const vat = receipt.totals.vat ?? 0;
  const parts = roundMoney(vatableNet + receipt.totals.vatExemptSales + vat);
  if (!moneyClose(parts, receipt.totals.total, MONEY_TOLERANCE)) {
    issues.push({
      code: "total_parts",
      message: `VATable net, VAT-exempt, and VAT add up to ${parts.toFixed(2)}, but the total is ${receipt.totals.total.toFixed(2)}.`,
    });
  }

  for (const line of receipt.items) {
    if (line.vatType === "FREE" && line.lineTotal !== 0) {
      issues.push({
        code: "free_price",
        message: `${line.name} is marked free but has a price.`,
      });
    }
    if (line.flags.length > 0) {
      issues.push({
        code: "flags",
        message: `${line.name} needs a look (${line.flags.join(", ")}).`,
      });
    }
  }

  const blocking = issues.filter((issue) => issue.code !== "flags");
  return {
    ok: blocking.length === 0,
    needsReview: issues.length > 0,
    issues,
  };
}

/**
 * Calculates a human-readable discrepancy note when receipt line totals,
 * VAT, or tax breakdown do not reconcile with the printed receipt total.
 */
export function getReceiptDiscrepancy(receipt: ExtractedReceipt): string | null {
  const lineSum = roundMoney(receipt.items.reduce((sum, line) => sum + line.lineTotal, 0));
  const total = receipt.totals.total;

  const notes: string[] = [];
  if (!moneyClose(lineSum, total, MONEY_TOLERANCE)) {
    const diff = roundMoney(lineSum - total);
    const diffSign = diff > 0 ? "+" : "";
    notes.push(
      `Line totals sum to ₱${lineSum.toFixed(2)}, but receipt total is ₱${total.toFixed(2)} (diff: ${diffSign}₱${diff.toFixed(2)})`,
    );
  }

  const vatableSum = receipt.items
    .filter((line) => line.vatType === "VAT")
    .reduce((sum, line) => sum + line.lineTotal, 0);
  if (receipt.totals.vat != null) {
    const expectedVat = vatPortion(vatableSum);
    if (!moneyClose(expectedVat, receipt.totals.vat, MONEY_TOLERANCE)) {
      notes.push(
        `VATable lines imply VAT ₱${expectedVat.toFixed(2)}, but receipt prints ₱${receipt.totals.vat.toFixed(2)}`,
      );
    }
  }

  const vatableNet = receipt.totals.vatableNet ?? 0;
  const vat = receipt.totals.vat ?? 0;
  const parts = roundMoney(vatableNet + receipt.totals.vatExemptSales + vat);
  if (!moneyClose(parts, total, MONEY_TOLERANCE)) {
    notes.push(
      `Tax breakdown adds up to ₱${parts.toFixed(2)}, differing from total ₱${total.toFixed(2)}`,
    );
  }

  return notes.length > 0 ? notes.join(" · ") : null;
}

/**
 * Determines whether a receipt meets the minimum criteria to be saved.
 * Math/total discrepancies do not block saving, but empty items or invalid free lines do.
 */
export function canSaveReceipt(receipt: ExtractedReceipt): { canSave: boolean; reason?: string } {
  if (receipt.items.length === 0) {
    return { canSave: false, reason: "Add at least one line." };
  }
  for (const line of receipt.items) {
    if (line.vatType === "FREE" && line.lineTotal !== 0) {
      return { canSave: false, reason: `${line.name} is marked free but has a price.` };
    }
  }
  return { canSave: true };
}

