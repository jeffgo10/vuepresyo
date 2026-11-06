export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function moneyClose(left: number, right: number, tolerance: number): boolean {
  return Math.abs(left - right) <= tolerance;
}

export function lineTotalFor(qty: number, unitPrice: number): number {
  return roundMoney(qty * unitPrice);
}

export function formatPeso(amount: number): string {
  const sign = amount < 0 ? "−" : "";
  return `${sign}₱${Math.abs(amount).toFixed(2)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format YYYY-MM-DD without passing through UTC midnight. */
export function formatReceiptDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const month = MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  if (!month || !day) return isoDate;
  return `${month} ${day}`;
}
