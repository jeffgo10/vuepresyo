<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  enlistImageObjectPath,
  itemKey,
  productImageObjectPath,
  storeIdFromName,
} from "@/domain/keys";
import { compressReceiptImage } from "@/src/helpers/images/compress-receipt-image";
import {
  getCurrentCoordinates,
  type GeoLocationResult,
} from "@/src/helpers/location/detect-location";
import { useOnline } from "@/src/helpers/use-online";
import {
  refreshPriceCatalog,
  usePriceCatalog,
} from "@/src/helpers/catalog/use-price-catalog";
import { enqueueOfflineItem } from "@/src/lib/offline-queue";
import { callBackendFunction, uploadStorageBlob } from "@/src/lib/api";
import ItemEnlistPhotos, {
  type PhotoEntry,
} from "@/src/components/ItemEnlistPhotos.vue";
import StoreAutocomplete from "@/src/components/StoreAutocomplete.vue";

type CandidateMatch = {
  itemKey: string;
  name: string;
  storeId: string;
  storeName: string;
  sku: string | null;
  imagePath?: string | null;
};

type ScanEnlistResponse = {
  extraction: {
    suggestedName: string | null;
    suggestedProductType?: string | null;
    price: number | null;
    sku: string | null;
    unit: string | null;
  };
  candidateMatches: CandidateMatch[];
};

type SaveEnlistResponse = {
  success: boolean;
  itemKey: string;
  storeId: string;
  isExisting: boolean;
};

const router = useRouter();
const isOnline = useOnline();
const { stores } = usePriceCatalog();

const photos = ref<PhotoEntry[]>([]);
const storeName = ref("");
const branch = ref("");
const name = ref("");
const price = ref("");
const sku = ref("");
const unit = ref("pc");
const productType = ref("");

const location = ref<GeoLocationResult | null>(null);
const locating = ref(false);
const analyzing = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const candidateMatches = ref<CandidateMatch[]>([]);
const linkedMatchKey = ref<string | null>(null);

onMounted(() => {
  void handleDetectLocation();
});

async function handleDetectLocation() {
  locating.value = true;
  try {
    const coords = await getCurrentCoordinates();
    if (coords) {
      location.value = coords;
      if (coords.label && !storeName.value) {
        const parts = coords.label.split(",");
        storeName.value = parts[0]?.trim() || "";
        if (parts[1]) branch.value = parts[1].trim();
      }
    }
  } finally {
    locating.value = false;
  }
}

async function handleAnalyzePhotos() {
  if (photos.value.length === 0 || !isOnline.value) return;
  analyzing.value = true;
  error.value = null;
  notice.value = null;

  try {
    const tempId = `temp_${Date.now()}`;
    const uploadedPaths: string[] = [];

    for (let idx = 0; idx < photos.value.length; idx++) {
      const compressed = await compressReceiptImage(photos.value[idx].file);
      const path = enlistImageObjectPath(tempId, idx);
      await uploadStorageBlob(path, compressed);
      uploadedPaths.push(path);
    }

    const res = await callBackendFunction<
      { photoPaths: string[] },
      ScanEnlistResponse
    >("scanEnlistPhotos", { photoPaths: uploadedPaths });

    const ext = res.extraction;
    if (ext.suggestedName && !name.value) name.value = ext.suggestedName;
    if (ext.suggestedProductType && !productType.value)
      productType.value = ext.suggestedProductType;
    if (ext.price !== null && ext.price !== undefined && !price.value)
      price.value = ext.price.toString();
    if (ext.sku && !sku.value) sku.value = ext.sku;
    if (ext.unit && unit.value === "pc") unit.value = ext.unit;

    if (res.candidateMatches && res.candidateMatches.length > 0) {
      candidateMatches.value = res.candidateMatches;
    }
  } catch (caught: unknown) {
    error.value =
      caught instanceof Error ? caught.message : "Could not analyze photos.";
  } finally {
    analyzing.value = false;
  }
}

async function handleSaveOffline() {
  if (saving.value) return;
  if (photos.value.length === 0) {
    error.value = "Please take or upload at least 1 photo.";
    return;
  }
  if (!storeName.value.trim()) {
    error.value = "Please enter or select a store name.";
    return;
  }

  saving.value = true;
  error.value = null;

  try {
    const blobs = await Promise.all(
      photos.value.map((p) => compressReceiptImage(p.file)),
    );
    const parsedPrice = price.value.trim() ? parseFloat(price.value) : null;

    await enqueueOfflineItem({
      photos: blobs,
      storeName: storeName.value.trim(),
      branch: branch.value.trim() || null,
      name: name.value.trim() || undefined,
      price: parsedPrice && !Number.isNaN(parsedPrice) ? parsedPrice : null,
      sku: sku.value.trim() || null,
      unit: unit.value.trim() || "pc",
      productType: productType.value.trim() || null,
      location: location.value
        ? {
            lat: location.value.lat,
            lng: location.value.lng,
            label: location.value.label ?? undefined,
          }
        : null,
    });

    notice.value =
      "Saved to offline queue! You can sync it once you are back online.";
    setTimeout(() => {
      void router.push("/items");
    }, 1200);
  } catch (caught: unknown) {
    error.value =
      caught instanceof Error ? caught.message : "Could not save item offline.";
    saving.value = false;
  }
}

async function handleSaveOnline() {
  if (saving.value) return;
  if (photos.value.length === 0) {
    error.value = "Please take or upload at least 1 photo.";
    return;
  }
  if (!storeName.value.trim()) {
    error.value = "Please enter or select a store name.";
    return;
  }
  if (!name.value.trim()) {
    error.value = "Please enter a product name.";
    return;
  }
  const numPrice = parseFloat(price.value);
  if (Number.isNaN(numPrice) || numPrice <= 0) {
    error.value = "Please enter a valid price greater than 0.";
    return;
  }

  saving.value = true;
  error.value = null;

  try {
    const storeId = storeIdFromName(
      storeName.value,
      branch.value.trim() || null,
    );
    const targetItemKey = itemKey(
      storeId,
      sku.value.trim() || null,
      name.value.trim(),
    );
    const uploadedPaths: string[] = [];

    for (let idx = 0; idx < photos.value.length; idx++) {
      const compressed = await compressReceiptImage(photos.value[idx].file);
      const path = productImageObjectPath(targetItemKey, idx);
      await uploadStorageBlob(path, compressed);
      uploadedPaths.push(path);
    }

    const res = await callBackendFunction<
      {
        storeName: string;
        branch?: string | null;
        name: string;
        price: number;
        sku?: string | null;
        unit?: string;
        productType?: string | null;
        imagePaths: string[];
        linkedItemKey?: string | null;
      },
      SaveEnlistResponse
    >("saveEnlistedProduct", {
      storeName: storeName.value.trim(),
      branch: branch.value.trim() || null,
      name: name.value.trim(),
      price: numPrice,
      sku: sku.value.trim() || null,
      unit: unit.value.trim() || "pc",
      productType: productType.value.trim() || null,
      imagePaths: uploadedPaths,
      linkedItemKey: linkedMatchKey.value,
    });

    await refreshPriceCatalog();
    notice.value = res.isExisting
      ? `Updated existing item at ${storeName.value.trim()} with latest price!`
      : `Item "${name.value.trim()}" successfully enlisted!`;

    setTimeout(() => {
      void router.push("/items");
    }, 1000);
  } catch (caught: unknown) {
    error.value =
      caught instanceof Error ? caught.message : "Could not save item.";
    saving.value = false;
  }
}
</script>

<template>
  <div
    class="card"
    style="display: flex; flex-direction: column; gap: 16px"
  >
    <div
      v-if="!isOnline"
      class="pill warn"
      style="align-self: flex-start; width: 100%"
    >
      ⚡ You are currently offline. You can save this item now and sync it
      later.
    </div>

    <div v-if="error" class="error" role="alert">{{ error }}</div>
    <div v-if="notice" class="pill ok" role="status">✓ {{ notice }}</div>

    <ItemEnlistPhotos
      :photos="photos"
      :disabled="analyzing || saving"
      @change="
        (updated) => {
          photos = updated;
          error = null;
        }
      "
    />

    <button
      v-if="isOnline && photos.length > 0 && (!name || !price)"
      type="button"
      class="btn ghost"
      style="width: 100%; padding: 10px 14px; font-size: 14px"
      :disabled="analyzing || saving"
      @click="handleAnalyzePhotos"
    >
      {{
        analyzing
          ? "Reading photos with AI…"
          : "✨ Extract name, price & barcode from photos"
      }}
    </button>

    <div
      v-if="candidateMatches.length > 0"
      class="card"
      style="
        background: var(--chip);
        border: 1px solid var(--line);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      "
    >
      <div style="font-weight: 600; font-size: 13px; color: var(--brand)">
        🔍 Existing item found in database:
      </div>
      <div
        v-for="match in candidateMatches"
        :key="match.itemKey"
        :style="{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 8px',
          background:
            linkedMatchKey === match.itemKey ? 'var(--card)' : 'transparent',
          border:
            linkedMatchKey === match.itemKey
              ? '1px solid var(--brand)'
              : '1px solid var(--line)',
          borderRadius: '6px',
        }"
      >
        <div>
          <div style="font-weight: 500; font-size: 13px">{{ match.name }}</div>
          <div class="muted" style="font-size: 11px">
            {{ match.storeName }}{{ match.sku ? ` · SKU ${match.sku}` : "" }}
          </div>
        </div>
        <button
          type="button"
          :class="linkedMatchKey === match.itemKey ? 'btn ok' : 'btn ghost'"
          style="width: auto; padding: 4px 8px; font-size: 12px"
          @click="
            () => {
              if (linkedMatchKey === match.itemKey) {
                linkedMatchKey = null;
              } else {
                linkedMatchKey = match.itemKey;
                if (!name) name = match.name;
                if (!sku && match.sku) sku = match.sku;
              }
            }
          "
        >
          {{ linkedMatchKey === match.itemKey ? "✓ Linked" : "Link item" }}
        </button>
      </div>
    </div>

    <!-- Store & Location Section -->
    <div style="display: flex; flex-direction: column; gap: 12px">
      <div
        style="
          display: flex;
          justify-content: space-between;
          align-items: center;
        "
      >
        <span style="font-size: 14px; font-weight: 600">
          Store &amp; Location
        </span>
        <button
          type="button"
          class="btn ghost"
          style="width: auto; padding: 4px 8px; font-size: 12px"
          :disabled="locating || saving"
          @click="handleDetectLocation"
        >
          {{ locating ? "Locating…" : "📍 Detect location" }}
        </button>
      </div>

      <div v-if="location?.label" class="muted" style="font-size: 12px">
        📍 Nearby: <strong>{{ location.label }}</strong>
      </div>

      <label class="field" style="margin: 0">
        <span>Store Name</span>
        <StoreAutocomplete
          :value="storeName"
          :stores="stores"
          placeholder="e.g. Puregold, Lee Hypermart"
          @change="(v) => (storeName = v)"
          @select-store="
            (s) => {
              storeName = s.name;
              if (s.branch) branch = s.branch;
            }
          "
        />
      </label>

      <label class="field" style="margin: 0">
        <span>Branch / Area (Optional)</span>
        <input
          v-model="branch"
          class="cell"
          type="text"
          placeholder="e.g. Ortigas, Dumaguete, Ground Floor"
          :disabled="saving"
        />
      </label>
    </div>

    <!-- Product Information Fields -->
    <div style="display: flex; flex-direction: column; gap: 12px">
      <span style="font-size: 14px; font-weight: 600">Product Details</span>

      <label class="field" style="margin: 0">
        <span>Product Name</span>
        <input
          v-model="name"
          class="cell"
          type="text"
          placeholder="e.g. Pocari Sweat 500ml"
          :disabled="saving"
        />
      </label>

      <label class="field" style="margin: 0">
        <span>Product Type / Category (Optional)</span>
        <input
          v-model="productType"
          class="cell"
          type="text"
          placeholder="e.g. Coconut Oil, Rosquillos, Almond Milk"
          :disabled="saving"
        />
      </label>

      <div class="grid-2">
        <label class="field" style="margin: 0">
          <span>Price (PHP)</span>
          <input
            v-model="price"
            class="cell"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            :disabled="saving"
          />
        </label>

        <label class="field" style="margin: 0">
          <span>Unit / Packaging</span>
          <input
            v-model="unit"
            class="cell"
            type="text"
            placeholder="pc, bottle, can, pack"
            :disabled="saving"
          />
        </label>
      </div>

      <label class="field" style="margin: 0">
        <span>SKU / Barcode (Optional)</span>
        <input
          v-model="sku"
          class="cell"
          type="text"
          placeholder="e.g. 4800016644211"
          :disabled="saving"
        />
      </label>
    </div>

    <!-- Submit / Save actions -->
    <div style="display: flex; gap: 8px; margin-top: 8px">
      <button
        type="button"
        class="btn ghost"
        style="flex: 1"
        :disabled="saving || analyzing"
        @click="router.back()"
      >
        Cancel
      </button>

      <button
        v-if="isOnline"
        type="button"
        class="btn"
        style="flex: 2"
        :disabled="saving || analyzing || photos.length === 0"
        @click="handleSaveOnline"
      >
        {{ saving ? "Saving item…" : "Save Item" }}
      </button>
      <button
        v-else
        type="button"
        class="btn"
        style="flex: 2"
        :disabled="saving || photos.length === 0"
        @click="handleSaveOffline"
      >
        {{ saving ? "Saving offline…" : "Save Offline" }}
      </button>
    </div>
  </div>
</template>

