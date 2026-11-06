<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { formatPeso, formatReceiptDate } from "@/domain/money";
import {
  computeStoreRankings,
  sortReceiptsNewestFirst,
  type SavedReceiptRow,
} from "@/domain/store-ranking";
import { usePriceCatalog } from "@/src/helpers/catalog/use-price-catalog";
import { useOnline } from "@/src/helpers/use-online";
import { apiFetch } from "@/src/lib/api";
import { safeGetCachedData, safeSetCachedData } from "@/src/lib/offline-queue";

type StoreSortOption = "cheapness" | "receipts" | "name";

const isOnline = useOnline();
const route = useRoute();
const selectedStoreId = computed(() =>
  typeof route.query.id === "string" ? route.query.id : null,
);

const { products, storeNames, stores, history, error } = usePriceCatalog(
  "Could not load catalog.",
);
const receipts = ref<SavedReceiptRow[] | null>(null);
const search = ref("");
const sort = ref<StoreSortOption>("cheapness");

onMounted(async () => {
  const cached = await safeGetCachedData<SavedReceiptRow[]>("cached_receipts");
  if (cached && cached.length > 0 && !receipts.value) {
    receipts.value = cached;
  }

  try {
    const data = await apiFetch<SavedReceiptRow[]>("/api/receipts");
    const sorted = sortReceiptsNewestFirst(data ?? []);
    receipts.value = sorted;
    void safeSetCachedData("cached_receipts", sorted);
  } catch {
    if (!receipts.value) {
      receipts.value = [];
    }
  }
});

const summary = computed(() => {
  if (!products.value || !history.value) return null;
  const storesArray = Object.entries(stores.value ?? {}).map(([id, rec]) => ({
    id,
    name: rec.name,
    branch: rec.branch ?? null,
  }));
  return computeStoreRankings({
    stores: storesArray,
    products: products.value,
    history: history.value,
    storeNames: storeNames.value ?? {},
    receipts: receipts.value ?? [],
  });
});

const storeList = computed(() => summary.value?.stores ?? []);

const selectedStore = computed(() => {
  if (!selectedStoreId.value) return null;
  return (
    storeList.value.find((s) => s.storeId === selectedStoreId.value) ?? null
  );
});

const storeReceipts = computed(() => {
  if (!selectedStoreId.value || !receipts.value) return [];
  return sortReceiptsNewestFirst(
    receipts.value.filter((r) => r.storeId === selectedStoreId.value),
  );
});

const sortedStores = computed(() => {
  const q = search.value.trim().toLowerCase();
  const filtered = storeList.value.filter((store) => {
    if (!q) return true;
    return (
      store.storeName.toLowerCase().includes(q) ||
      (store.branch && store.branch.toLowerCase().includes(q))
    );
  });

  return [...filtered].sort((a, b) => {
    if (sort.value === "cheapness") return a.rank - b.rank;
    if (sort.value === "receipts") {
      return (
        b.receiptCount - a.receiptCount ||
        a.storeName.localeCompare(b.storeName)
      );
    }
    return a.storeName.localeCompare(b.storeName);
  });
});
</script>

<template>
  <p v-if="error && !products" class="error" role="alert">{{ error }}</p>
  <p v-else-if="!products || !history || receipts === null" class="muted">
    {{
      !isOnline
        ? "You are offline. Connect to the internet once to load store price comparisons."
        : "Loading stores…"
    }}
  </p>

  <!-- Store Detail View -->
  <div v-else-if="selectedStoreId" class="store-detail-view">
    <div v-if="!isOnline" style="margin-bottom: 12px">
      <span class="pill warn" style="font-size: 11px">
        ⚡ Offline · Viewing cached data
      </span>
    </div>

    <div style="margin-bottom: 16px">
      <RouterLink
        to="/stores"
        class="btn ghost"
        style="
          width: auto;
          padding: 6px 12px;
          font-size: 13px;
          text-decoration: none;
          display: inline-flex;
          gap: 4px;
        "
      >
        ← All stores
      </RouterLink>
    </div>

    <div style="margin-bottom: 16px">
      <div
        style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap"
      >
        <h2 style="margin: 0; font-size: 22px">
          {{
            selectedStore?.storeName ??
            storeNames?.[selectedStoreId] ??
            "Store"
          }}
        </h2>
        <span
          v-if="selectedStore?.branch ?? storeReceipts[0]?.branch"
          class="pill"
        >
          {{ selectedStore?.branch ?? storeReceipts[0]?.branch }}
        </span>
        <span
          v-if="selectedStore?.isMostlyCheap"
          class="pill ok"
          style="font-weight: 600"
        >
          🏆 Mostly cheap
        </span>
      </div>
    </div>

    <section class="card" style="margin-bottom: 16px">
      <div style="font-weight: 600; font-size: 15px; margin-bottom: 6px">
        {{
          selectedStore?.isMostlyCheap
            ? "🏆 Mostly Cheap Store"
            : "Price Performance"
        }}
      </div>
      <div v-if="selectedStore && selectedStore.totalComparedItems > 0">
        <p class="muted" style="margin: 0 0 8px 0; font-size: 13px">
          {{
            selectedStore.isMostlyCheap
              ? `Offers the lowest price on ${selectedStore.cheapestItemCount} out of ${selectedStore.totalComparedItems} products compared across stores (${selectedStore.cheapestPercentage}%).`
              : `Lowest price on ${selectedStore.cheapestItemCount} of ${selectedStore.totalComparedItems} products compared across stores (${selectedStore.cheapestPercentage}%).`
          }}
        </p>
        <div
          v-if="selectedStore.cheapestProducts.length > 0"
          style="margin-top: 10px"
        >
          <div
            class="muted"
            style="font-size: 12px; font-weight: 600; margin-bottom: 4px"
          >
            Cheapest items here:
          </div>
          <ul style="margin: 0; padding-left: 16px; font-size: 13px">
            <li
              v-for="(p, idx) in selectedStore.cheapestProducts"
              :key="idx"
              style="margin-bottom: 4px"
            >
              <span>{{ p.name }}</span> ·
              <span style="color: var(--brand); font-weight: 600">
                {{ formatPeso(p.comparedPrice) }}
              </span>
              <span v-if="p.shelfNote" class="muted">
                ({{ p.shelfNote }})
              </span>
            </li>
          </ul>
        </div>
      </div>
      <p v-else class="muted" style="margin: 0; font-size: 13px">
        No items from this store have been compared against other stores yet.
      </p>

      <div class="store-card-stats" style="margin-top: 12px">
        <span>
          {{ storeReceipts.length }}
          {{ storeReceipts.length === 1 ? "receipt" : "receipts" }}
        </span>
        <span v-if="selectedStore && selectedStore.totalSpent > 0">
          Total spent: {{ formatPeso(selectedStore.totalSpent) }}
        </span>
      </div>
    </section>

    <section>
      <div
        style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        "
      >
        <h3 style="margin: 0; font-size: 17px">Recent Receipts</h3>
        <span class="pill count-pill">{{ storeReceipts.length }}</span>
      </div>

      <div
        v-if="storeReceipts.length === 0"
        class="card"
        style="padding: 16px; text-align: center"
      >
        <p class="muted" style="margin: 0">No receipts found for this store.</p>
      </div>
      <div v-else class="card">
        <RouterLink
          v-for="receipt in storeReceipts"
          :key="receipt.id"
          class="receipt-row-link"
          :to="`/receipts/detail?id=${encodeURIComponent(receipt.id)}`"
        >
          <div class="receipt-row-main">
            <div class="name">{{ formatReceiptDate(receipt.date) }}</div>
            <div class="muted">
              {{ receipt.createdByName }} · {{ receipt.itemCount }} items{{
                receipt.vat != null ? ` · VAT ${formatPeso(receipt.vat)}` : ""
              }}
            </div>
          </div>
          <div class="receipt-row-right">
            <div class="name">{{ formatPeso(receipt.total) }}</div>
            <span class="receipt-row-chevron" aria-hidden="true">›</span>
          </div>
        </RouterLink>
      </div>
    </section>
  </div>

  <!-- Store List View -->
  <div v-else class="store-browser">
    <div v-if="!isOnline" style="margin-bottom: 12px">
      <span class="pill warn" style="font-size: 11px">
        ⚡ Offline · Viewing cached store rankings
      </span>
    </div>

    <div v-if="summary?.cheapestStore" class="store-highlight-card">
      <div
        style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        "
      >
        <span class="pill ok" style="font-weight: 700; font-size: 12px">
          🏆 Mostly Cheap Store
        </span>
        <span class="pill" style="font-size: 11px">
          {{ summary.cheapestStore.cheapestPercentage }}% lowest
        </span>
      </div>
      <h2 style="margin: 0 0 4px 0; font-size: 18px; color: var(--ink)">
        {{ summary.cheapestStore.storeName }}
      </h2>
      <p class="muted" style="margin: 0 0 10px 0; font-size: 13px">
        Has the mostly cheap items, offering the lowest price on
        {{ summary.cheapestStore.cheapestItemCount }} out of
        {{ summary.cheapestStore.totalComparedItems }} products compared across
        supermarkets.
      </p>
      <RouterLink
        :to="`/stores?id=${encodeURIComponent(summary.cheapestStore.storeId)}`"
        class="btn"
        style="
          width: auto;
          padding: 6px 14px;
          font-size: 13px;
          text-decoration: none;
          display: inline-block;
        "
      >
        View {{ summary.cheapestStore.storeName }} receipts →
      </RouterLink>
    </div>

    <div class="item-tools" style="margin-bottom: 12px">
      <div class="grid-2">
        <label class="field" for="store-search">
          <span>Search</span>
          <input
            id="store-search"
            v-model="search"
            class="cell"
            type="search"
            placeholder="Store or branch name"
          />
        </label>
        <label class="field" for="store-sort">
          <span>Sort</span>
          <select id="store-sort" v-model="sort" class="cell">
            <option value="cheapness">Mostly cheap first</option>
            <option value="receipts">Most receipts</option>
            <option value="name">Name (A-Z)</option>
          </select>
        </label>
      </div>
    </div>

    <div
      style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      "
    >
      <p class="muted" style="margin: 0; font-size: 13px">
        {{ sortedStores.length }}
        {{ sortedStores.length === 1 ? "store" : "stores" }}
      </p>
      <RouterLink
        to="/receipts"
        class="btn ghost"
        style="
          width: auto;
          padding: 4px 8px;
          font-size: 12px;
          text-decoration: none;
        "
      >
        All receipts →
      </RouterLink>
    </div>

    <div
      v-if="sortedStores.length === 0"
      class="card"
      style="padding: 20px; text-align: center"
    >
      <p class="muted" style="margin: 0">No stores match your search.</p>
    </div>

    <div v-else class="store-list-grid">
      <RouterLink
        v-for="store in sortedStores"
        :key="store.storeId"
        :to="`/stores?id=${encodeURIComponent(store.storeId)}`"
        class="card store-card"
        :aria-label="`View receipts for ${store.storeName}`"
      >
        <div class="store-card-header">
          <div>
            <h3 class="store-card-title">{{ store.storeName }}</h3>
            <div v-if="store.branch" class="store-card-branch">
              {{ store.branch }}
            </div>
          </div>
          <div>
            <span
              v-if="store.isMostlyCheap"
              class="pill ok"
              style="font-weight: 600"
            >
              🏆 Mostly cheap · {{ store.cheapestPercentage }}%
            </span>
            <span v-else-if="store.totalComparedItems > 0" class="pill">
              {{ store.cheapestPercentage }}% lowest ({{
                store.cheapestItemCount
              }}/{{ store.totalComparedItems }})
            </span>
            <span v-else class="pill">No comparisons</span>
          </div>
        </div>

        <div class="store-card-stats">
          <span>
            {{ store.receiptCount }}
            {{ store.receiptCount === 1 ? "receipt" : "receipts"
            }}{{
              store.totalSpent > 0 ? ` · ${formatPeso(store.totalSpent)}` : ""
            }}
          </span>
          <span style="display: flex; align-items: center; gap: 4px">
            {{
              store.lastReceiptDate
                ? `Last: ${formatReceiptDate(store.lastReceiptDate)}`
                : ""
            }}
            <span class="receipt-row-chevron" aria-hidden="true">›</span>
          </span>
        </div>
      </RouterLink>
    </div>
  </div>
</template>
