import { roundMoney } from "./money";
import { latestPricePoint, type PricePoint } from "./price-change";
import {
  fairUnitPrice,
  parsePackSize,
  priceIsStale,
  type CompareProduct,
} from "./store-compare";
import type { VatType } from "./types";

export type OtherStoreOffer = {
  itemKey: string;
  storeId: string;
  storeName: string;
  shelfPrice: number;
  comparedPrice: number;
  shelfNote: string | null;
  date: string;
  stale: boolean;
};

export type ReceiptItemPriceComparison = {
  isLowest: boolean;
  strictlyCheaper: boolean;
  savingsVsCheapest: number;
  deltaVsCheapest: number;
  currentComparedPrice: number;
  cheapestOtherOffer: OtherStoreOffer | null;
  otherStoresCount: number;
  otherStoreOffers: OtherStoreOffer[];
};

export type CompareReceiptItemParams = {
  itemKey: string;
  unitPrice: number;
  vatType?: VatType | null;
  receiptStoreId: string;
  products: CompareProduct[];
  history: Record<string, PricePoint[]>;
  storeNames: Record<string, string>;
  today: string;
};

const NO_COMPARISON: ReceiptItemPriceComparison = {
  isLowest: false,
  strictlyCheaper: false,
  savingsVsCheapest: 0,
  deltaVsCheapest: 0,
  currentComparedPrice: 0,
  cheapestOtherOffer: null,
  otherStoresCount: 0,
  otherStoreOffers: [],
};

/**
 * Checks whether the price of an item on a receipt is the lowest compared to
 * recent purchases of the same product at other stores.
 */
export function compareReceiptItemPrice({
  itemKey,
  unitPrice,
  vatType,
  receiptStoreId,
  products,
  history,
  storeNames,
  today,
}: CompareReceiptItemParams): ReceiptItemPriceComparison {
  if (vatType === "FREE" || unitPrice <= 0) {
    return NO_COMPARISON;
  }

  const anchor = products.find((product) => product.key === itemKey);
  if (!anchor) {
    return NO_COMPARISON;
  }

  const anchorProductId = anchor.productId?.trim() ?? null;
  const anchorSku = anchor.sku?.trim() ?? null;

  // Find candidate products from other stores representing the same item
  const candidates = products.filter((product) => {
    if (product.storeId === receiptStoreId) return false;
    if (anchorProductId && product.productId?.trim() === anchorProductId) return true;
    if (anchorSku && product.sku?.trim() === anchorSku) return true;
    return false;
  });

  if (candidates.length === 0) {
    return NO_COMPARISON;
  }

  const anchorPack = parsePackSize(anchor.name, anchor.unit) ?? parsePackSize(anchor.rawName, anchor.unit);

  // Collect candidate latest purchase points
  type CandidateDraft = {
    product: CompareProduct;
    latestPoint: PricePoint;
    pack: ReturnType<typeof parsePackSize>;
  };

  const drafts: CandidateDraft[] = [];
  for (const candidate of candidates) {
    const points = (history[candidate.key] ?? []).filter((point) => point.price > 0);
    const latest = latestPricePoint(points);
    if (!latest) continue;

    // Only consider recent purchases (not stale / older than 30 days)
    if (priceIsStale(latest.date, today)) continue;

    drafts.push({
      product: candidate,
      latestPoint: latest,
      pack: parsePackSize(candidate.name, candidate.unit) ?? parsePackSize(candidate.rawName, candidate.unit),
    });
  }

  if (drafts.length === 0) {
    return NO_COMPARISON;
  }

  // Deduplicate offers by store, keeping the most recent purchase date
  const byStore = new Map<string, CandidateDraft>();
  for (const draft of drafts) {
    const existing = byStore.get(draft.product.storeId);
    if (!existing || draft.latestPoint.date.localeCompare(existing.latestPoint.date) > 0) {
      byStore.set(draft.product.storeId, draft);
    }
  }

  const uniqueDrafts = [...byStore.values()];
  const allPacks = [anchorPack, ...uniqueDrafts.map((d) => d.pack)];

  const fairCurrent = fairUnitPrice(unitPrice, anchorPack, allPacks);
  const currentComparedPrice = roundMoney(fairCurrent.comparedPrice);

  const offers: OtherStoreOffer[] = uniqueDrafts.map((draft) => {
    const shelfPrice = roundMoney(draft.latestPoint.price);
    const fair = fairUnitPrice(shelfPrice, draft.pack, allPacks);
    const storeName = storeNames[draft.product.storeId]?.trim() || draft.product.storeId;

    return {
      itemKey: draft.product.key,
      storeId: draft.product.storeId,
      storeName,
      shelfPrice,
      comparedPrice: roundMoney(fair.comparedPrice),
      shelfNote: fair.shelfNote,
      date: draft.latestPoint.date,
      stale: false,
    };
  });

  offers.sort((left, right) => left.comparedPrice - right.comparedPrice || left.storeName.localeCompare(right.storeName));

  const cheapestOtherOffer = offers[0] ?? null;
  if (!cheapestOtherOffer) {
    return NO_COMPARISON;
  }

  const isLowest = currentComparedPrice <= cheapestOtherOffer.comparedPrice;
  const strictlyCheaper = currentComparedPrice < cheapestOtherOffer.comparedPrice;
  const savingsVsCheapest = strictlyCheaper
    ? roundMoney(cheapestOtherOffer.comparedPrice - currentComparedPrice)
    : 0;
  const deltaVsCheapest = currentComparedPrice > cheapestOtherOffer.comparedPrice
    ? roundMoney(currentComparedPrice - cheapestOtherOffer.comparedPrice)
    : 0;

  return {
    isLowest,
    strictlyCheaper,
    savingsVsCheapest,
    deltaVsCheapest,
    currentComparedPrice,
    cheapestOtherOffer,
    otherStoresCount: offers.length,
    otherStoreOffers: offers,
  };
}
