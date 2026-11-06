import { roundMoney } from "./money";
import { orderedPurchases, type PricePoint } from "./price-change";
import {
  fairUnitPrice,
  parsePackSize,
  priceIsStale,
  type CompareProduct,
} from "./store-compare";

import { MAX_PRODUCT_PHOTOS } from "./keys";

const PERCENT_DECIMALS = 10;

function roundPercent(value: number): number {
  return Math.round(value * PERCENT_DECIMALS) / PERCENT_DECIMALS;
}

export function isEnlistReceipt(receiptId: string): boolean {
  return receiptId.startsWith("enlist");
}

export type PurchaseHistoryEntry = {
  receiptId: string;
  itemKey: string;
  storeId: string;
  storeName: string;
  date: string;
  price: number;
  delta: number | null;
  percent: number | null;
  isEnlist: boolean;
};

export type ItemDetailStorePrice = {
  itemKey: string;
  storeId: string;
  storeName: string;
  productName: string;
  unit: string;
  shelfPrice: number;
  comparedPrice: number;
  shelfNote: string | null;
  date: string;
  stale: boolean;
  cheapest: boolean;
  deltaVsCheapest: number;
  purchasesCount: number;
  enlistCount: number;
  lastIsEnlist: boolean;
};

export type ItemDetail = {
  id: string;
  itemKey: string;
  name: string;
  rawNames: string[];
  skus: string[];
  productId: string | null;
  imagePath: string | null;
  imagePaths: string[];
  packSize: string | null;
  unit: string;
  productType: string | null;
  totalPurchases: number;
  totalEnlistments: number;
  isEnlistedOnly: boolean;
  storePrices: ItemDetailStorePrice[];
  history: PurchaseHistoryEntry[];
};

export function buildItemDetail(
  itemId: string,
  products: CompareProduct[],
  history: Record<string, PricePoint[]>,
  storeNames: Record<string, string>,
  today: string,
): ItemDetail | null {
  const trimmed = itemId.trim();
  if (!trimmed) return null;

  let targetProductId: string | null = null;
  let targetKey: string | null = null;

  if (trimmed.startsWith("product:")) {
    targetProductId = trimmed.slice(8);
  } else if (trimmed.startsWith("item:")) {
    targetKey = trimmed.slice(5);
  } else {
    const directMatch = products.find((p) => p.productId === trimmed || p.key === trimmed);
    if (directMatch?.productId) {
      targetProductId = directMatch.productId;
    } else if (directMatch) {
      targetKey = directMatch.key;
    } else {
      targetKey = trimmed;
    }
  }

  const matchedProducts = products.filter((product) => {
    if (targetProductId) return product.productId === targetProductId;
    if (targetKey) {
      if (product.key === targetKey) return true;
      const anchor = products.find((candidate) => candidate.key === targetKey);
      if (anchor?.productId && product.productId === anchor.productId) return true;
    }
    return false;
  });

  if (matchedProducts.length === 0) return null;

  // Best product name
  const names = matchedProducts
    .map((p) => p.name.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
  const rawNames = [...new Set(matchedProducts.map((p) => p.rawName.trim()).filter(Boolean))];
  const primaryName = names[0] ?? rawNames[0] ?? "Item";

  // SKUs
  const skus = [
    ...new Set(
      matchedProducts
        .map((p) => p.sku?.trim() ?? "")
        .filter((sku): sku is string => Boolean(sku)),
    ),
  ];

  // Primary item key for uploads and identification
  const primaryItemKey =
    (targetKey && matchedProducts.some((p) => p.key === targetKey))
      ? targetKey
      : (matchedProducts.find((p) => Boolean(p.imagePath))?.key ?? matchedProducts[0].key);

  // Image paths (all photos across matched products, capped at MAX_PRODUCT_PHOTOS)
  const allImagePaths = [
    ...new Set(
      matchedProducts.flatMap((p) => {
        if (Array.isArray(p.imagePaths) && p.imagePaths.length > 0) {
          return p.imagePaths.filter((path): path is string => typeof path === "string" && Boolean(path.trim()));
        }
        return typeof p.imagePath === "string" && p.imagePath.trim() ? [p.imagePath.trim()] : [];
      }),
    ),
  ].slice(0, MAX_PRODUCT_PHOTOS);
  const imagePath = allImagePaths[0] ?? null;

  // Shared productId
  const effectiveProductId =
    targetProductId ?? matchedProducts.find((p) => Boolean(p.productId))?.productId ?? null;

  // Pack size
  const parsedPack =
    parsePackSize(primaryName, matchedProducts[0]?.unit) ??
    matchedProducts.map((p) => parsePackSize(p.name, p.unit) ?? parsePackSize(p.rawName, p.unit)).find(Boolean) ??
    null;
  const packSize = parsedPack ? formatPackLabel(parsedPack) : null;

  // Current store offers and pricing
  const packs = matchedProducts.map((p) => parsePackSize(p.name, p.unit) ?? parsePackSize(p.rawName, p.unit));

  const storePriceDrafts: Array<{
    itemKey: string;
    storeId: string;
    storeName: string;
    productName: string;
    unit: string;
    shelfPrice: number;
    comparedPrice: number;
    shelfNote: string | null;
    date: string;
    stale: boolean;
    purchasesCount: number;
    enlistCount: number;
    lastIsEnlist: boolean;
  }> = [];

  for (const product of matchedProducts) {
    const purchases = orderedPurchases(history[product.key] ?? []).filter((point) => point.price > 0);
    const latest = purchases[purchases.length - 1];
    if (!latest) continue;

    const storeName = storeNames[product.storeId]?.trim() || product.storeId;
    const shelfPrice = roundMoney(latest.price);
    const productPack = parsePackSize(product.name, product.unit) ?? parsePackSize(product.rawName, product.unit);
    const fair = fairUnitPrice(shelfPrice, productPack, packs);

    const actualPurchases = purchases.filter((p) => !isEnlistReceipt(p.receiptId));
    const enlistPurchases = purchases.filter((p) => isEnlistReceipt(p.receiptId));

    storePriceDrafts.push({
      itemKey: product.key,
      storeId: product.storeId,
      storeName,
      productName: product.name,
      unit: typeof product.unit === "string" && product.unit.trim() ? product.unit.trim() : "pc",
      shelfPrice,
      comparedPrice: fair.comparedPrice,
      shelfNote: fair.shelfNote,
      date: latest.date,
      stale: priceIsStale(latest.date, today),
      purchasesCount: actualPurchases.length,
      enlistCount: enlistPurchases.length,
      lastIsEnlist: isEnlistReceipt(latest.receiptId),
    });
  }

  // Deduplicate offers by store if multiple keys map to the same store (keep latest)
  const offersByStore = new Map<string, (typeof storePriceDrafts)[number]>();
  for (const offer of storePriceDrafts) {
    const existing = offersByStore.get(offer.storeId);
    if (!existing || offer.date.localeCompare(existing.date) > 0) {
      offersByStore.set(offer.storeId, offer);
    }
  }

  const uniqueStoreOffers = [...offersByStore.values()];
  const minComparedPrice = uniqueStoreOffers.length > 0
    ? Math.min(...uniqueStoreOffers.map((o) => o.comparedPrice))
    : 0;
  const pricesDiffer = uniqueStoreOffers.some((o) => o.comparedPrice !== minComparedPrice);

  const storePrices: ItemDetailStorePrice[] = uniqueStoreOffers
    .map((offer) => ({
      ...offer,
      cheapest: uniqueStoreOffers.length > 1 && pricesDiffer && offer.comparedPrice === minComparedPrice,
      deltaVsCheapest: roundMoney(Math.max(0, offer.comparedPrice - minComparedPrice)),
    }))
    .sort((a, b) => a.comparedPrice - b.comparedPrice || a.storeName.localeCompare(b.storeName));

  // Build purchase history timeline across all matched products
  const allHistoryEntries: PurchaseHistoryEntry[] = [];

  for (const product of matchedProducts) {
    const storeName = storeNames[product.storeId]?.trim() || product.storeId;
    const purchases = orderedPurchases(history[product.key] ?? []).filter((point) => point.price > 0);

    for (let index = 0; index < purchases.length; index++) {
      const current = purchases[index];
      const previous = index > 0 ? purchases[index - 1] : null;

      let delta: number | null = null;
      let percent: number | null = null;

      if (previous) {
        delta = roundMoney(current.price - previous.price);
        if (previous.price > 0 && delta !== 0) {
          percent = roundPercent(((current.price - previous.price) / previous.price) * 100);
        } else {
          percent = 0;
        }
      }

      allHistoryEntries.push({
        receiptId: current.receiptId,
        itemKey: product.key,
        storeId: product.storeId,
        storeName,
        date: current.date,
        price: roundMoney(current.price),
        delta,
        percent,
        isEnlist: isEnlistReceipt(current.receiptId),
      });
    }
  }

  // Sort purchase history: newest first
  allHistoryEntries.sort((a, b) => {
    const dateComparison = b.date.localeCompare(a.date);
    if (dateComparison !== 0) return dateComparison;
    return b.receiptId.localeCompare(a.receiptId);
  });

  const totalPurchases = allHistoryEntries.filter((e) => !e.isEnlist).length;
  const totalEnlistments = allHistoryEntries.filter((e) => e.isEnlist).length;
  const isEnlistedOnly = totalPurchases === 0 && totalEnlistments > 0;

  return {
    id: trimmed,
    itemKey: primaryItemKey,
    name: primaryName,
    rawNames,
    skus,
    productId: effectiveProductId,
    imagePath,
    imagePaths: allImagePaths,
    packSize,
    unit: matchedProducts.find((p) => typeof p.unit === "string" && p.unit.trim())?.unit?.trim() ?? "pc",
    productType: matchedProducts.find((p) => typeof p.productType === "string" && p.productType.trim())?.productType?.trim() ?? null,
    totalPurchases,
    totalEnlistments,
    isEnlistedOnly,
    storePrices,
    history: allHistoryEntries,
  };
}

function formatPackLabel(pack: { dimension: "volume" | "mass" | "count"; quantity: number }): string {
  if (pack.dimension === "volume") {
    return pack.quantity >= 1000 ? `${pack.quantity / 1000}L` : `${pack.quantity}ml`;
  }
  if (pack.dimension === "mass") {
    return pack.quantity >= 1000 ? `${pack.quantity / 1000}kg` : `${pack.quantity}g`;
  }
  return `${pack.quantity} pcs`;
}
