<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { buildItemDetail, type ItemDetail } from "@/domain/item-detail";
import { formatPeso, formatReceiptDate } from "@/domain/money";
import { localIsoDate, type CompareProduct } from "@/domain/store-compare";
import type { PricePoint } from "@/domain/price-change";
import { productImagePath } from "@/domain/keys";
import { namesDiffer } from "@/domain/products";
import { compressReceiptImage } from "@/src/helpers/images/compress-receipt-image";
import { refreshPriceCatalog } from "@/src/helpers/catalog/use-price-catalog";
import {
  callBackendFunction,
  getStorageDownloadUrl,
  uploadStorageBlob,
} from "@/src/lib/api";

const props = defineProps<{
  itemId: string | null;
  products: CompareProduct[] | null;
  history: Record<string, PricePoint[]> | null;
  storeNames: Record<string, string> | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const currentYear = localIsoDate().slice(0, 4);
const isEditing = ref(false);
const targetItemKey = ref<string | null>(null);
const editScope = ref<"store" | "all">("store");
const editName = ref("");
const editUnit = ref("");
const editProductType = ref("");
const saving = ref(false);
const editError = ref<string | null>(null);
const editNotice = ref<string | null>(null);

// Photo upload states
const activePhotoIdx = ref(0);
const previewUrl = ref<string | null>(null);
const uploadingPhoto = ref(false);
const uploadStatus = ref<string | null>(null);
const uploadError = ref<string | null>(null);
const photoNotice = ref<string | null>(null);
const suggestedRename = ref<{
  suggestedName: string;
  suggestedUnit?: string | null;
  match: { itemKey: string; name: string; storeName: string } | null;
} | null>(null);
const suggestedMatch = ref<{
  itemKey: string;
  name: string;
  storeName: string;
} | null>(null);

const detail = computed<ItemDetail | null>(() => {
  if (!props.itemId || !props.products || !props.history || !props.storeNames) {
    return null;
  }
  return buildItemDetail(
    props.itemId,
    props.products,
    props.history,
    props.storeNames,
    localIsoDate(),
  );
});

const targetStore = computed(() => {
  if (!detail.value) return null;
  if (targetItemKey.value) {
    return (
      detail.value.storePrices.find((s) => s.itemKey === targetItemKey.value) ??
      null
    );
  }
  return (
    detail.value.storePrices.find((s) => s.itemKey === props.itemId) ??
    detail.value.storePrices.find((s) => s.itemKey === detail.value?.itemKey) ??
    detail.value.storePrices[0] ??
    null
  );
});

const photoUrls = computed(() => {
  if (!detail.value) return [];
  const paths =
    detail.value.imagePaths && detail.value.imagePaths.length > 0
      ? detail.value.imagePaths
      : detail.value.imagePath
      ? [detail.value.imagePath]
      : [];
  return paths.map((p) => getStorageDownloadUrl(p));
});

const currentPhoto = computed(
  () =>
    previewUrl.value ??
    photoUrls.value[activePhotoIdx.value] ??
    photoUrls.value[0] ??
    null,
);

const productTypesList = computed(() => {
  const set = new Set<string>();
  for (const p of props.products ?? []) {
    if (p.productType?.trim()) set.add(p.productType.trim());
  }
  return Array.from(set);
});

watch(
  () => props.itemId,
  () => {
    isEditing.value = false;
    targetItemKey.value = null;
    editError.value = null;
    editNotice.value = null;
    activePhotoIdx.value = 0;
    previewUrl.value = null;
    uploadError.value = null;
    photoNotice.value = null;
    suggestedRename.value = null;
    suggestedMatch.value = null;
  },
);

function formatFullDate(isoDate: string): string {
  const shortDate = formatReceiptDate(isoDate);
  const year = isoDate.slice(0, 4);
  return year === currentYear ? shortDate : `${shortDate}, ${year}`;
}

function handleClose() {
  isEditing.value = false;
  emit("close");
}

function openEdit(forStoreKey?: string) {
  if (!detail.value) return;
  const store =
    (forStoreKey
      ? detail.value.storePrices.find((s) => s.itemKey === forStoreKey)
      : null) ??
    detail.value.storePrices.find((s) => s.itemKey === props.itemId) ??
    detail.value.storePrices.find((s) => s.itemKey === detail.value?.itemKey) ??
    detail.value.storePrices[0];

  const storeKey = store?.itemKey ?? detail.value.itemKey;
  targetItemKey.value = storeKey;
  editName.value = store?.productName || detail.value.name;
  editUnit.value = store?.unit || detail.value.unit || "pc";
  editProductType.value = detail.value.productType || "";
  editScope.value = detail.value.storePrices.length > 1 ? "store" : "all";
  editError.value = null;
  editNotice.value = null;
  isEditing.value = true;
}

async function handleSaveProduct() {
  if (!detail.value || !editName.value.trim()) return;
  saving.value = true;
  editError.value = null;
  editNotice.value = null;
  try {
    const activeKey =
      editScope.value === "store" && targetItemKey.value
        ? targetItemKey.value
        : detail.value.itemKey;
    await callBackendFunction("updateProductInfo", {
      itemKey: activeKey,
      name: editName.value.trim(),
      unit: editUnit.value.trim() || undefined,
      productType: editProductType.value.trim() || null,
      scope: editScope.value,
    });
    await refreshPriceCatalog();
    editNotice.value = `Saved "${editName.value.trim()}".`;
    isEditing.value = false;
  } catch (caught: unknown) {
    editError.value =
      caught instanceof Error ? caught.message : "Could not update product.";
  } finally {
    saving.value = false;
  }
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !detail.value) return;

  uploadError.value = null;
  photoNotice.value = null;
  suggestedRename.value = null;
  suggestedMatch.value = null;
  uploadingPhoto.value = true;
  uploadStatus.value = "Compressing photo…";
  previewUrl.value = URL.createObjectURL(file);

  try {
    const blob = await compressReceiptImage(file);
    uploadStatus.value = "Uploading photo…";
    const path = productImagePath(detail.value.itemKey);
    await uploadStorageBlob(path, blob);

    uploadStatus.value = "Saving package photo…";
    const res = await callBackendFunction<
      { itemKey: string },
      {
        suggestedName: string | null;
        suggestedUnit?: string | null;
        match: { itemKey: string; name: string; storeName: string } | null;
        notice: string | null;
      }
    >("describeProduct", { itemKey: detail.value.itemKey });

    await refreshPriceCatalog();

    if (
      res.suggestedName &&
      namesDiffer(detail.value.name, res.suggestedName)
    ) {
      suggestedRename.value = {
        suggestedName: res.suggestedName,
        suggestedUnit: res.suggestedUnit,
        match: res.match,
      };
      uploadStatus.value = null;
      return;
    }
    if (res.match) {
      suggestedMatch.value = res.match;
      uploadStatus.value = null;
      return;
    }
    photoNotice.value = res.notice ?? "Photo saved.";
    uploadStatus.value = null;
  } catch (err: unknown) {
    previewUrl.value = null;
    uploadError.value =
      err instanceof Error ? err.message : "Could not upload package photo.";
  } finally {
    uploadingPhoto.value = false;
  }
}

async function applyRename() {
  if (!detail.value || !suggestedRename.value) return;
  const { suggestedName, suggestedUnit, match } = suggestedRename.value;
  try {
    await callBackendFunction("confirmProductName", {
      itemKey: detail.value.itemKey,
      name: suggestedName,
      unit: suggestedUnit || undefined,
    });
    await refreshPriceCatalog();
    suggestedRename.value = null;
    if (match) {
      suggestedMatch.value = match;
    } else {
      photoNotice.value = `Saved "${suggestedName}".`;
    }
  } catch (err: unknown) {
    uploadError.value =
      err instanceof Error ? err.message : "Could not save suggested name.";
  }
}

async function resolveMatch(same: boolean) {
  if (!detail.value || !suggestedMatch.value) return;
  const match = suggestedMatch.value;
  try {
    await callBackendFunction("resolveProductMatch", {
      itemKey: detail.value.itemKey,
      otherKey: match.itemKey,
      same,
    });
    await refreshPriceCatalog();
    suggestedMatch.value = null;
    photoNotice.value = same
      ? `Linked with ${match.name} at ${match.storeName}.`
      : "Photo saved. Prices stay separate.";
  } catch (err: unknown) {
    uploadError.value =
      err instanceof Error ? err.message : "Could not link product.";
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.itemId) {
    handleClose();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeyDown);
});
</script>

<template>
  <div
    v-if="itemId"
    class="modal-backdrop"
    role="presentation"
    @click.self="handleClose"
  >
    <div class="modal-sheet" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-header-text">
          <div
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;
            "
          >
            <h2 class="modal-title" style="margin: 0">
              {{ detail ? detail.name : "Item Information" }}
            </h2>
            <button
              v-if="detail && !isEditing"
              type="button"
              class="btn-edit-item"
              aria-label="Edit item details"
              @click="openEdit()"
            >
              ✏️ Edit
            </button>
          </div>
          <div v-if="detail" class="modal-pills">
            <span v-for="sku in detail.skus" :key="sku" class="pill sku">
              SKU {{ sku }}
            </span>
            <span v-if="detail.productType" class="pill ok">
              Type: {{ detail.productType }}
            </span>
            <span v-if="detail.productId" class="pill ok">
              Linked · {{ detail.storePrices.length }}
              {{ detail.storePrices.length === 1 ? "store" : "stores" }}
            </span>
            <span v-if="detail.packSize" class="pill">
              {{ detail.packSize }}
            </span>
            <span v-if="detail.isEnlistedOnly" class="pill">
              Enlisted · Not purchased
            </span>
            <span v-else class="pill">
              {{ detail.totalPurchases }}
              {{ detail.totalPurchases === 1 ? "purchase" : "purchases" }}
            </span>
          </div>
        </div>
        <button
          type="button"
          class="modal-close-btn"
          aria-label="Close item details"
          @click="handleClose"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <p v-if="!detail" class="muted">Item details not found.</p>

        <template v-else>
          <div v-if="editNotice" class="pill ok" style="width: fit-content">
            ✓ {{ editNotice }}
          </div>

          <div v-if="isEditing" class="modal-edit-card">
            <div style="font-weight: 600; font-size: 14px">
              {{
                editScope === "store" && targetStore
                  ? `Edit Offer for ${targetStore.storeName}`
                  : "Edit Product Details"
              }}
            </div>
            <div v-if="editError" class="error">{{ editError }}</div>

            <div v-if="detail.storePrices.length > 1" style="margin: 4px 0">
              <label
                style="
                  display: block;
                  font-size: 12px;
                  font-weight: 600;
                  margin-bottom: 4px;
                "
              >
                Apply changes to:
              </label>
              <div style="display: flex; gap: 12px; flex-wrap: wrap">
                <label
                  style="
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    cursor: pointer;
                  "
                >
                  <input
                    v-model="editScope"
                    type="radio"
                    name="editScope"
                    value="store"
                  />
                  <span>
                    This store only ({{
                      targetStore?.storeName ?? "Selected store"
                    }})
                  </span>
                </label>
                <label
                  style="
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    cursor: pointer;
                  "
                >
                  <input
                    v-model="editScope"
                    type="radio"
                    name="editScope"
                    value="all"
                  />
                  <span>
                    All linked stores ({{ detail.storePrices.length }})
                  </span>
                </label>
              </div>
            </div>

            <label class="field" style="margin: 0">
              <span>Product Name</span>
              <input
                v-model="editName"
                class="cell"
                placeholder="e.g. Hot Cocoa Mix 8s"
              />
            </label>
            <label class="field" style="margin: 0">
              <span>Product Type / Category</span>
              <input
                v-model="editProductType"
                class="cell"
                placeholder="e.g. Hot Cocoa Mix, Almond Milk"
                list="product-type-datalist"
              />
              <datalist id="product-type-datalist">
                <option v-for="t in productTypesList" :key="t" :value="t" />
              </datalist>
            </label>
            <label class="field" style="margin: 0">
              <span>Unit / Packaging (UOM)</span>
              <input
                v-model="editUnit"
                class="cell"
                placeholder="e.g. box of 8, 8 sachets, 8s, pc, sachet, kg"
              />
            </label>

            <div class="modal-edit-actions">
              <button
                type="button"
                class="btn"
                style="background: transparent; border: 1px solid var(--line)"
                :disabled="saving"
                @click="isEditing = false"
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn ok"
                :disabled="saving || !editName.trim()"
                @click="handleSaveProduct"
              >
                {{ saving ? "Saving..." : "Save changes" }}
              </button>
            </div>
          </div>

          <!-- Raw names -->
          <div
            v-if="
              detail.rawNames.length > 0 &&
              detail.rawNames.some(
                (raw) => raw.toLowerCase() !== detail?.name.toLowerCase(),
              )
            "
            class="modal-raw-names"
          >
            <span class="muted">Printed on receipt: </span>
            <span class="raw-name-text">{{ detail.rawNames.join(" · ") }}</span>
          </div>

          <!-- Package Photo Section -->
          <section class="modal-section">
            <div
              style="
                display: flex;
                justify-content: space-between;
                align-items: center;
              "
            >
              <h3 class="modal-section-title" style="margin: 0">
                Package photo
              </h3>
              <label class="btn-edit-item" style="cursor: pointer">
                📷 {{ currentPhoto ? "Replace photo" : "Add photo" }}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  :disabled="uploadingPhoto"
                  @change="handleFileSelect"
                />
              </label>
            </div>

            <div v-if="uploadStatus" class="muted" style="margin-top: 6px">
              {{ uploadStatus }}
            </div>
            <div v-if="uploadError" class="error" style="margin-top: 6px">
              {{ uploadError }}
            </div>
            <div
              v-if="photoNotice"
              class="pill ok"
              style="margin-top: 6px; width: fit-content"
            >
              ✓ {{ photoNotice }}
            </div>

            <div v-if="suggestedRename" class="card" style="margin-top: 8px">
              <div class="name">
                Use package name "{{ suggestedRename.suggestedName }}"?
              </div>
              <div style="display: flex; gap: 8px; margin-top: 8px">
                <button type="button" class="btn ok" @click="applyRename">
                  Use package name
                </button>
                <button
                  type="button"
                  class="btn ghost"
                  @click="suggestedRename = null"
                >
                  Keep current
                </button>
              </div>
            </div>

            <div v-if="suggestedMatch" class="card" style="margin-top: 8px">
              <div class="name">
                Same item at {{ suggestedMatch.storeName }}?
              </div>
              <p class="muted">{{ suggestedMatch.name }} looks like a match.</p>
              <div style="display: flex; gap: 8px; margin-top: 8px">
                <button
                  type="button"
                  class="btn ok"
                  @click="resolveMatch(true)"
                >
                  Yes, link
                </button>
                <button
                  type="button"
                  class="btn ghost"
                  @click="resolveMatch(false)"
                >
                  Not the same
                </button>
              </div>
            </div>

            <div v-if="currentPhoto" class="modal-photo-section" style="margin-top: 8px">
              <div class="modal-photo-container">
                <img
                  :src="currentPhoto"
                  :alt="detail.name"
                  class="modal-photo-img"
                />
              </div>
            </div>
          </section>

          <!-- Current Store Prices -->
          <section
            class="modal-section"
            aria-labelledby="store-prices-heading"
          >
            <h3 id="store-prices-heading" class="modal-section-title">
              Current store prices
            </h3>
            <p v-if="detail.storePrices.length === 0" class="muted">
              No current store prices found.
            </p>
            <div v-else class="modal-store-list">
              <div
                v-for="store in detail.storePrices"
                :key="store.itemKey"
                :class="['modal-store-card', { cheapest: store.cheapest }]"
              >
                <div class="modal-store-info">
                  <div
                    class="modal-store-name-row"
                    style="display: flex; align-items: center; gap: 6px"
                  >
                    <span class="name">{{ store.storeName }}</span>
                    <span v-if="store.cheapest" class="pill ok">Cheapest</span>
                    <span v-if="store.stale" class="pill warn">
                      Older than 30d
                    </span>
                    <button
                      type="button"
                      class="btn-edit-item"
                      style="margin-left: auto; padding: 2px 8px; font-size: 11px"
                      @click="openEdit(store.itemKey)"
                    >
                      ✏️ Edit
                    </button>
                  </div>
                  <div
                    class="muted"
                    style="
                      font-size: 12px;
                      display: flex;
                      gap: 6px;
                      align-items: center;
                      flex-wrap: wrap;
                      margin-top: 2px;
                    "
                  >
                    <span v-if="store.productName !== detail.name">
                      {{ store.productName }} ·
                    </span>
                    <span
                      class="pill"
                      style="font-size: 11px; padding: 1px 6px"
                    >
                      {{ store.unit }}
                    </span>
                    <span>·</span>
                    <span>
                      {{
                        store.purchasesCount === 0
                          ? `Enlisted: ${formatFullDate(store.date)}`
                          : store.lastIsEnlist
                          ? `Enlisted: ${formatFullDate(store.date)} · ${store.purchasesCount} ${store.purchasesCount === 1 ? "purchase" : "purchases"}`
                          : `Last purchase: ${formatFullDate(store.date)} · ${store.purchasesCount} ${store.purchasesCount === 1 ? "time" : "times"}`
                      }}
                    </span>
                  </div>
                  <div v-if="store.shelfNote" class="muted" style="margin-top: 2px">
                    {{ store.shelfNote }}
                  </div>
                </div>
                <div class="modal-store-price-col">
                  <div
                    :class="
                      store.cheapest ? 'compare-price down' : 'compare-price'
                    "
                  >
                    {{
                      formatPeso(
                        store.shelfNote ? store.comparedPrice : store.shelfPrice,
                      )
                    }}
                  </div>
                  <span
                    v-if="store.deltaVsCheapest > 0"
                    class="muted modal-delta-text"
                  >
                    +{{ formatPeso(store.deltaVsCheapest) }}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <!-- Purchase History -->
          <section
            class="modal-section"
            aria-labelledby="purchase-history-heading"
          >
            <h3 id="purchase-history-heading" class="modal-section-title">
              {{
                detail.isEnlistedOnly
                  ? `Price history (${detail.history.length})`
                  : detail.totalEnlistments > 0
                  ? `Price & purchase history (${detail.history.length})`
                  : `Purchase history (${detail.history.length})`
              }}
            </h3>
            <p v-if="detail.history.length === 0" class="muted">
              No price records found.
            </p>
            <div v-else class="modal-history-list">
              <div
                v-for="(entry, index) in detail.history"
                :key="`${entry.receiptId}-${entry.itemKey}-${index}`"
                class="modal-history-row"
              >
                <div class="modal-history-left">
                  <div
                    class="modal-history-date"
                    style="display: flex; align-items: center; gap: 6px"
                  >
                    <span>{{ formatFullDate(entry.date) }}</span>
                    <span
                      v-if="entry.isEnlist"
                      class="pill"
                      style="font-size: 10px; padding: 1px 6px"
                    >
                      Enlisted
                    </span>
                  </div>
                  <div class="muted">{{ entry.storeName }}</div>
                </div>
                <div class="modal-history-right">
                  <div class="modal-history-price">
                    {{ formatPeso(entry.price) }}
                  </div>
                  <div
                    v-if="entry.delta !== null && entry.delta > 0"
                    class="up"
                  >
                    ▲ +{{ formatPeso(entry.delta)
                    }}{{
                      entry.percent !== null ? ` (+${entry.percent}%)` : ""
                    }}
                  </div>
                  <div
                    v-else-if="entry.delta !== null && entry.delta < 0"
                    class="down"
                  >
                    ▼ {{ formatPeso(entry.delta)
                    }}{{
                      entry.percent !== null ? ` (${entry.percent}%)` : ""
                    }}
                  </div>
                  <div v-else-if="entry.delta === 0" class="muted">
                    Unchanged
                  </div>
                  <div v-else-if="entry.isEnlist" class="muted">
                    Enlisted price
                  </div>
                  <div v-else class="muted">First purchase</div>
                </div>
              </div>
            </div>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>
