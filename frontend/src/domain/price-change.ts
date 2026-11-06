import { sanitizeKeyPart } from "./keys";
import { roundMoney } from "./money";

const RECEIPT_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERCENT_DECIMALS = 10;

export type PricePoint = {
  price: number;
  date: string;
  receiptId: string;
};

export type PriceChange = {
  price: number;
  previousPrice: number;
  delta: number;
  percent: number;
  date: string;
  receiptId: string;
};

export type RecordedPriceChange = PriceChange & {
  name: string;
  storeName: string;
  storeId: string;
};

function roundPercent(value: number): number {
  return Math.round(value * PERCENT_DECIMALS) / PERCENT_DECIMALS;
}

/**
 * Receipts are often photographed out of date order, so the series is sorted
 * by receipt date. Two lines for the same item on one receipt are one purchase.
 */
export function orderedPurchases(points: PricePoint[]): PricePoint[] {
  const usable = points.filter((point) =>
    RECEIPT_DATE.test(point.date) && Number.isFinite(point.price) && point.receiptId.trim().length > 0
  );
  const sorted = [...usable].sort((left, right) => {
    const date = left.date.localeCompare(right.date);
    if (date !== 0) return date;
    return left.receiptId.localeCompare(right.receiptId);
  });

  const series: PricePoint[] = [];
  for (const point of sorted) {
    const previous = series[series.length - 1];
    if (previous && previous.date === point.date && previous.receiptId === point.receiptId) continue;
    series.push(point);
  }
  return series;
}

export function latestPricePoint(points: PricePoint[]): PricePoint | null {
  const series = orderedPurchases(points);
  return series[series.length - 1] ?? null;
}

export function priceChangesFromHistory(points: PricePoint[]): PriceChange[] {
  const series = orderedPurchases(points);
  const changes: PriceChange[] = [];
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    if (previous.price <= 0) continue;
    const delta = roundMoney(current.price - previous.price);
    if (delta === 0) continue;
    changes.push({
      price: roundMoney(current.price),
      previousPrice: roundMoney(previous.price),
      delta,
      percent: roundPercent((delta / previous.price) * 100),
      date: current.date,
      receiptId: current.receiptId,
    });
  }
  return changes;
}

export function priceChangeRecordId(change: PriceChange): string {
  return `${change.date}_${sanitizeKeyPart(change.receiptId)}`;
}

export function priceChangeNode(
  changes: PriceChange[],
  details: { name: string; storeName: string; storeId: string },
): Record<string, RecordedPriceChange> | null {
  if (changes.length === 0) return null;
  const node: Record<string, RecordedPriceChange> = {};
  for (const change of changes) {
    node[priceChangeRecordId(change)] = { ...details, ...change };
  }
  return node;
}

export function currentYearMonth(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

export function priceChangesInMonth<T extends { date: string; name: string }>(rows: T[], month: string): T[] {
  const prefix = `${month}-`;
  return rows
    .filter((row) => row.date.startsWith(prefix))
    .sort((left, right) => {
      const date = right.date.localeCompare(left.date);
      if (date !== 0) return date;
      return left.name.localeCompare(right.name);
    });
}

export function formatPriceChange(change: PriceChange): string {
  const increased = change.delta > 0;
  const arrow = increased ? "▲" : "▼";
  const sign = increased ? "+" : "−";
  return `${arrow} ${formatSignedPrice(change.price)} (${sign}${Math.abs(change.percent).toFixed(1)}%)`;
}

function formatSignedPrice(amount: number): string {
  return `₱${Math.abs(amount).toFixed(2)}`;
}

export function priceChangeLabel(change: PriceChange): string {
  const direction = change.delta > 0 ? "Increased" : "Decreased";
  const sign = change.delta > 0 ? "plus" : "minus";
  return `${direction} to ₱${change.price.toFixed(2)}, ${sign} ${Math.abs(change.percent).toFixed(1)} percent. Was ₱${change.previousPrice.toFixed(2)}.`;
}
