<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { RouterLink } from "vue-router";
import { formatPeso } from "@/domain/money";
import {
  browseItems,
  catalogStores,
  itemCatalog,
  type ItemSort,
  type ItemListing,
} from "@/domain/item-catalog";
import { localIsoDate } from "@/domain/store-compare";
import { usePriceCatalog } from "@/src/helpers/catalog/use-price-catalog";
import { useOnline } from "@/src/helpers/use-online";
import {
  getOfflineItems,
  type QueuedOfflineItem,
} from "@/src/lib/offline-queue";
import ItemDetailModal from "@/src/components/ItemDetailModal.vue";
import OfflineItemDetailModal from "@/src/components/OfflineItemDetailModal.vue";
import EnlistQueueNotice from "@/src/components/EnlistQueueNotice.vue";

const SORTS: Array<{ value: ItemSort; label: string }> = [
  { value: "most-bought", label: "Most bought" },
  { value: "least-bought", label: "Least bought" },
  { value: "name", label: "Name" },
  { value: "lowest-price", label: "Lowest price" },
  { value: "highest-price", label: "Highest price" },
];

type DisplayItemListing = ItemListing & {
  isOffline?: boolean;
  offlineItem?: QueuedOfflineItem;
};

const isOnline = useOnline();
const { products, storeNames, history, error } = usePriceCatalog(
  "Could not load items.",
);
const search = ref("");
const storeId = ref("");
const sort = ref<ItemSort>("most-bought");
const selectedItemId = ref<string | null>(null);
const offlineItems = ref<QueuedOfflineItem[]>([]);
const selectedOfflineItem = ref<QueuedOfflineItem | null>(null);
const today = localIsoDate();

async function loadOfflineItems() {
  try {
    offlineItems.value = await getOfflineItems();
  } catch {
    offlineItems.value = [];
  }
}

onMounted(() => {
  void loadOfflineItems();
});

const catalog = computed(() =>
  products.value && storeNames.value && history.value
    ? itemCatalog(products.value, history.value, storeNames.value, today)
    : null,
);

const baseStores = computed(() =>
  catalog.value ? catalogStores(catalog.value) : [],
);

const stores = computed(() => {
  const seen = new Set<string>();
  const list: Array<{ id: string; name: string }> = [];

  for (const store of baseStores.value) {
    const trimmed = store.name.trim();
    const key = trimmed.toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      list.push({ id: store.id, name: trimmed });
    }
  }

  for (const off of offlineItems.value) {
    const sName = off.storeName?.trim();
    if (sName) {
      const key = sName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        list.push({ id: sName, name: sName });
      }
    }
  }

  return list.sort((a, b) => a.name.localeCompare(b.name));
});

const catalogRows = computed(() =>
  catalog.value
    ? browseItems(catalog.value, {
        search: search.value,
        storeId: storeId.value || null,
        sort: sort.value,
      })
    : null,
);

const offlineRows = computed<DisplayItemListing[]>(() => {
  const queryLower = search.value.trim().toLowerCase();
  const storeQuery = storeId.value.trim().toLowerCase();

  return offlineItems.value
    .filter((item) => {
      const matchesSearch =
        !queryLower ||
        (item.name && item.name.toLowerCase().includes(queryLower)) ||
        (item.storeName && item.storeName.toLowerCase().includes(queryLower)) ||
        (item.productType &&
          item.productType.toLowerCase().includes(queryLower));

      const matchesStore =
        !storeQuery ||
        (item.storeName &&
          (item.storeName.toLowerCase().includes(storeQuery) ||
            storeQuery.includes(item.storeName.toLowerCase())));

      return matchesSearch && matchesStore;
    })
    .map((item) => ({
      id: `offline_${item.id}`,
      name: item.name || "Untitled Item",
      purchases: 0,
      enlistments: 1,
      isEnlistedOnly: true,
      storeId: item.storeName || "store",
      storeName:
        [item.storeName, item.branch].filter(Boolean).join(" · ") || "Store",
      price: item.price ?? 0,
      cheapest: false,
      stale: false,
      shelfNote: null,
      isOffline: true,
      offlineItem: item,
    }));
});

const rows = computed<DisplayItemListing[] | null>(() => {
  if (catalogRows.value === null && !catalog.value) {
    return offlineRows.value.length > 0 ? offlineRows.value : null;
  }
  return [...offlineRows.value, ...(catalogRows.value || [])];
});

function purchaseLabel(count: number, isEnlistedOnly: boolean): string {
  if (isEnlistedOnly || count === 0) return "Enlisted";
  return count === 1 ? "1 purchase" : `${count} purchases`;
}

function itemCountLabel(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}
</script>

<template>
  <p
    v-if="
      error &&
      (!catalog || catalog.length === 0) &&
      offlineItems.length === 0
    "
    class="error"
    role="alert"
  >
    {{ error }}
  </p>

  <div v-else-if="rows === null">
    <EnlistQueueNotice />
    <p class="muted">
      {{
        !isOnline
          ? "You are offline. Connect to the internet once to load the items catalog."
          : "Loading items…"
      }}
    </p>
  </div>

  <div v-else-if="rows.length === 0 && (!catalog || catalog.length === 0)">
    <EnlistQueueNotice />
    <div class="card" style="text-align: center; padding: 32px 16px">
      <p class="muted">
        No items yet. Scan a receipt or enlist an item from photos.
      </p>
      <RouterLink
        to="/items/enlist"
        class="btn"
        style="
          display: inline-block;
          width: auto;
          padding: 10px 18px;
          text-decoration: none;
          margin-top: 8px;
        "
      >
        + Enlist an item
      </RouterLink>
    </div>
  </div>

  <div v-else>
    <EnlistQueueNotice />

    <div v-if="!isOnline" style="margin-bottom: 12px">
      <span class="pill warn" style="font-size: 11px">
        ⚡ Offline · Viewing offline items and cached catalog
      </span>
    </div>

    <div
      style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      "
    >
      <p class="muted" role="status" style="margin: 0">
        {{ itemCountLabel(rows.length) }}
      </p>
      <RouterLink
        to="/items/enlist"
        class="btn"
        style="
          width: auto;
          padding: 8px 14px;
          font-size: 13px;
          text-decoration: none;
        "
      >
        + Enlist item
      </RouterLink>
    </div>

    <div class="item-tools">
      <label class="field" for="item-search">
        <span>Search</span>
        <input
          id="item-search"
          v-model="search"
          class="cell"
          type="search"
          placeholder="Item name"
        />
      </label>
      <div class="grid-2">
        <label class="field" for="item-store">
          <span>Store</span>
          <select id="item-store" v-model="storeId" class="cell">
            <option value="">All stores</option>
            <option v-for="s in stores" :key="s.id" :value="s.id">
              {{ s.name }}
            </option>
          </select>
        </label>
        <label class="field" for="item-sort">
          <span>Sort</span>
          <select id="item-sort" v-model="sort" class="cell">
            <option
              v-for="option in SORTS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <p class="muted" role="status">{{ itemCountLabel(rows.length) }}</p>

    <p v-if="rows.length === 0" class="muted">No items match.</p>

    <div v-else class="card">
      <button
        v-for="item in rows"
        :key="item.id"
        type="button"
        class="row item-row-button"
        :aria-label="`View details for ${item.name}`"
        @click="
          () => {
            if (item.isOffline && item.offlineItem) {
              selectedOfflineItem = item.offlineItem;
            } else {
              selectedItemId = item.id;
            }
          }
        "
      >
        <div class="item-row-info">
          <div
            style="
              display: flex;
              align-items: center;
              gap: 6px;
              flex-wrap: wrap;
            "
          >
            <div class="name">{{ item.name }}</div>
            <span
              v-if="item.isOffline"
              class="pill warn"
              style="font-size: 10px; padding: 1px 6px"
            >
              ⏳ Not synced
            </span>
          </div>
          <div class="muted">
            {{
              item.isOffline
                ? `Enlisted (offline) · ${item.storeName}`
                : `${purchaseLabel(item.purchases, item.isEnlistedOnly)} · ${item.storeName}${item.cheapest ? " · cheapest" : ""}`
            }}
          </div>
          <div v-if="item.shelfNote" class="muted">{{ item.shelfNote }}</div>
          <span v-if="item.stale" class="pill warn">Older than 30 days</span>
        </div>
        <div class="item-row-right">
          <div
            :class="item.cheapest ? 'compare-price down' : 'compare-price'"
          >
            {{ formatPeso(item.price) }}
          </div>
          <span class="item-row-chevron" aria-hidden="true">›</span>
        </div>
      </button>
    </div>

    <ItemDetailModal
      :item-id="selectedItemId"
      :products="products"
      :history="history"
      :store-names="storeNames"
      @close="selectedItemId = null"
    />

    <OfflineItemDetailModal
      :item="selectedOfflineItem"
      @close="selectedOfflineItem = null"
      @item-updated="
        loadOfflineItems();
        selectedOfflineItem = null;
      "
      @item-deleted="
        loadOfflineItems();
        selectedOfflineItem = null;
      "
      @item-synced="
        loadOfflineItems();
        selectedOfflineItem = null;
      "
    />
  </div>
</template>

