import { MAX_PRODUCT_PHOTOS } from "./keys";

export const MAX_PACKAGE_MATCHES = 4;
export const MAX_PRODUCT_NAME_LENGTH = 80;

export type ProductPhotoCandidate = {
  key: string;
  name: string;
  storeId: string;
  imagePath: string | null;
  imagePaths?: string[];
  productId: string | null;
};

export type ProductWrite = {
  sku: string | null;
  storeId: string;
  rawName: string;
  name: string;
  productId?: string | null;
  imagePath?: string | null;
  imagePaths?: string[];
  unit?: string;
  productType?: string | null;
};

/**
 * A later receipt updates the printed name. A confirmed display name, package
 * photo, and shared productId stay on the existing product.
 */
export function mergedProduct(
  existing: Record<string, unknown> | null,
  incoming: ProductWrite,
): Record<string, unknown> {
  if (!existing) {
    const incomingPaths = incoming.imagePaths ?? (incoming.imagePath ? [incoming.imagePath] : []);
    const cappedPaths = incomingPaths.slice(0, MAX_PRODUCT_PHOTOS);
    return {
      sku: incoming.sku,
      storeId: incoming.storeId,
      rawName: incoming.rawName,
      name: incoming.name,
      unit: incoming.unit || "pc",
      productId: incoming.productId ?? null,
      imagePath: cappedPaths[0] ?? incoming.imagePath ?? null,
      ...(cappedPaths.length > 0 ? { imagePaths: cappedPaths } : {}),
      ...(incoming.productType ? { productType: incoming.productType } : {}),
    };
  }

  const existingPaths = Array.isArray(existing.imagePaths)
    ? (existing.imagePaths as string[])
    : (typeof existing.imagePath === "string" && existing.imagePath ? [existing.imagePath] : []);
  const incomingPaths = incoming.imagePaths ?? (incoming.imagePath ? [incoming.imagePath] : []);
  const combinedPaths = [...new Set([...existingPaths, ...incomingPaths])].slice(0, MAX_PRODUCT_PHOTOS);

  return {
    ...existing,
    sku: incoming.sku,
    storeId: incoming.storeId,
    rawName: incoming.rawName,
    unit: incoming.unit ?? (typeof existing.unit === "string" ? existing.unit : "pc"),
    imagePath: existing.imagePath ?? combinedPaths[0] ?? null,
    ...(combinedPaths.length > 0 ? { imagePaths: combinedPaths } : {}),
    ...(incoming.productId && !existing.productId ? { productId: incoming.productId } : {}),
    ...(incoming.productType
      ? { productType: incoming.productType }
      : typeof existing.productType === "string"
      ? { productType: existing.productType }
      : {}),
  };
}

export function cleanSuggestedName(value: string): string | null {
  const cleaned = value.replace(/[\u0000-\u001F]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > MAX_PRODUCT_NAME_LENGTH) return null;
  return cleaned;
}

export function namesDiffer(current: string, suggested: string): boolean {
  return current.trim().toLowerCase() !== suggested.trim().toLowerCase();
}

export function productNeedingPhoto<
  T extends {
    key: string;
    name: string;
    imagePath: string | null;
    imagePaths?: string[];
    productId?: string | null;
  },
>(
  products: T[],
  skipped: ReadonlySet<string>,
): T | null {
  const hasPhoto = (p: T): boolean =>
    Boolean(p.imagePath || (Array.isArray(p.imagePaths) && p.imagePaths.length > 0));

  const productIdsWithPhotos = new Set<string>();
  const skippedProductIds = new Set<string>();

  for (const product of products) {
    if (product.productId) {
      if (hasPhoto(product)) {
        productIdsWithPhotos.add(product.productId);
      }
      if (skipped.has(product.key)) {
        skippedProductIds.add(product.productId);
      }
    }
  }

  const seenProductIds = new Set<string>();
  const missing = products
    .filter((product) => {
      if (hasPhoto(product)) return false;
      if (product.productId && productIdsWithPhotos.has(product.productId)) return false;
      if (skipped.has(product.key)) return false;
      if (product.productId && skippedProductIds.has(product.productId)) return false;
      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.key.localeCompare(right.key))
    .filter((product) => {
      if (!product.productId) return true;
      if (seenProductIds.has(product.productId)) return false;
      seenProductIds.add(product.productId);
      return true;
    });

  return missing[0] ?? null;
}

export function packageMatchCandidates(
  products: ProductPhotoCandidate[],
  current: { key: string; storeId: string; productId: string | null },
  declined: ReadonlySet<string>,
): ProductPhotoCandidate[] {
  return products
    .filter((product) => {
      if (product.key === current.key || product.storeId === current.storeId) return false;
      if (!product.imagePath) return false;
      if (declined.has(product.key)) return false;
      if (current.productId && product.productId === current.productId) return false;
      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.key.localeCompare(right.key))
    .slice(0, MAX_PACKAGE_MATCHES);
}

export function productIdForLink(
  current: string | null | undefined,
  other: string | null | undefined,
  createdId: string,
): string {
  if (current) return current;
  if (other) return other;
  return createdId;
}
