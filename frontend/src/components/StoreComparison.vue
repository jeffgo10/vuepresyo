<script setup lang="ts">
import { computed, ref } from "vue";
import { formatPeso, formatReceiptDate } from "@/domain/money";
import {
  localIsoDate,
  storeComparisons,
  type ComparedStorePrice,
} from "@/domain/store-compare";
import { productTypeComparisons } from "@/domain/product-type-compare";
import { usePriceCatalog } from "@/src/helpers/catalog/use-price-catalog";
import { useOnline } from "@/src/helpers/use-online";
import ItemDetailModal from "@/src/components/ItemDetailModal.vue";
import ProductTypeComparisonCard from "@/src/components/ProductTypeComparisonCard.vue";

const { products, storeNames, history, error } = usePriceCatalog(
  "Could not load store prices.",
);
const selectedItemId = ref<string | null>(null);
const isOnline = useOnline();
const today = localIsoDate();

const typeGroups = computed(() => {
  if (!products.value || !history.value || !storeNames.value) return [];
  return productTypeComparisons(
    products.value,
    history.value,
    storeNames.value,
    today,
  );
});

const storeGroups = computed(() => {
  if (!products.value || !history.value || !storeNames.value) return [];
  return storeComparisons(
    products.value,
    history.value,
    storeNames.value,
    today,
  );
});

function priceClassName(store: ComparedStorePrice): string {
  const cls = store.cheapest ? "down" : store.expensive ? "up" : undefined;
  return ["compare-price", cls].filter(Boolean).join(" ");
}

function priceText(store: ComparedStorePrice): string {
  const amount = formatPeso(store.comparedPrice);
  if (store.cheapest) return `${amount} · cheapest`;
  if (store.delta > 0) return `${amount} · +${formatPeso(store.delta)}`;
  return amount;
}

function staleLabel(date: string): string {
  const shown = formatReceiptDate(date);
  const year = date.slice(0, 4);
  const withYear = year === today.slice(0, 4) ? shown : `${shown}, ${year}`;
  return `Older than 30 days · ${withYear}`;
}
</script>

<template>
  <p v-if="error && !products" class="error" role="alert">{{ error }}</p>
  <p v-else-if="!products || !storeNames || !history" class="muted">
    {{
      !isOnline
        ? "You are offline. Connect to the internet once to load store price comparisons."
        : "Loading store prices…"
    }}
  </p>
  <div v-else class="compare-combined-feed">
    <div v-if="!isOnline" style="margin-bottom: 12px">
      <span class="pill warn" style="font-size: 11px">
        ⚡ Offline · Viewing cached store prices
      </span>
    </div>

    <!-- SECTION 1: Cross-SKU Product Type Comparisons -->
    <section
      class="compare-section"
      aria-labelledby="heading-product-types"
    >
      <div class="compare-section-header">
        <div style="display: flex; align-items: center; gap: 8px">
          <h2 id="heading-product-types" class="compare-section-title">
            By Product Type
          </h2>
          <span class="pill count-pill">{{ typeGroups.length }}</span>
        </div>
      </div>
      <p class="muted compare-section-desc">
        Compare different brands and package sizes of the same product (e.g.
        Coconut Oil, Rosquillos) to find the cheapest option.
      </p>

      <div v-if="typeGroups.length === 0" class="card compare-empty-card">
        <div style="font-weight: 600; margin-bottom: 4px">
          No product type comparisons yet
        </div>
        <div class="muted" style="font-size: 13px">
          Tag items with a Product Type (e.g. “Coconut Oil” or “Rosquillos”) in
          Item Details to compare them here.
        </div>
      </div>

      <div v-else class="compare-card-grid">
        <ProductTypeComparisonCard
          v-for="group in typeGroups"
          :key="group.productType"
          :group="group"
          :today="today"
          @select="(id) => (selectedItemId = id)"
        />
      </div>
    </section>

    <!-- SECTION 2: Same Items Across Stores -->
    <section
      class="compare-section"
      aria-labelledby="heading-store-compare"
    >
      <div class="compare-section-header">
        <div style="display: flex; align-items: center; gap: 8px">
          <h2 id="heading-store-compare" class="compare-section-title">
            Same Items Across Stores
          </h2>
          <span class="pill count-pill">{{ storeGroups.length }}</span>
        </div>
      </div>
      <p class="muted compare-section-desc">
        Compare the exact same product across different supermarkets.
      </p>

      <div v-if="storeGroups.length === 0" class="card compare-empty-card">
        <div style="font-weight: 600; margin-bottom: 4px">
          No store comparisons yet
        </div>
        <div class="muted" style="font-size: 13px">
          Link the same item at two stores to compare prices across
          supermarkets.
        </div>
      </div>

      <div v-else class="compare-card-grid">
        <article
          v-for="group in storeGroups"
          :key="group.productId"
          class="card compare-card"
          :aria-labelledby="`compare-${group.productId}`"
        >
          <div class="compare-card-header">
            <div>
              <h2 :id="`compare-${group.productId}`">{{ group.name }}</h2>
              <div class="muted">{{ group.basis }}</div>
            </div>
            <button
              type="button"
              class="btn-card-action"
              :aria-label="`View details for ${group.name}`"
              @click="selectedItemId = `product:${group.productId}`"
            >
              Details →
            </button>
          </div>
          <ul class="compare-list">
            <li
              v-for="store in group.stores"
              :key="store.itemKey"
              class="compare-offer"
            >
              <div class="row">
                <span>{{ store.storeName }}</span>
                <span :class="priceClassName(store)">
                  {{ priceText(store) }}
                </span>
              </div>
              <div v-if="store.shelfNote" class="muted">
                {{ store.shelfNote }}
              </div>
              <div v-if="store.stale">
                <span class="pill warn">{{ staleLabel(store.date) }}</span>
              </div>
              <div class="bar" aria-hidden="true">
                <i
                  :class="store.expensive ? 'hi' : undefined"
                  :style="{ width: `${store.barPercent}%` }"
                />
              </div>
            </li>
          </ul>
        </article>
      </div>
    </section>

    <ItemDetailModal
      :item-id="selectedItemId"
      :products="products"
      :history="history"
      :store-names="storeNames"
      @close="selectedItemId = null"
    />
  </div>
</template>

