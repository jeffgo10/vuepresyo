import { storeIdFromName } from "./keys";

export type StoreRecord = {
  id: string;
  name: string;
  branch?: string | null;
};

export type StoreInput = {
  id?: string | null;
  name: string;
  branch?: string | null;
};

export type MatchStoreResult = {
  storeId: string;
  name: string;
  branch: string | null;
  isExisting: boolean;
};

/** Normalize store brand names for comparison (strips apostrophes, legal entity suffixes, and punctuation). */
export function normalizeStoreName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|limited)\b\.?/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Tokenize and clean branch/address text for location matching. */
export function branchTokens(branch: string | null | undefined): Set<string> {
  if (!branch) return new Set();
  const cleaned = branch
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!cleaned) return new Set();
  // Filter out ultra-generic address words
  const stopWords = new Set(["road", "rd", "street", "st", "avenue", "ave", "highway", "hwy", "blvd", "city", "negros", "oriental"]);
  const tokens = cleaned.split(/\s+/).filter((word) => word.length > 1 && !stopWords.has(word));
  return new Set(tokens);
}

/** Known distinct cities/provinces in the Philippines that should not be merged across branches. */
const MAJOR_CITIES = [
  "dumaguete",
  "cebu",
  "mandaue",
  "lapu-lapu",
  "manila",
  "quezon",
  "makati",
  "pasig",
  "taguig",
  "davao",
  "iloilo",
  "bacolod",
  "cagayan de oro",
  "tagbilaran",
  "zamboanga",
  "pampanga",
  "cavite",
  "laguna",
  "batangas",
  "sibulan",
  "valencia",
  "bacong",
  "tanjay",
  "bais",
];

export function cityFromBranch(branch: string | null | undefined): string | null {
  if (!branch) return null;
  const lower = branch.toLowerCase();
  for (const city of MAJOR_CITIES) {
    if (lower.includes(city)) return city;
  }
  return null;
}

/** Check if two branches are compatible (overlapping, containment, or non-conflicting). */
export function branchesAreCompatible(b1: string | null | undefined, b2: string | null | undefined): boolean {
  if (!b1 || !b2) return true; // One or both have no branch specified
  const norm1 = b1.toLowerCase().trim();
  const norm2 = b2.toLowerCase().trim();
  if (norm1 === norm2) return true;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

  const city1 = cityFromBranch(b1);
  const city2 = cityFromBranch(b2);
  if (city1 && city2 && city1 !== city2) {
    // Distinct incompatible cities (e.g. Cebu vs Dumaguete)
    return false;
  }

  // Token overlap check (e.g. "Daro, Dumaguete City" and "North Road, Daro, Dumaguete City")
  const tokens1 = branchTokens(b1);
  const tokens2 = branchTokens(b2);
  for (const token of tokens1) {
    if (tokens2.has(token)) return true;
  }

  // If both mention the same city or neither mentions conflicting cities, they are compatible
  if (!city1 || !city2 || city1 === city2) return true;

  return false;
}

/**
 * Matches an incoming store (from receipt OCR, review UI, or enlistment)
 * against existing stores in the database to prevent duplicate store creation.
 */
export function matchStore(input: StoreInput, existingStores: StoreRecord[]): MatchStoreResult {
  const inputName = input.name.trim();
  const inputBranch = input.branch?.trim() || null;

  if (input.id) {
    const byId = existingStores.find((s) => s.id === input.id);
    if (byId) {
      return {
        storeId: byId.id,
        name: byId.name,
        branch: byId.branch ?? inputBranch,
        isExisting: true,
      };
    }
  }

  if (!inputName) {
    return {
      storeId: storeIdFromName(inputName, inputBranch),
      name: inputName,
      branch: inputBranch,
      isExisting: false,
    };
  }

  const normInputName = normalizeStoreName(inputName);

  // 1. Exact match on both name and branch
  for (const store of existingStores) {
    if (
      normalizeStoreName(store.name) === normInputName &&
      (store.branch?.trim().toLowerCase() || "") === (inputBranch?.toLowerCase() || "")
    ) {
      return {
        storeId: store.id,
        name: store.name,
        branch: store.branch ?? inputBranch,
        isExisting: true,
      };
    }
  }

  // 2. Candidates with matching normalized name
  const nameMatches = existingStores.filter((s) => {
    const sNorm = normalizeStoreName(s.name);
    return sNorm === normInputName || sNorm.replace(/\s+/g, "") === normInputName.replace(/\s+/g, "");
  });

  if (nameMatches.length === 1) {
    const candidate = nameMatches[0]!;
    if (branchesAreCompatible(candidate.branch, inputBranch)) {
      return {
        storeId: candidate.id,
        name: candidate.name,
        branch: candidate.branch ?? inputBranch,
        isExisting: true,
      };
    }
  } else if (nameMatches.length > 1) {
    // Multiple branches for this store name: find the best branch match
    let bestMatch: StoreRecord | null = null;
    let maxOverlap = 0;
    const inputToks = branchTokens(inputBranch);

    for (const candidate of nameMatches) {
      if (!branchesAreCompatible(candidate.branch, inputBranch)) continue;
      const candToks = branchTokens(candidate.branch);
      let overlap = 0;
      for (const t of inputToks) {
        if (candToks.has(t)) overlap++;
      }
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestMatch = candidate;
      }
    }

    if (bestMatch) {
      return {
        storeId: bestMatch.id,
        name: bestMatch.name,
        branch: bestMatch.branch ?? inputBranch,
        isExisting: true,
      };
    }
  }

  // 3. No existing match found -> generate new store ID
  return {
    storeId: storeIdFromName(inputName, inputBranch),
    name: inputName,
    branch: inputBranch,
    isExisting: false,
  };
}
