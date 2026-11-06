export type ProductCandidate = {
  key: string;
  name: string;
  rawName?: string;
  sku?: string | null;
  productId?: string | null;
  storeId?: string;
};

export type MatchReason = "sku" | "exact" | "raw_exact" | "token";

export type ProductMatch = {
  candidate: ProductCandidate;
  score: number;
  reason: MatchReason;
};

/**
 * Split text into lowercase alphanumeric tokens for matching.
 * Preserves sizes and quantities like "500ml", "1kg", "5s".
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/**
 * Checks whether a single query token matches a target token
 * either exactly or as an abbreviation/prefix.
 */
function tokenMatches(queryToken: string, targetToken: string): boolean {
  if (queryToken === targetToken) return true;
  // Prefix match (e.g., 'sw' for 'sweat', 'choc' for 'chocolate')
  if (queryToken.length >= 2 && targetToken.startsWith(queryToken)) return true;
  if (targetToken.length >= 2 && queryToken.startsWith(targetToken)) return true;
  return false;
}

/**
 * Compute token match ratio of query against candidate text.
 */
function computeTokenOverlap(queryTokens: string[], targetTokens: string[]): number {
  if (queryTokens.length === 0 || targetTokens.length === 0) return 0;
  let matches = 0;
  for (const q of queryTokens) {
    if (targetTokens.some((t) => tokenMatches(q, t))) {
      matches += 1;
    }
  }
  return matches / queryTokens.length;
}

/**
 * Find the single best matching existing product for a receipt line.
 */
export function findBestProductMatch(
  line: { name: string; rawName: string; sku?: string | null },
  candidates: ProductCandidate[],
  minScore = 0.55,
): ProductMatch | null {
  const lineSku = line.sku?.trim().toLowerCase();
  const lineNameLower = line.name.trim().toLowerCase();
  const lineRawLower = line.rawName.trim().toLowerCase();
  const lineRawTokens = tokenize(line.rawName);
  const lineNameTokens = tokenize(line.name);

  let best: ProductMatch | null = null;

  for (const candidate of candidates) {
    const candSku = candidate.sku?.trim().toLowerCase();
    const candNameLower = candidate.name.trim().toLowerCase();
    const candRawLower = (candidate.rawName || "").trim().toLowerCase();

    // 1. SKU match (highest confidence)
    if (lineSku && candSku && lineSku === candSku) {
      return { candidate, score: 1.0, reason: "sku" };
    }

    // 2. Exact display name match
    if (lineNameLower && lineNameLower === candNameLower) {
      if (!best || best.score < 0.98) {
        best = { candidate, score: 0.98, reason: "exact" };
      }
      continue;
    }

    // 3. Exact raw printed name match
    if (lineRawLower && candRawLower && lineRawLower === candRawLower) {
      if (!best || best.score < 0.95) {
        best = { candidate, score: 0.95, reason: "raw_exact" };
      }
      continue;
    }

    // 4. Token overlap matching
    const candNameTokens = tokenize(candidate.name);
    const candRawTokens = candidate.rawName ? tokenize(candidate.rawName) : [];

    const rawVsNameOverlap = computeTokenOverlap(lineRawTokens, candNameTokens);
    const rawVsRawOverlap = computeTokenOverlap(lineRawTokens, candRawTokens);
    const nameVsNameOverlap = computeTokenOverlap(lineNameTokens, candNameTokens);

    const maxOverlap = Math.max(rawVsNameOverlap, rawVsRawOverlap, nameVsNameOverlap);
    if (maxOverlap >= 0.5) {
      // Score ranges between 0.60 and 0.90 based on overlap
      const score = 0.60 + maxOverlap * 0.30;
      if (score >= minScore && (!best || score > best.score)) {
        best = { candidate, score, reason: "token" };
      }
    }
  }

  return best;
}

/**
 * Filter and deduplicate candidates for autocomplete as the user types.
 */
export function searchProductCandidates(
  query: string,
  candidates: ProductCandidate[],
  limit = 5,
): ProductCandidate[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const queryTokens = tokenize(trimmed);
  const seenNames = new Set<string>();
  const results: Array<{ candidate: ProductCandidate; priority: number }> = [];

  for (const candidate of candidates) {
    const nameKey = candidate.name.trim().toLowerCase();
    if (seenNames.has(nameKey)) continue;

    const candNameLower = candidate.name.toLowerCase();
    const candSku = candidate.sku?.toLowerCase();

    let priority = 0;

    if (candSku && candSku.startsWith(trimmed)) {
      priority = 100;
    } else if (candNameLower.startsWith(trimmed)) {
      priority = 80;
    } else if (candNameLower.includes(trimmed)) {
      priority = 60;
    } else if (queryTokens.length > 0) {
      const candTokens = tokenize(candidate.name);
      const overlap = computeTokenOverlap(queryTokens, candTokens);
      if (overlap >= 0.5) {
        priority = 40 + Math.round(overlap * 20);
      }
    }

    if (priority > 0) {
      seenNames.add(nameKey);
      results.push({ candidate, priority });
    }
  }

  results.sort((a, b) => b.priority - a.priority || a.candidate.name.localeCompare(b.candidate.name));
  return results.slice(0, limit).map((r) => r.candidate);
}
