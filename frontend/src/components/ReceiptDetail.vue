<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, RouterLink } from "vue-router";
import { compareReceiptItemPrice } from "@/domain/receipt-item-compare";
import { formatPeso, formatReceiptDate } from "@/domain/money";
import { localIsoDate, type CompareProduct } from "@/domain/store-compare";
import type { LineFlag, SavedReceipt, VatType } from "@/domain/types";
import { usePriceCatalog } from "@/src/helpers/catalog/use-price-catalog";
import ItemDetailModal from "@/src/components/ItemDetailModal.vue";
import { apiFetch, getStorageDownloadUrl } from "@/src/lib/api";
import { safeGetCachedData, safeSetCachedData } from "@/src/lib/offline-queue";

type ReceiptItemRow = {
  id: string;
  itemKey: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  vatType: VatType | null;
  flags: LineFlag[];
};

const FLAG_LABELS: Record<LineFlag, string> = {
  struck_through: "struck through",
  unclear_name: "check name",
  unclear_price: "check price",
  unclear_sku: "check SKU",
};

const route = useRoute();
const receiptId = computed(() =>
  typeof route.query.id === "string" ? route.query.id : null,
);

const receipt = ref<SavedReceipt | null | undefined>(undefined);
const items = ref<ReceiptItemRow[] | null>(null);
const selectedItemId = ref<string | null>(null);
const showPhoto = ref(false);

const { products, storeNames, history } = usePriceCatalog(
  "Could not load catalog.",
);

const today = localIsoDate();

const productMap = computed(() => {
  const map = new Map<string, CompareProduct>();
  for (const p of products.value ?? []) {
    map.set(p.key, p);
  }
  return map;
});

const imageUrl = computed(() => {
  if (!showPhoto.value || !receipt.value?.imagePath) return null;
  return getStorageDownloadUrl(receipt.value.imagePath);
});

watch(
  receiptId,
  async (id) => {
    if (!id) {
      receipt.value = null;
      items.value = [];
      return;
    }

    receipt.value = undefined;
    items.value = null;

    const cachedRec = await safeGetCachedData<SavedReceipt>(
      `cached_receipt_${id}`,
    );
    if (cachedRec) receipt.value = cachedRec;

    const cachedItems = await safeGetCachedData<ReceiptItemRow[]>(
      `cached_receipt_items_${id}`,
    );
    if (cachedItems) items.value = cachedItems;

    try {
      const res = await apiFetch<{
        receipt: SavedReceipt;
        items: ReceiptItemRow[];
      }>(`/api/receipts/${encodeURIComponent(id)}`);
      receipt.value = res.receipt;
      items.value = (res.items ?? []).map((item) => ({
        ...item,
        flags: Array.isArray(item.flags) ? item.flags : [],
      }));
      void safeSetCachedData(`cached_receipt_${id}`, res.receipt);
      void safeSetCachedData(`cached_receipt_items_${id}`, items.value);
    } catch {
      if (receipt.value === undefined) receipt.value = null;
      if (!items.value) items.value = [];
    }
  },
  { immediate: true },
);

function getComparison(item: ReceiptItemRow) {
  if (!receipt.value || !products.value || !history.value || !storeNames.value)
    return null;
  return compareReceiptItemPrice({
    itemKey: item.itemKey,
    unitPrice: item.unitPrice,
    vatType: item.vatType,
    receiptStoreId: receipt.value.storeId,
    products: products.value,
    history: history.value,
    storeNames: storeNames.value,
    today,
  });
}
</script>

<template>
  <p v-if="receipt === undefined" class="muted">Loading receipt details…</p>

  <div v-else-if="!receipt || !receiptId" class="card">
    <p class="muted">Receipt not found.</p>
    <RouterLink
      class="receipt-back-link"
      to="/receipts"
      style="margin-top: 8px"
    >
      ← Back to receipts
    </RouterLink>
  </div>

  <div v-else>
    <RouterLink class="receipt-back-link" to="/receipts">
      ← Receipts
    </RouterLink>

    <div class="card">
      <div class="name" style="font-size: 18px">{{ receipt.storeName }}</div>
      <div v-if="receipt.branch" class="muted">{{ receipt.branch }}</div>

      <div class="receipt-meta-grid">
        <div class="receipt-meta-item">
          <span class="receipt-meta-label">Date</span>
          <span class="receipt-meta-value">
            {{ formatReceiptDate(receipt.date)
            }}{{ receipt.time ? ` · ${receipt.time}` : "" }}
          </span>
        </div>
        <div v-if="receipt.invoiceNo" class="receipt-meta-item">
          <span class="receipt-meta-label">Invoice No</span>
          <span class="receipt-meta-value">{{ receipt.invoiceNo }}</span>
        </div>
        <div class="receipt-meta-item">
          <span class="receipt-meta-label">Scanned by</span>
          <span class="receipt-meta-value">{{ receipt.createdByName }}</span>
        </div>
      </div>

      <div v-if="receipt.imagePath">
        <button
          type="button"
          class="receipt-photo-toggle-btn"
          @click="showPhoto = !showPhoto"
        >
          <span>📷</span>
          {{ showPhoto ? "Hide receipt photo" : "View receipt photo" }}
        </button>
        <div v-if="showPhoto && imageUrl" class="receipt-photo-wrap">
          <img :src="imageUrl" alt="Receipt photo" class="photo" />
        </div>
      </div>
    </div>

    <div class="card">
      <div
        class="row"
        :style="{
          alignItems: 'baseline',
          borderBottom:
            (items && items.length > 0) || receipt.discrepancyNote
              ? '1px solid var(--line)'
              : '0',
        }"
      >
        <div>
          <span class="receipt-meta-label">Total Amount</span>
          <div class="name" style="font-size: 22px; color: var(--brand)">
            {{ formatPeso(receipt.total) }}
          </div>
        </div>
        <div class="muted" style="text-align: right">
          {{ receipt.itemCount }} items
        </div>
      </div>

      <div
        v-if="receipt.discrepancyNote"
        style="
          margin: 10px 0 6px;
          padding: 10px 12px;
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid var(--warn, #f59e0b);
          border-radius: 8px;
        "
      >
        <div
          style="
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 600;
            color: var(--warn, #f59e0b);
            font-size: 13px;
            margin-bottom: 2px;
          "
        >
          <span>⚠️</span> Discrepancy Note
        </div>
        <div style="font-size: 13px; line-height: 1.4">
          {{ receipt.discrepancyNote }}
        </div>
      </div>

      <div
        v-if="
          receipt.vatableNet != null ||
          receipt.vat != null ||
          receipt.vatExemptSales > 0
        "
        class="receipt-meta-grid"
        style="border-top: 0; margin-top: 8px"
      >
        <div v-if="receipt.vatableNet != null" class="receipt-meta-item">
          <span class="receipt-meta-label">Vatable Net</span>
          <span class="receipt-meta-value">
            {{ formatPeso(receipt.vatableNet) }}
          </span>
        </div>
        <div v-if="receipt.vat != null" class="receipt-meta-item">
          <span class="receipt-meta-label">VAT (12%)</span>
          <span class="receipt-meta-value">{{ formatPeso(receipt.vat) }}</span>
        </div>
        <div v-if="receipt.vatExemptSales > 0" class="receipt-meta-item">
          <span class="receipt-meta-label">VAT-Exempt</span>
          <span class="receipt-meta-value">
            {{ formatPeso(receipt.vatExemptSales) }}
          </span>
        </div>
      </div>
    </div>

    <h2>Items ({{ items ? items.length : receipt.itemCount }})</h2>

    <p v-if="!items" class="muted">Loading items…</p>
    <p v-else-if="items.length === 0" class="muted">
      No items recorded for this receipt.
    </p>
    <div v-else class="card">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="receipt-item-row"
        @click="selectedItemId = item.itemKey"
      >
        <div class="receipt-item-main">
          <div class="name">
            {{
              productMap.get(item.itemKey)?.name ||
              productMap.get(item.itemKey)?.rawName ||
              item.itemKey
            }}
          </div>
          <div class="muted" style="margin-top: 2px">
            <span v-if="productMap.get(item.itemKey)?.sku" class="sku">
              SKU {{ productMap.get(item.itemKey)?.sku }} ·
            </span>
            {{ item.qty }} × {{ formatPeso(item.unitPrice) }}
          </div>

          <div class="receipt-item-badges">
            <span v-if="item.vatType === 'EXEMPT'" class="pill">
              VAT-Exempt
            </span>
            <span v-if="item.vatType === 'FREE'" class="pill">FREE</span>
            <span
              v-for="flag in item.flags ?? []"
              :key="flag"
              class="pill warn"
            >
              {{ FLAG_LABELS[flag] ?? flag }}
            </span>

            <template v-if="getComparison(item)?.isLowest">
              <div class="lowest-price-badge-row">
                <span class="pill ok">Lowest price</span>
                <span
                  v-if="
                    getComparison(item)?.strictlyCheaper &&
                    getComparison(item)?.cheapestOtherOffer
                  "
                  class="lowest-price-savings"
                >
                  Save
                  {{ formatPeso(getComparison(item)!.savingsVsCheapest) }} vs
                  {{ getComparison(item)!.cheapestOtherOffer!.storeName }}
                </span>
              </div>
            </template>
            <span
              v-else-if="
                getComparison(item) &&
                getComparison(item)!.otherStoresCount > 0 &&
                getComparison(item)!.cheapestOtherOffer
              "
              class="price-diff-note"
            >
              +{{ formatPeso(getComparison(item)!.deltaVsCheapest) }} vs
              {{ getComparison(item)!.cheapestOtherOffer!.storeName }}
            </span>
          </div>
        </div>

        <div class="receipt-row-right">
          <div class="name">{{ formatPeso(item.lineTotal) }}</div>
          <span class="receipt-row-chevron" aria-hidden="true">›</span>
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
  </div>
</template>

