/**
 * SKU / Barcode matching and normalization logic for VuePresyo.
 * Helps detect exact and similar SKUs across Philippine store receipts and product packages.
 */

/**
 * Clean a raw SKU string by stripping non-alphanumeric characters and trimming.
 */
export function cleanSku(sku: string | null | undefined): string | null {
  if (typeof sku !== "string") return null;
  const cleaned = sku.replace(/[^a-zA-Z0-9]/g, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Strip leading zeros from a SKU (common difference between 12-digit UPC-A and 13-digit EAN-13,
 * or POS scanners truncating leading zeroes).
 */
export function stripLeadingZeros(sku: string): string {
  const stripped = sku.replace(/^0+/, "");
  return stripped.length > 0 ? stripped : "0";
}

export type SkuMatchReason = "exact" | "leading_zeros" | "prefix" | "suffix" | "distance";

export type SkuMatchResult = {
  isMatch: boolean;
  reason: SkuMatchReason | null;
};

/**
 * Compute simple Levenshtein edit distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }

  return row[b.length];
}

/**
 * Compare two SKUs to determine if they are identical or similar.
 */
export function isSimilarSku(rawA: string | null | undefined, rawB: string | null | undefined): SkuMatchResult {
  const skuA = cleanSku(rawA);
  const skuB = cleanSku(rawB);

  if (!skuA || !skuB) {
    return { isMatch: false, reason: null };
  }

  const lowerA = skuA.toLowerCase();
  const lowerB = skuB.toLowerCase();

  // 1. Exact match
  if (lowerA === lowerB) {
    return { isMatch: true, reason: "exact" };
  }

  // 2. Leading zeros variation (e.g. 048000166012 vs 48000166012)
  const strippedA = stripLeadingZeros(lowerA);
  const strippedB = stripLeadingZeros(lowerB);
  if (strippedA === strippedB) {
    return { isMatch: true, reason: "leading_zeros" };
  }

  // 3. Suffix / Prefix containment for barcode numbers (min length 6)
  if (lowerA.length >= 6 && lowerB.length >= 6) {
    if (lowerA.startsWith(lowerB) || lowerB.startsWith(lowerA)) {
      return { isMatch: true, reason: "prefix" };
    }
    if (lowerA.endsWith(lowerB) || lowerB.endsWith(lowerA)) {
      return { isMatch: true, reason: "suffix" };
    }

    // 4. Single-digit edit distance (e.g. 1 OCR or typing mistake)
    if (Math.abs(lowerA.length - lowerB.length) <= 1 && levenshteinDistance(lowerA, lowerB) === 1) {
      return { isMatch: true, reason: "distance" };
    }
  }

  return { isMatch: false, reason: null };
}

export type SimilarSkuCandidate<T> = {
  product: T;
  reason: SkuMatchReason;
  sameStore: boolean;
};

/**
 * Search candidate products to find existing items that have matching or similar SKUs.
 * Skips the item currently being edited (currentKey).
 * Prioritizes:
 * 1. Same-store exact matches
 * 2. Same-store similar matches
 * 3. Cross-store exact matches
 * 4. Cross-store similar matches
 */
export function findSimilarSkuProducts<
  T extends { key: string; name: string; sku?: string | null; storeId: string; productId?: string | null }
>(
  enteredSku: string | null | undefined,
  candidates: T[],
  currentKey: string,
  currentStoreId?: string,
): SimilarSkuCandidate<T>[] {
  const cleaned = cleanSku(enteredSku);
  if (!cleaned) return [];

  const matches: SimilarSkuCandidate<T>[] = [];

  for (const candidate of candidates) {
    if (candidate.key === currentKey) continue;
    if (!candidate.sku) continue;

    const result = isSimilarSku(cleaned, candidate.sku);
    if (result.isMatch && result.reason) {
      const sameStore = Boolean(currentStoreId && candidate.storeId === currentStoreId);
      matches.push({
        product: candidate,
        reason: result.reason,
        sameStore,
      });
    }
  }

  const reasonRank: Record<SkuMatchReason, number> = {
    exact: 0,
    leading_zeros: 1,
    prefix: 2,
    suffix: 3,
    distance: 4,
  };

  matches.sort((a, b) => {
    // 1. Same store first
    if (a.sameStore !== b.sameStore) return a.sameStore ? -1 : 1;
    // 2. Reason rank (exact first)
    if (reasonRank[a.reason] !== reasonRank[b.reason]) {
      return reasonRank[a.reason] - reasonRank[b.reason];
    }
    // 3. Name alphabetical
    return a.product.name.localeCompare(b.product.name);
  });

  return matches;
}
