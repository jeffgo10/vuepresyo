import { roundMoney } from "./money";
import { latestPricePoint, type PricePoint } from "./price-change";
import { cleanSku } from "./sku-matcher";
import {
  fairUnitPrice,
  parsePackSize,
  type CompareProduct,
} from "./store-compare";
import type { SavedReceipt } from "./types";

export type StoreInput = {
  id: string;
  name: string;
  branch: string | null;
};

export type SavedReceiptRow = SavedReceipt & { id: string };

export type CheapestProductOffer = {
  name: string;
  comparedPrice: number;
  shelfPrice: number;
  shelfNote: string | null;
};

export type StoreCheapnessReport = {
  storeId: string;
  storeName: string;
  branch: string | null;
  totalComparedItems: number;
  cheapestItemCount: number;
  cheapestPercentage: number;
  isMostlyCheap: boolean;
  rank: number;
  cheapestProducts: CheapestProductOffer[];
  receiptCount: number;
  lastReceiptDate: string | null;
  totalSpent: number;
};

export type StoreRankingSummary = {
  stores: StoreCheapnessReport[];
  cheapestStore: StoreCheapnessReport | null;
  totalComparedProducts: number;
};

type CandidateOffer = {
  storeId: string;
  storeName: string;
  productName: string;
  shelfPrice: number;
  date: string;
  pack: ReturnType<typeof parsePackSize>;
};

export function sortReceiptsNewestFirst(rows: SavedReceiptRow[]): SavedReceiptRow[] {
  return [...rows].sort((left, right) => {
    const dateComp = right.date.localeCompare(left.date);
    if (dateComp !== 0) return dateComp;
    return (right.time ?? "").localeCompare(left.time ?? "");
  });
}

/**
 * Normalizes store catalog entries and receipt records into a deduplicated store list.
 */
export function collectKnownStores(
  stores: StoreInput[] | null | undefined,
  storeNames: Record<string, string> | null | undefined,
  receipts: SavedReceiptRow[] | null | undefined,
  products: CompareProduct[] | null | undefined,
): StoreInput[] {
  const byId = new Map<string, StoreInput>();

  // 1. From explicit store catalog
  for (const store of stores ?? []) {
    const id = store.id?.trim();
    if (!id) continue;
    byId.set(id, {
      id,
      name: store.name?.trim() || id,
      branch: store.branch?.trim() || null,
    });
  }

  // 2. From storeNames mapping
  for (const [id, name] of Object.entries(storeNames ?? {})) {
    const trimmedId = id.trim();
    if (!trimmedId) continue;
    const existing = byId.get(trimmedId);
    if (!existing) {
      byId.set(trimmedId, {
        id: trimmedId,
        name: name.trim() || trimmedId,
        branch: null,
      });
    }
  }

  // 3. From receipts
  for (const receipt of receipts ?? []) {
    const id = receipt.storeId?.trim();
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, {
        id,
        name: receipt.storeName?.trim() || id,
        branch: receipt.branch?.trim() || null,
      });
    } else if (!existing.branch && receipt.branch?.trim()) {
      existing.branch = receipt.branch.trim();
    }
  }

  // 4. From products
  for (const product of products ?? []) {
    const id = product.storeId?.trim();
    if (!id) continue;
    if (!byId.has(id)) {
      const name = (storeNames && storeNames[id]) || id;
      byId.set(id, { id, name, branch: null });
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * Analyzes cross-store price comparisons to determine which store has the mostly cheap items,
 * along with receipt statistics for each store.
 */
export function computeStoreRankings({
  stores,
  products,
  history,
  storeNames = {},
  receipts = [],
}: {
  stores: StoreInput[] | null | undefined;
  products: CompareProduct[] | null | undefined;
  history: Record<string, PricePoint[]> | null | undefined;
  storeNames?: Record<string, string>;
  receipts?: SavedReceiptRow[];
}): StoreRankingSummary {
  const allStores = collectKnownStores(stores, storeNames, receipts, products);
  const sortedReceipts = sortReceiptsNewestFirst(receipts ?? []);

  // Map receipts by storeId
  const receiptsByStore = new Map<string, SavedReceiptRow[]>();
  for (const r of sortedReceipts) {
    const list = receiptsByStore.get(r.storeId) ?? [];
    list.push(r);
    receiptsByStore.set(r.storeId, list);
  }

  // Group products by comparison identity across stores
  // Group by productId if present, otherwise by cleaned SKU if present
  const groupedProducts = new Map<string, CompareProduct[]>();
  for (const prod of products ?? []) {
    const productId = prod.productId?.trim();
    const sku = cleanSku(prod.sku);

    let groupKey: string | null = null;
    if (productId) {
      groupKey = `product:${productId}`;
    } else if (sku && sku.length >= 4) {
      groupKey = `sku:${sku}`;
    }

    if (!groupKey) continue;
    const list = groupedProducts.get(groupKey) ?? [];
    list.push(prod);
    groupedProducts.set(groupKey, list);
  }

  // Store performance counters
  type StoreScore = {
    totalCompared: number;
    cheapestCount: number;
    cheapestItems: CheapestProductOffer[];
  };

  const storeScores = new Map<string, StoreScore>();
  for (const s of allStores) {
    storeScores.set(s.id, {
      totalCompared: 0,
      cheapestCount: 0,
      cheapestItems: [],
    });
  }

  let totalComparedProducts = 0;

  // Evaluate each cross-store product comparison
  for (const [, items] of groupedProducts) {
    // Collect latest offer per store
    const storeCandidateMap = new Map<string, CandidateOffer>();

    for (const item of items) {
      const points = (history?.[item.key] ?? []).filter((p) => p.price > 0);
      const latest = latestPricePoint(points);
      if (!latest || latest.price <= 0) continue;

      const storeId = item.storeId;
      const storeName = storeNames[storeId]?.trim() || storeId;
      const productName = item.name.trim() || item.rawName.trim() || "Item";
      const pack = parsePackSize(item.name, item.unit) ?? parsePackSize(item.rawName, item.unit);

      const existing = storeCandidateMap.get(storeId);
      // Keep newest price point if store has multiple entries for same item
      if (!existing || latest.date.localeCompare(existing.date) > 0) {
        storeCandidateMap.set(storeId, {
          storeId,
          storeName,
          productName,
          shelfPrice: roundMoney(latest.price),
          date: latest.date,
          pack,
        });
      }
    }

    const candidates = [...storeCandidateMap.values()];
    // Only compare if 2 or more distinct stores offer this product
    if (candidates.length < 2) continue;

    totalComparedProducts += 1;
    const allPacks = candidates.map((c) => c.pack);

    // Compute normalized / fair price for each store
    const pricedOffers = candidates.map((cand) => {
      const fair = fairUnitPrice(cand.shelfPrice, cand.pack, allPacks);
      return {
        ...cand,
        comparedPrice: roundMoney(fair.comparedPrice),
        shelfNote: fair.shelfNote,
      };
    });

    const prices = pricedOffers.map((o) => o.comparedPrice);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const pricesDiffer = minPrice < maxPrice;

    // Credit stats to participating stores
    for (const offer of pricedOffers) {
      const score = storeScores.get(offer.storeId);
      if (!score) continue;

      score.totalCompared += 1;

      if (pricesDiffer && offer.comparedPrice === minPrice) {
        score.cheapestCount += 1;
        score.cheapestItems.push({
          name: offer.productName,
          comparedPrice: offer.comparedPrice,
          shelfPrice: offer.shelfPrice,
          shelfNote: offer.shelfNote,
        });
      }
    }
  }

  // Build report for each store
  const storeReports: StoreCheapnessReport[] = allStores.map((store) => {
    const score = storeScores.get(store.id) ?? {
      totalCompared: 0,
      cheapestCount: 0,
      cheapestItems: [],
    };
    const storeReceipts = receiptsByStore.get(store.id) ?? [];
    const totalSpent = roundMoney(storeReceipts.reduce((sum, r) => sum + (r.total || 0), 0));
    const lastReceiptDate = storeReceipts[0]?.date ?? null;

    const cheapestPercentage =
      score.totalCompared > 0
        ? Math.round((score.cheapestCount / score.totalCompared) * 1000) / 10
        : 0;

    return {
      storeId: store.id,
      storeName: store.name,
      branch: store.branch,
      totalComparedItems: score.totalCompared,
      cheapestItemCount: score.cheapestCount,
      cheapestPercentage,
      isMostlyCheap: false, // set below after ranking
      rank: 999,
      cheapestProducts: score.cheapestItems,
      receiptCount: storeReceipts.length,
      lastReceiptDate,
      totalSpent,
    };
  });

  // Rank stores:
  // First priority: stores with compared items and cheapest items, ranked by cheapestPercentage desc, then cheapestItemCount desc
  // Second priority: stores with compared items but 0 cheapest
  // Third priority: stores with 0 compared items, sorted by receipt count desc, then name asc
  storeReports.sort((a, b) => {
    const aHasComp = a.totalComparedItems > 0;
    const bHasComp = b.totalComparedItems > 0;

    if (aHasComp && bHasComp) {
      const pctDiff = b.cheapestPercentage - a.cheapestPercentage;
      if (pctDiff !== 0) return pctDiff;
      const countDiff = b.cheapestItemCount - a.cheapestItemCount;
      if (countDiff !== 0) return countDiff;
      const totalCompDiff = b.totalComparedItems - a.totalComparedItems;
      if (totalCompDiff !== 0) return totalCompDiff;
    } else if (aHasComp !== bHasComp) {
      return aHasComp ? -1 : 1;
    }

    const rcDiff = b.receiptCount - a.receiptCount;
    if (rcDiff !== 0) return rcDiff;
    return a.storeName.localeCompare(b.storeName);
  });

  // Assign ranks
  storeReports.forEach((store, idx) => {
    store.rank = idx + 1;
  });

  // Determine mostly cheap store
  // A store is "mostly cheap" if it has compared items, has cheapest items, and is top-ranked
  const topCandidate = storeReports[0];
  let cheapestStore: StoreCheapnessReport | null = null;

  if (topCandidate && topCandidate.totalComparedItems > 0 && topCandidate.cheapestItemCount > 0) {
    cheapestStore = topCandidate;
    topCandidate.isMostlyCheap = true;

    // Also mark any ties with the exact same top percentage & count
    for (let i = 1; i < storeReports.length; i++) {
      const other = storeReports[i];
      if (
        other.totalComparedItems > 0 &&
        other.cheapestPercentage === topCandidate.cheapestPercentage &&
        other.cheapestItemCount === topCandidate.cheapestItemCount
      ) {
        other.isMostlyCheap = true;
      } else {
        break;
      }
    }
  }

  return {
    stores: storeReports,
    cheapestStore,
    totalComparedProducts,
  };
}
