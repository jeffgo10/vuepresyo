<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import { enlistImageObjectPath } from "@/domain/keys";
import { compressReceiptImage } from "@/src/helpers/images/compress-receipt-image";
import { useOnline } from "@/src/helpers/use-online";
import { refreshPriceCatalog } from "@/src/helpers/catalog/use-price-catalog";
import { callBackendFunction, uploadStorageBlob } from "@/src/lib/api";
import {
  deleteOfflineItem,
  updateOfflineItem,
  type QueuedOfflineItem,
} from "@/src/lib/offline-queue";

const props = defineProps<{
  item: QueuedOfflineItem | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "itemUpdated"): void;
  (e: "itemDeleted"): void;
  (e: "itemSynced"): void;
}>();

const isOnline = useOnline();
const name = ref("");
const storeName = ref("");
const branch = ref("");
const price = ref("");
const unit = ref("pc");
const sku = ref("");
const productType = ref("");
const photos = ref<Blob[]>([]);
const activePhotoIdx = ref(0);
const saving = ref(false);
const syncing = ref(false);
const syncStatus = ref<string | null>(null);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

watch(
  () => props.item,
  (val) => {
    if (!val) return;
    name.value = val.name || "";
    storeName.value = val.storeName || "";
    branch.value = val.branch || "";
    price.value =
      val.price !== null && val.price !== undefined ? String(val.price) : "";
    unit.value = val.unit || "pc";
    sku.value = val.sku || "";
    productType.value = val.productType || "";
    photos.value = val.photos || [];
    activePhotoIdx.value = 0;
    error.value = null;
    notice.value = null;
  },
  { immediate: true },
);

const photoUrls = computed(() =>
  photos.value.map((b) => {
    try {
      return URL.createObjectURL(b);
    } catch {
      return "";
    }
  }),
);

onUnmounted(() => {
  for (const url of photoUrls.value) {
    if (url) URL.revokeObjectURL(url);
  }
});

const currentPhotoUrl = computed(
  () => photoUrls.value[activePhotoIdx.value] ?? null,
);

async function handleSaveChanges() {
  if (!props.item || saving.value || syncing.value) return;
  const trimmedStore = storeName.value.trim();
  if (!trimmedStore) {
    error.value = "Store name cannot be empty.";
    return;
  }
  const numPrice = price.value.trim() ? parseFloat(price.value) : null;
  if (numPrice !== null && (Number.isNaN(numPrice) || numPrice <= 0)) {
    error.value = "Please enter a valid price greater than 0.";
    return;
  }

  saving.value = true;
  error.value = null;
  try {
    await updateOfflineItem(props.item.id, {
      name: name.value.trim() || undefined,
      storeName: trimmedStore,
      branch: branch.value.trim() || null,
      price: numPrice,
      sku: sku.value.trim() || null,
      unit: unit.value.trim() || "pc",
      productType: productType.value.trim() || null,
      photos: photos.value,
    });
    notice.value = "Changes saved to offline queue!";
    emit("itemUpdated");
  } catch (caught: unknown) {
    error.value =
      caught instanceof Error
        ? caught.message
        : "Failed to update offline item.";
  } finally {
    saving.value = false;
  }
}

async function handleSyncNow() {
  if (!props.item || syncing.value || saving.value) return;
  if (!isOnline.value) {
    error.value = "Cannot sync while offline.";
    return;
  }
  const trimmedStore = storeName.value.trim();
  const trimmedName = name.value.trim();
  const numPrice = parseFloat(price.value);

  if (!trimmedStore || !trimmedName || Number.isNaN(numPrice) || numPrice <= 0) {
    error.value = "Store name, product name, and valid price are required.";
    return;
  }

  syncing.value = true;
  error.value = null;
  syncStatus.value = "Uploading photos…";

  try {
    const tempId = `sync_${props.item.id.slice(0, 12)}_${Date.now()}`;
    const uploadedPaths: string[] = [];

    for (let i = 0; i < photos.value.length; i++) {
      syncStatus.value = `Uploading photo ${i + 1} of ${photos.value.length}…`;
      const path = enlistImageObjectPath(tempId, i);
      let blob = photos.value[i];
      if (blob.size > 400 * 1024) {
        try {
          blob = await compressReceiptImage(blob);
        } catch {
          // keep original
        }
      }
      await uploadStorageBlob(path, blob);
      uploadedPaths.push(path);
    }

    syncStatus.value = "Saving item to database…";
    await callBackendFunction("saveEnlistedProduct", {
      storeName: trimmedStore,
      branch: branch.value.trim() || null,
      name: trimmedName,
      price: numPrice,
      sku: sku.value.trim() || null,
      unit: unit.value.trim() || "pc",
      productType: productType.value.trim() || null,
      imagePaths: uploadedPaths,
    });

    await deleteOfflineItem(props.item.id);
    await refreshPriceCatalog();
    emit("itemSynced");
    emit("close");
  } catch (caught: unknown) {
    error.value = caught instanceof Error ? caught.message : "Sync failed.";
  } finally {
    syncing.value = false;
    syncStatus.value = null;
  }
}

async function handleDiscard() {
  if (!props.item) return;
  if (!window.confirm("Are you sure you want to discard this offline item?"))
    return;
  try {
    await deleteOfflineItem(props.item.id);
    emit("itemDeleted");
    emit("close");
  } catch (caught: unknown) {
    error.value =
      caught instanceof Error ? caught.message : "Failed to discard item.";
  }
}
</script>

<template>
  <div
    v-if="item"
    class="modal-backdrop"
    role="presentation"
    @click.self="if (!saving && !syncing) emit('close');"
  >
    <div class="modal-sheet" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-header-text">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
            <h2 class="modal-title" style="margin: 0">
              {{ name.trim() || "Offline Item" }}
            </h2>
            <span class="pill warn" style="font-size: 11px">⏳ Not synced</span>
          </div>
          <div class="modal-pills" style="margin-top: 4px">
            <span class="pill">
              {{ storeName || "Store" }}{{ branch ? ` · ${branch}` : "" }}
            </span>
          </div>
        </div>
        <button
          type="button"
          class="modal-close-btn"
          aria-label="Close"
          :disabled="saving || syncing"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <div v-if="error" class="error" role="alert" style="margin: 8px 0">
          {{ error }}
        </div>
        <div
          v-if="notice"
          class="pill ok"
          role="status"
          style="margin: 8px 0; width: fit-content"
        >
          ✓ {{ notice }}
        </div>
        <div v-if="syncStatus" class="sync-status-bar" style="margin: 8px 0">
          <span class="spinner sm" aria-hidden="true" />
          <span>{{ syncStatus }}</span>
        </div>

        <div v-if="currentPhotoUrl" class="modal-photo-section">
          <div class="modal-photo-container">
            <img
              :src="currentPhotoUrl"
              :alt="name || 'Offline photo'"
              class="modal-photo-img"
            />
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 12px">
          <label class="field" style="margin: 0">
            <span>Product Name</span>
            <input
              v-model="name"
              class="cell"
              type="text"
              placeholder="e.g. Pocari Sweat 500ml"
              :disabled="saving || syncing"
            />
          </label>
          <label class="field" style="margin: 0">
            <span>Product Type / Category</span>
            <input
              v-model="productType"
              class="cell"
              type="text"
              placeholder="e.g. Coconut Oil, Rosquillos, Soda"
              :disabled="saving || syncing"
            />
          </label>
          <div class="grid-2" style="gap: 8px">
            <label class="field" style="margin: 0">
              <span>Store Name</span>
              <input
                v-model="storeName"
                class="cell"
                type="text"
                :disabled="saving || syncing"
              />
            </label>
            <label class="field" style="margin: 0">
              <span>Branch / Area</span>
              <input
                v-model="branch"
                class="cell"
                type="text"
                :disabled="saving || syncing"
              />
            </label>
          </div>
          <div class="grid-2" style="gap: 8px">
            <label class="field" style="margin: 0">
              <span>Price (PHP)</span>
              <input
                v-model="price"
                class="cell"
                type="number"
                step="0.01"
                min="0"
                :disabled="saving || syncing"
              />
            </label>
            <label class="field" style="margin: 0">
              <span>Unit / Packaging</span>
              <input
                v-model="unit"
                class="cell"
                type="text"
                :disabled="saving || syncing"
              />
            </label>
          </div>
          <label class="field" style="margin: 0">
            <span>SKU / Barcode (Optional)</span>
            <input
              v-model="sku"
              class="cell"
              type="text"
              :disabled="saving || syncing"
            />
          </label>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 16px">
          <div style="display: flex; gap: 8px">
            <button
              type="button"
              class="btn"
              style="flex: 1; padding: 10px"
              :disabled="saving || syncing"
              @click="handleSaveChanges"
            >
              {{ saving ? "Saving…" : "Save Changes" }}
            </button>
            <button
              v-if="isOnline"
              type="button"
              class="btn ok"
              style="flex: 1; padding: 10px"
              :disabled="saving || syncing"
              @click="handleSyncNow"
            >
              {{ syncing ? "Syncing…" : "Sync Now" }}
            </button>
          </div>
          <div style="display: flex; gap: 8px">
            <button
              type="button"
              class="btn bad"
              style="flex: 1; padding: 10px"
              :disabled="saving || syncing"
              @click="handleDiscard"
            >
              Discard Item
            </button>
            <button
              type="button"
              class="btn ghost"
              style="flex: 1; padding: 10px"
              :disabled="saving || syncing"
              @click="emit('close')"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

