import { roundMoney } from "./money";
import { orderedPurchases, type PricePoint } from "./price-change";
import {
  fairUnitPrice,
  parsePackSize,
  priceIsStale,
  type CompareProduct,
} from "./store-compare";

export const ITEM_SORTS = ["most-bought", "least-bought", "name", "lowest-price", "highest-price"] as const;

export type ItemSort = (typeof ITEM_SORTS)[number];

export type ItemQuery = {
  search: string;
  storeId: string | null;
  sort: ItemSort;
};

export type CatalogOffer = {
  storeId: string;
  storeName: string;
  purchases: number;
  enlistments: number;
  shelfPrice: number;
  comparedPrice: number;
  shelfNote: string | null;
  date: string;
  stale: boolean;
};

export type CatalogItem = {
  id: string;
  name: string;
  offers: CatalogOffer[];
};

export type ItemListing = {
  id: string;
  name: string;
  purchases: number;
  enlistments: number;
  isEnlistedOnly: boolean;
  storeId: string;
  storeName: string;
  price: number;
  cheapest: boolean;
  stale: boolean;
  shelfNote: string | null;
};

type StoreOffer = {
  itemKey: string;
  storeId: string;
  storeName: string;
  name: string;
  shelfPrice: number;
  date: string;
  receiptId: string;
  purchases: number;
  enlistments: number;
  pack: ReturnType<typeof parsePackSize>;
};

export function itemCatalog(
  products: CompareProduct[],
  history: Record<string, PricePoint[]>,
  storeNames: Record<string, string>,
  today: string,
): CatalogItem[] {
  const grouped = new Map<string, StoreOffer[]>();

  for (const product of products) {
    const purchases = orderedPurchases(history[product.key] ?? []).filter((point) => point.price > 0);
    const latest = purchases[purchases.length - 1];
    if (!latest) continue;
    const productId = product.productId?.trim() ?? "";
    const id = productId ? `product:${productId}` : `item:${product.key}`;
    const actualPurchases = purchases.filter((p) => !p.receiptId.startsWith("enlist")).length;
    const enlistments = purchases.filter((p) => p.receiptId.startsWith("enlist")).length;

    const offer: StoreOffer = {
      itemKey: product.key,
      storeId: product.storeId,
      storeName: storeNames[product.storeId]?.trim() || product.storeId,
      name: product.name.trim() || product.rawName.trim() || "Item",
      shelfPrice: roundMoney(latest.price),
      date: latest.date,
      receiptId: latest.receiptId,
      purchases: actualPurchases,
      enlistments,
      pack: parsePackSize(product.name, product.unit) ?? parsePackSize(product.rawName, product.unit),
    };
    const offers = grouped.get(id) ?? [];
    offers.push(offer);
    grouped.set(id, offers);
  }

  const items: CatalogItem[] = [];
  for (const [id, offers] of grouped) {
    const perStore = oneOfferPerStore(offers);
    const packs = perStore.map((offer) => offer.pack);
    items.push({
      id,
      name: displayName(perStore),
      offers: perStore.map((offer) => {
        const fair = fairUnitPrice(offer.shelfPrice, offer.pack, packs);
        return {
          storeId: offer.storeId,
          storeName: offer.storeName,
          purchases: offer.purchases,
          enlistments: offer.enlistments,
          shelfPrice: offer.shelfPrice,
          comparedPrice: fair.comparedPrice,
          shelfNote: fair.shelfNote,
          date: offer.date,
          stale: priceIsStale(offer.date, today),
        };
      }),
    });
  }

  return items.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export function catalogStores(items: CatalogItem[]): Array<{ id: string; name: string }> {
  const seen = new Set<string>();
  const list: Array<{ id: string; name: string }> = [];

  for (const item of items) {
    for (const offer of item.offers) {
      const name = offer.storeName.trim();
      const key = name.toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        list.push({ id: offer.storeId, name });
      }
    }
  }

  return list.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export function browseItems(items: CatalogItem[], query: ItemQuery): ItemListing[] {
  const search = query.search.trim().toLowerCase();
  const targetStore = query.storeId?.trim().toLowerCase() || null;
  const rows: ItemListing[] = [];

  for (const item of items) {
    if (search && !item.name.toLowerCase().includes(search)) continue;
    const pool = targetStore
      ? item.offers.filter(
          (offer) =>
            offer.storeId.toLowerCase() === targetStore ||
            offer.storeName.toLowerCase() === targetStore,
        )
      : item.offers;
    const winner = cheapestOffer(pool);
    if (!winner) continue;
    const pricesDiffer = pool.some((offer) => offer.comparedPrice !== winner.comparedPrice);
    const totalPurchases = query.storeId ? winner.purchases : pool.reduce((sum, offer) => sum + offer.purchases, 0);
    const totalEnlistments = query.storeId ? winner.enlistments : pool.reduce((sum, offer) => sum + offer.enlistments, 0);
    const isEnlistedOnly = totalPurchases === 0 && totalEnlistments > 0;
    rows.push({
      id: item.id,
      name: item.name,
      purchases: totalPurchases,
      enlistments: totalEnlistments,
      isEnlistedOnly,
      storeId: winner.storeId,
      storeName: winner.storeName,
      price: winner.shelfPrice,
      cheapest: pool.length > 1 && pricesDiffer,
      stale: winner.stale,
      shelfNote: winner.shelfPrice === winner.comparedPrice ? null : winner.shelfNote,
    });
  }

  return rows.sort((left, right) => compareListings(left, right, query.sort));
}

function cheapestOffer(offers: CatalogOffer[]): CatalogOffer | null {
  return [...offers].sort((left, right) =>
    left.comparedPrice - right.comparedPrice || left.storeName.localeCompare(right.storeName)
  )[0] ?? null;
}

function compareListings(left: ItemListing, right: ItemListing, sort: ItemSort): number {
  const name = left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  if (sort === "name") return name;
  if (sort === "least-bought") return left.purchases - right.purchases || name;
  if (sort === "lowest-price") return left.price - right.price || name;
  if (sort === "highest-price") return right.price - left.price || name;
  return right.purchases - left.purchases || name;
}

function displayName(offers: StoreOffer[]): string {
  return [...offers].sort((left, right) => right.name.length - left.name.length || left.name.localeCompare(right.name))[0]?.name
    ?? "Item";
}

function oneOfferPerStore(offers: StoreOffer[]): StoreOffer[] {
  const byStore = new Map<string, StoreOffer>();
  for (const offer of offers) {
    const current = byStore.get(offer.storeId);
    if (!current) {
      byStore.set(offer.storeId, offer);
      continue;
    }
    const purchases = current.purchases + offer.purchases;
    const enlistments = current.enlistments + offer.enlistments;
    const later = isLaterPurchase(offer, current) ? offer : current;
    byStore.set(offer.storeId, { ...later, purchases, enlistments });
  }
  return [...byStore.values()];
}

function isLaterPurchase(next: StoreOffer, current: StoreOffer): boolean {
  const date = next.date.localeCompare(current.date);
  if (date !== 0) return date > 0;
  return next.receiptId.localeCompare(current.receiptId) > 0;
}
