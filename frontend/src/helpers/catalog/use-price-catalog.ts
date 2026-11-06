import { ref, onMounted } from "vue";
import type { PricePoint } from "@/domain/price-change";
import type { CompareProduct } from "@/domain/store-compare";
import type { StoreRecord } from "@/domain/store-matcher";
import { apiFetch } from "@/src/lib/api";
import { safeGetCachedData, safeSetCachedData } from "@/src/lib/offline-queue";

export type CatalogResponse = {
  products: CompareProduct[];
  stores: Record<string, StoreRecord>;
  storeNames: Record<string, string>;
  history: Record<string, PricePoint[]>;
};

const productsState = ref<CompareProduct[] | null>(null);
const storesState = ref<Record<string, StoreRecord>>({});
const storeNamesState = ref<Record<string, string>>({});
const historyState = ref<Record<string, PricePoint[]>>({});
const errorState = ref<string | null>(null);
let hasLoadedOnce = false;

export async function refreshPriceCatalog(
  loadErrorMessage = "Could not load catalog.",
): Promise<void> {
  try {
    const data = await apiFetch<CatalogResponse>("/api/catalog");
    productsState.value = data.products ?? [];
    storesState.value = data.stores ?? {};
    storeNamesState.value = data.storeNames ?? {};
    historyState.value = data.history ?? {};
    errorState.value = null;
    hasLoadedOnce = true;

    void safeSetCachedData("cached_products", productsState.value);
    void safeSetCachedData("cached_stores", {
      records: storesState.value,
      names: storeNamesState.value,
    });
    void safeSetCachedData("cached_history", historyState.value);
  } catch {
    if (!productsState.value) {
      errorState.value = loadErrorMessage;
    }
  }
}

export function usePriceCatalog(loadErrorMessage = "Could not load catalog.") {
  onMounted(async () => {
    if (!hasLoadedOnce) {
      const cachedProds =
        await safeGetCachedData<CompareProduct[]>("cached_products");
      if (cachedProds && !productsState.value) {
        productsState.value = cachedProds;
      }
      const cachedStores = await safeGetCachedData<{
        records: Record<string, StoreRecord>;
        names: Record<string, string>;
      }>("cached_stores");
      if (cachedStores && Object.keys(storesState.value).length === 0) {
        storesState.value = cachedStores.records;
        storeNamesState.value = cachedStores.names;
      }
      const cachedHist =
        await safeGetCachedData<Record<string, PricePoint[]>>("cached_history");
      if (cachedHist && Object.keys(historyState.value).length === 0) {
        historyState.value = cachedHist;
      }
    }
    await refreshPriceCatalog(loadErrorMessage);
  });

  return {
    products: productsState,
    stores: storesState,
    storeNames: storeNamesState,
    history: historyState,
    error: errorState,
    refresh: () => refreshPriceCatalog(loadErrorMessage),
  };
}

