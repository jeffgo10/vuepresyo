import { roundMoney } from "./money";
import { orderedPurchases, type PricePoint } from "./price-change";
import {
  fairUnitPrice,
  parsePackSize,
  priceIsStale,
  type CompareProduct,
} from "./store-compare";

export type ProductFeedbackSummary = {
  rating?: number;
  reviewCount?: number;
  isRecommended?: boolean;
};

export type ComparedProductTypeEntry = {
  productId: string | null;
  itemKey: string;
  productName: string;
  storeId: string;
  storeName: string;
  shelfPrice: number;
  shelfNote: string | null;
  comparedPrice: number;
  delta: number;
  cheapest: boolean;
  expensive: boolean;
  stale: boolean;
  date: string;
  barPercent: number;
  imagePath?: string | null;
  feedback?: ProductFeedbackSummary | null;
};

export type ProductTypeComparison = {
  productType: string;
  basis: string;
  entries: ComparedProductTypeEntry[];
};

type ProductCandidateOffer = {
  productId: string | null;
  itemKey: string;
  productName: string;
  storeId: string;
  storeName: string;
  shelfPrice: number;
  date: string;
  receiptId: string;
  imagePath: string | null;
  pack: ReturnType<typeof parsePackSize>;
  feedback: ProductFeedbackSummary | null;
};

export function productTypeComparisons(
  products: CompareProduct[],
  history: Record<string, PricePoint[]>,
  storeNames: Record<string, string>,
  today: string,
): ProductTypeComparison[] {
  // 1. Group products by sanitized productType
  const byType = new Map<string, { label: string; products: CompareProduct[] }>();

  for (const product of products) {
    const rawType = product.productType?.trim();
    if (!rawType) continue;

    const key = rawType.toLowerCase();
    const existing = byType.get(key);
    if (existing) {
      existing.products.push(product);
    } else {
      byType.set(key, { label: rawType, products: [product] });
    }
  }

  const results: ProductTypeComparison[] = [];

  for (const [, { label, products: typeProducts }] of byType) {
    // 2. Collapse products sharing the same productId into a single representative offer (the cheapest latest price)
    const byProductEntity = new Map<string, ProductCandidateOffer[]>();

    for (const prod of typeProducts) {
      const purchases = orderedPurchases(history[prod.key] ?? []).filter((p) => p.price > 0);
      const latest = purchases[purchases.length - 1];
      if (!latest) continue;

      const entityId = prod.productId?.trim() ? `product:${prod.productId.trim()}` : `item:${prod.key}`;
      const offer: ProductCandidateOffer = {
        productId: prod.productId?.trim() || null,
        itemKey: prod.key,
        productName: prod.name.trim() || prod.rawName.trim() || "Item",
        storeId: prod.storeId,
        storeName: storeNames[prod.storeId]?.trim() || prod.storeId,
        shelfPrice: roundMoney(latest.price),
        date: latest.date,
        receiptId: latest.receiptId,
        imagePath: prod.imagePath ?? (prod.imagePaths && prod.imagePaths[0]) ?? null,
        pack: parsePackSize(prod.name, prod.unit) ?? parsePackSize(prod.rawName, prod.unit),
        feedback: null, // Ready for future user feedback integration
      };

      const offers = byProductEntity.get(entityId) ?? [];
      offers.push(offer);
      byProductEntity.set(entityId, offers);
    }

    // Must compare at least 2 distinct products
    if (byProductEntity.size < 2) continue;

    // Pick the best offer per product entity (cheapest shelf price among latest store purchases)
    const candidates: ProductCandidateOffer[] = [];
    for (const [, offers] of byProductEntity) {
      const best = [...offers].sort((a, b) => a.shelfPrice - b.shelfPrice || b.date.localeCompare(a.date))[0];
      if (best) candidates.push(best);
    }

    if (candidates.length < 2) continue;

    const packs = candidates.map((c) => c.pack);
    const priced = candidates.map((candidate) => {
      const fair = fairUnitPrice(candidate.shelfPrice, candidate.pack, packs);
      return {
        candidate,
        comparedPrice: fair.comparedPrice,
        shelfNote: fair.shelfNote,
      };
    });

    const amounts = priced.map((r) => r.comparedPrice);
    const cheapestPrice = Math.min(...amounts);
    const highestPrice = Math.max(...amounts);
    const pricesDiffer = cheapestPrice < highestPrice;

    const entries: ComparedProductTypeEntry[] = priced
      .map(({ candidate, comparedPrice, shelfNote }) => ({
        productId: candidate.productId,
        itemKey: candidate.itemKey,
        productName: candidate.productName,
        storeId: candidate.storeId,
        storeName: candidate.storeName,
        shelfPrice: candidate.shelfPrice,
        shelfNote,
        comparedPrice,
        delta: roundMoney(comparedPrice - cheapestPrice),
        cheapest: pricesDiffer && comparedPrice === cheapestPrice,
        expensive: pricesDiffer && comparedPrice === highestPrice,
        stale: priceIsStale(candidate.date, today),
        date: candidate.date,
        barPercent: barWidth(comparedPrice, highestPrice),
        imagePath: candidate.imagePath,
        feedback: candidate.feedback,
      }))
      .sort((a, b) => a.comparedPrice - b.comparedPrice || a.productName.localeCompare(b.productName));

    const basisLabel = entries[0]?.shelfNote
      ? deriveBasisLabel(packs)
      : "Latest shelf price · VAT included";

    results.push({
      productType: label,
      basis: basisLabel,
      entries,
    });
  }

  return results.sort((a, b) => a.productType.localeCompare(b.productType));
}

function deriveBasisLabel(packs: Array<ReturnType<typeof parsePackSize>>): string {
  const known = packs.filter((p): p is NonNullable<typeof p> => p != null);
  if (known.length === 0 || known.length !== packs.length) {
    return "Latest unit price · VAT included";
  }
  const dimension = known[0].dimension;
  if (known.some((p) => p.dimension !== dimension)) {
    return "Latest unit price · VAT included";
  }
  if (dimension === "volume") return "Price per 1L · VAT included";
  if (dimension === "mass") return "Price per 1kg · VAT included";
  return "Price per piece · VAT included";
}

function barWidth(price: number, highest: number): number {
  if (highest <= 0) return 0;
  return Math.max(1, Math.round((price / highest) * 100));
}
