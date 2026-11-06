import { isProductImagePath, MAX_PRODUCT_PHOTOS } from "./keys";

export const MAX_ENLIST_PHOTOS = MAX_PRODUCT_PHOTOS;

export type EnlistPhotoExtraction = {
  suggestedName: string | null;
  suggestedProductType?: string | null;
  price: number | null;
  sku: string | null;
  unit: string | null;
};

export type SaveEnlistedPayload = {
  storeName: string;
  branch?: string | null;
  storeId?: string;
  name: string;
  price: number;
  sku?: string | null;
  unit?: string;
  productType?: string | null;
  imagePaths: string[];
  linkedItemKey?: string | null;
};

export type EnlistValidationResult = {
  ok: boolean;
  issues: string[];
};

export function validateEnlistedItem(payload: unknown): EnlistValidationResult {
  const issues: string[] = [];

  if (!payload || typeof payload !== "object") {
    return { ok: false, issues: ["Invalid payload."] };
  }

  const p = payload as Record<string, unknown>;

  if (typeof p.storeName !== "string" || !p.storeName.trim()) {
    issues.push("Store name is required.");
  }

  if (typeof p.name !== "string" || !p.name.trim()) {
    issues.push("Product name is required.");
  }

  if (typeof p.price !== "number" || Number.isNaN(p.price) || p.price <= 0) {
    issues.push("Price must be a positive number.");
  }

  if (!Array.isArray(p.imagePaths) || p.imagePaths.length === 0) {
    issues.push("At least one photo is required.");
  } else if (p.imagePaths.length > MAX_ENLIST_PHOTOS) {
    issues.push(`Maximum of ${MAX_ENLIST_PHOTOS} photos allowed.`);
  } else {
    for (const path of p.imagePaths) {
      if (typeof path !== "string" || !isProductImagePath(path)) {
        issues.push(`Invalid image path: ${String(path)}`);
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export type ScanEnlistCandidateMatch = {
  itemKey: string;
  name: string;
  storeId: string;
  storeName: string;
  sku: string | null;
  imagePath?: string | null;
};

export type ScanEnlistResponse = {
  extraction: EnlistPhotoExtraction;
  candidateMatches: ScanEnlistCandidateMatch[];
};

