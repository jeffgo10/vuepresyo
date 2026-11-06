import { formatPeso, roundMoney } from "./money";
import { latestPricePoint, type PricePoint } from "./price-change";

/** A latest price older than this many days is marked on the compare screen. */
export const STALE_PRICE_DAYS = 30;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MULTIPLIED_SIZE = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ml|l|kg|g)\b/gi;
const SINGLE_SIZE = /(\d+(?:\.\d+)?)\s*(ml|l|kg|g)\b/gi;
const PACK_COUNT = /(\d+)\s*[-]?\s*(pcs|pc|pieces|piece|sachets?|packs?|pk|pouches?|sticks?|boxes?|bx|bars?|rolls?|bottles?|btl|cans?|s)\b/gi;
const PACK_OF = /(?:box|pack|pouch|bag|case|bundle)\s+of\s+(\d+)\b/gi;
const SINGLE_UNIT_WORD = /\b(sachet|stick|pouch|piece)\b/i;

type Dimension = "volume" | "mass" | "count";

type Pack = {
  dimension: Dimension;
  /** Millilitres, grams, or pieces. */
  quantity: number;
};

export type CompareProduct = {
  key: string;
  name: string;
  rawName: string;
  storeId: string;
  productId: string | null;
  sku?: string | null;
  imagePath?: string | null;
  imagePaths?: string[] | null;
  unit?: string;
  productType?: string | null;
};

export type ComparedStorePrice = {
  itemKey: string;
  storeName: string;
  comparedPrice: number;
  delta: number;
  cheapest: boolean;
  expensive: boolean;
  stale: boolean;
  date: string;
  barPercent: number;
  shelfNote: string | null;
};

export type StoreComparison = {
  productId: string;
  name: string;
  basis: string;
  stores: ComparedStorePrice[];
};

type Offer = {
  itemKey: string;
  storeId: string;
  storeName: string;
  name: string;
  shelfPrice: number;
  date: string;
  receiptId: string;
  pack: Pack | null;
};

export function localIsoDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function priceIsStale(date: string, today: string, staleDays = STALE_PRICE_DAYS): boolean {
  const age = daysAfter(date, today);
  return age != null && age > staleDays;
}

/**
 * Pack size is not stored on the product. Receipts print it in the name
 * ("500ml", "1L", "10kg", "5s", "8 sachets", "Box of 8", "6 x 330ml").
 */
export function parsePackSize(text: string, unit?: string | null): Pack | null {
  const multiplied = lastMatch(text, MULTIPLIED_SIZE);
  if (multiplied) {
    const count = Number(multiplied[1]);
    const size = toBase(Number(multiplied[2]), multiplied[3]);
    if (count > 0 && size) return scale(size, count);
  }

  const packOfMatch = lastMatch(text, PACK_OF);
  if (packOfMatch) {
    const count = Number(packOfMatch[1]);
    if (count > 0) return { dimension: "count", quantity: count };
  }

  const sizeMatch = lastMatch(text, SINGLE_SIZE);
  const countMatch = lastMatch(text, PACK_COUNT);
  const size = sizeMatch ? toBase(Number(sizeMatch[1]), sizeMatch[2]) : null;
  const count = countMatch ? Number(countMatch[1]) : 0;

  if (size && count > 0) return scale(size, count);
  if (size) return size;
  if (count > 0) return { dimension: "count", quantity: count };
  if (SINGLE_UNIT_WORD.test(text)) {
    return { dimension: "count", quantity: 1 };
  }

  if (unit && unit.trim()) {
    const unitText = unit.trim();
    const packFromUnit = parsePackSize(unitText);
    if (packFromUnit) return packFromUnit;

    if (SINGLE_UNIT_WORD.test(unitText) || /^(sachet|stick|pouch|pc|piece|bar)$/i.test(unitText)) {
      return { dimension: "count", quantity: 1 };
    }
  }

  return null;
}

export function fairUnitPrice(
  shelfPrice: number,
  pack: Pack | null,
  packs: Array<Pack | null>,
): { comparedPrice: number; shelfNote: string | null } {
  const basis = comparisonBasis(packs);
  const effectivePack =
    pack ?? (basis.kind === "normalized" && basis.dimension === "count" ? { dimension: "count" as const, quantity: 1 } : null);
  const comparedPrice = roundMoney(comparedAmount(shelfPrice, effectivePack, basis));
  const shelfNote = basis.kind === "normalized" && effectivePack
    ? `Shelf price ${formatPeso(shelfPrice)} for ${packLabel(effectivePack)}`
    : null;
  return { comparedPrice, shelfNote };
}

export function storeComparisons(
  products: CompareProduct[],
  history: Record<string, PricePoint[]>,
  storeNames: Record<string, string>,
  today: string,
): StoreComparison[] {
  const grouped = new Map<string, Offer[]>();

  for (const product of products) {
    const productId = product.productId?.trim() ?? "";
    if (!productId) continue;
    const latest = latestPricePoint(history[product.key] ?? []);
    if (!latest || latest.price <= 0) continue;
    const offer: Offer = {
      itemKey: product.key,
      storeId: product.storeId,
      storeName: storeNames[product.storeId]?.trim() || product.storeId,
      name: product.name.trim() || product.rawName.trim(),
      shelfPrice: roundMoney(latest.price),
      date: latest.date,
      receiptId: latest.receiptId,
      pack: parsePackSize(product.name, product.unit) ?? parsePackSize(product.rawName, product.unit),
    };
    const offers = grouped.get(productId) ?? [];
    offers.push(offer);
    grouped.set(productId, offers);
  }

  const comparisons: StoreComparison[] = [];
  for (const [productId, offers] of grouped) {
    const stores = oneOfferPerStore(offers);
    if (stores.length < 2) continue;
    const comparison = compareOffers(productId, stores, today);
    if (comparison) comparisons.push(comparison);
  }

  return comparisons.sort((left, right) => left.name.localeCompare(right.name) || left.productId.localeCompare(right.productId));
}

function compareOffers(productId: string, offers: Offer[], today: string): StoreComparison | null {
  const basis = comparisonBasis(offers.map((offer) => offer.pack));
  const priced = offers.map((offer) => ({
    offer,
    comparedPrice: roundMoney(comparedAmount(offer.shelfPrice, offer.pack, basis)),
  }));
  const amounts = priced.map((row) => row.comparedPrice);
  const cheapestPrice = Math.min(...amounts);
  const highestPrice = Math.max(...amounts);
  const pricesDiffer = cheapestPrice < highestPrice;

  const stores = priced
    .map(({ offer, comparedPrice }) => ({
      itemKey: offer.itemKey,
      storeName: offer.storeName,
      comparedPrice,
      delta: roundMoney(comparedPrice - cheapestPrice),
      cheapest: pricesDiffer && comparedPrice === cheapestPrice,
      expensive: pricesDiffer && comparedPrice === highestPrice,
      stale: priceIsStale(offer.date, today),
      date: offer.date,
      barPercent: barWidth(comparedPrice, highestPrice),
      shelfNote: basis.kind === "normalized"
        ? `Shelf price ${formatPeso(offer.shelfPrice)} for ${packLabel(offer.pack ?? (basis.dimension === "count" ? { dimension: "count", quantity: 1 } : null))}`
        : null,
    }))
    .sort((left, right) => left.comparedPrice - right.comparedPrice || left.storeName.localeCompare(right.storeName));

  return {
    productId,
    name: displayName(offers),
    basis: basis.label,
    stores,
  };
}

type Basis =
  | { kind: "pack" | "shelf"; label: string }
  | { kind: "normalized"; label: string; dimension: Dimension; per: number };

function comparisonBasis(packs: Array<Pack | null>): Basis {
  const shelf = { kind: "shelf", label: "Latest unit price · VAT included" } as const;
  const known = packs.filter((pack): pack is Pack => pack != null);
  if (known.length === 0) return shelf;

  // When comparing count-based products, if some items have a multi-pack count (e.g. 8s box)
  // and another item has no count specified, infer the bare item as a single piece (quantity: 1).
  const effectivePacks = packs.map((pack) => {
    if (pack) return pack;
    if (known.every((p) => p.dimension === "count")) {
      return { dimension: "count" as const, quantity: 1 };
    }
    return null;
  });

  if (effectivePacks.some((p) => p == null)) return shelf;
  const resolvedPacks = effectivePacks as Pack[];

  const first = resolvedPacks[0];
  const dimension = first.dimension;
  if (resolvedPacks.some((pack) => pack.dimension !== dimension)) return shelf;
  const quantity = first.quantity;
  if (resolvedPacks.every((pack) => pack.quantity === quantity)) {
    return { kind: "pack", label: `Price per ${packLabel(resolvedPacks[0])} · VAT included` };
  }
  if (dimension === "volume") {
    return { kind: "normalized", label: "Price per 1L · VAT included", dimension, per: 1000 };
  }
  if (dimension === "mass") {
    return { kind: "normalized", label: "Price per 1kg · VAT included", dimension, per: 1000 };
  }
  return { kind: "normalized", label: "Price per piece · VAT included", dimension, per: 1 };
}

function comparedAmount(shelfPrice: number, pack: Pack | null, basis: Basis): number {
  if (basis.kind !== "normalized") return shelfPrice;
  const effectivePack = pack ?? (basis.dimension === "count" ? { dimension: "count" as const, quantity: 1 } : null);
  if (!effectivePack || effectivePack.quantity <= 0) return shelfPrice;
  return shelfPrice * (basis.per / effectivePack.quantity);
}

function displayName(offers: Offer[]): string {
  return [...offers].sort((left, right) => right.name.length - left.name.length || left.name.localeCompare(right.name))[0]?.name
    ?? "Item";
}

function oneOfferPerStore(offers: Offer[]): Offer[] {
  const byStore = new Map<string, Offer>();
  for (const offer of offers) {
    const current = byStore.get(offer.storeId);
    if (!current || isLaterPurchase(offer, current)) byStore.set(offer.storeId, offer);
  }
  return [...byStore.values()];
}

function isLaterPurchase(next: Offer, current: Offer): boolean {
  const date = next.date.localeCompare(current.date);
  if (date !== 0) return date > 0;
  return next.receiptId.localeCompare(current.receiptId) > 0;
}

function barWidth(price: number, highest: number): number {
  if (highest <= 0) return 0;
  return Math.max(1, Math.round((price / highest) * 100));
}

function packLabel(pack: Pack | null): string {
  if (!pack) return "1 pc";
  if (pack.dimension === "volume") return pack.quantity >= 1000 ? `${trimNumber(pack.quantity / 1000)}L` : `${trimNumber(pack.quantity)}ml`;
  if (pack.dimension === "mass") return pack.quantity >= 1000 ? `${trimNumber(pack.quantity / 1000)}kg` : `${trimNumber(pack.quantity)}g`;
  return pack.quantity === 1 ? "1 pc" : `${trimNumber(pack.quantity)} pcs`;
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function scale(pack: Pack, count: number): Pack | null {
  const quantity = Math.round(pack.quantity * count * 1000) / 1000;
  if (quantity <= 0) return null;
  return { dimension: pack.dimension, quantity };
}

function toBase(amount: number, unit: string): Pack | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const normalized = unit.toLowerCase();
  if (normalized === "ml") return { dimension: "volume", quantity: amount };
  if (normalized === "l") return { dimension: "volume", quantity: amount * 1000 };
  if (normalized === "g") return { dimension: "mass", quantity: amount };
  if (normalized === "kg") return { dimension: "mass", quantity: amount * 1000 };
  return null;
}

function lastMatch(text: string, pattern: RegExp): RegExpMatchArray | null {
  const matches = [...text.matchAll(pattern)];
  return matches[matches.length - 1] ?? null;
}

function daysAfter(earlier: string, later: string): number | null {
  const start = isoUtc(earlier);
  const end = isoUtc(later);
  if (start == null || end == null) return null;
  return Math.round((end - start) / 86_400_000);
}

function isoUtc(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return utc;
}
