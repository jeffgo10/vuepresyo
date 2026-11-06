<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import { MAX_PRODUCT_PHOTOS, productImageObjectPath } from "@/domain/keys";
import { productNeedingPhoto } from "@/domain/products";
import { findSimilarSkuProducts } from "@/domain/sku-matcher";
import { compressReceiptImage } from "@/src/helpers/images/compress-receipt-image";
import { useIsAndroid } from "@/src/helpers/use-is-android";
import { usePriceCatalog } from "@/src/helpers/catalog/use-price-catalog";
import { callBackendFunction, uploadStorageBlob } from "@/src/lib/api";

type ProductMatch = {
  itemKey: string;
  name: string;
  storeName: string;
};

type DescribeResponse = {
  suggestedName: string | null;
  suggestedProductType?: string | null;
  suggestedSku?: string | null;
  suggestedUnit?: string | null;
  match: ProductMatch | null;
  notice: string | null;
};

type StagedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

const { products, storeNames, refresh } = usePriceCatalog();
const isAndroid = useIsAndroid();
const inputRef = ref<HTMLInputElement | null>(null);
const cameraInputRef = ref<HTMLInputElement | null>(null);

const skips = ref<Set<string>>(new Set());
const stagedPhotos = ref<StagedPhoto[]>([]);
const step = ref<"idle" | "reading" | "confirm" | "match">("idle");
const activeProductKey = ref<string | null>(null);
const confirmedName = ref("");
const confirmedProductType = ref("");
const confirmedSku = ref("");
const confirmedUnit = ref("pc");
const matchState = ref<ProductMatch | null>(null);
const uploadedPhotoUrls = ref<string[]>([]);
const notice = ref<string | null>(null);
const error = ref<string | null>(null);

const normalizedProducts = computed(() => {
  if (!products.value) return null;
  return products.value.map((p) => ({
    ...p,
    imagePath: p.imagePath ?? null,
    imagePaths: p.imagePaths ?? undefined,
  }));
});

const asking = computed(() => {
  if (!normalizedProducts.value) return null;
  return productNeedingPhoto(normalizedProducts.value, skips.value);
});

const currentProduct = computed(() => {
  if (!normalizedProducts.value) return null;
  if (activeProductKey.value) {
    return (
      normalizedProducts.value.find((p) => p.key === activeProductKey.value) ??
      asking.value
    );
  }
  return asking.value;
});

watch(
  () => asking.value?.key ?? null,
  (newKey, oldKey) => {
    if (newKey !== oldKey && step.value === "idle") {
      clearStagedPhotos();
    }
  },
);

onUnmounted(() => {
  clearStagedPhotos();
});

function clearStagedPhotos() {
  for (const p of stagedPhotos.value) {
    URL.revokeObjectURL(p.previewUrl);
  }
  stagedPhotos.value = [];
}

function storeLabel(storeId: string): string {
  return storeNames.value[storeId] ?? "This store";
}

function handleAddFiles(files: FileList | null) {
  if (!files || files.length === 0) return;
  const remaining = MAX_PRODUCT_PHOTOS - stagedPhotos.value.length;
  if (remaining <= 0) return;

  const toAdd = Math.min(files.length, remaining);
  const next: StagedPhoto[] = [];
  for (let i = 0; i < toAdd; i++) {
    const file = files[i];
    next.push({
      id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }
  stagedPhotos.value = [...stagedPhotos.value, ...next];
}

function handleRemoveStagedPhoto(indexToRemove: number) {
  const copy = [...stagedPhotos.value];
  const removed = copy.splice(indexToRemove, 1)[0];
  if (removed) URL.revokeObjectURL(removed.previewUrl);
  stagedPhotos.value = copy;
}

function notNow(itemKey: string) {
  clearStagedPhotos();
  skips.value = new Set([...skips.value, itemKey]);
  notice.value = null;
  error.value = null;
  step.value = "idle";
  activeProductKey.value = null;
}

async function completeProduct(message: string) {
  clearStagedPhotos();
  notice.value = message;
  step.value = "idle";
  activeProductKey.value = null;
  error.value = null;
  await refresh();
}

async function onAnalyze() {
  const product = asking.value;
  if (!product || stagedPhotos.value.length === 0) return;
  error.value = null;
  notice.value = null;
  activeProductKey.value = product.key;
  step.value = "reading";

  try {
    const uploadedPaths: string[] = [];
    for (let i = 0; i < stagedPhotos.value.length; i++) {
      const photo = stagedPhotos.value[i];
      const blob = await compressReceiptImage(photo.file);
      const path = productImageObjectPath(product.key, i);
      await uploadStorageBlob(path, blob);
      uploadedPaths.push(path);
    }

    const result = await callBackendFunction<
      { itemKey: string; photoPaths?: string[] },
      DescribeResponse
    >("describeProduct", {
      itemKey: product.key,
      photoPaths: uploadedPaths,
    });

    confirmedName.value = result.suggestedName || product.name;
    confirmedProductType.value =
      result.suggestedProductType || product.productType || "";
    confirmedSku.value = result.suggestedSku || product.sku || "";
    confirmedUnit.value = result.suggestedUnit || product.unit || "pc";
    matchState.value = result.match;
    uploadedPhotoUrls.value = stagedPhotos.value.map((p) => p.previewUrl);
    step.value = "confirm";
  } catch (caught: unknown) {
    error.value =
      caught instanceof Error ? caught.message : "Could not save that photo.";
    step.value = "idle";
  }
}

async function handleSaveDetails() {
  const product = currentProduct.value;
  if (!product) return;
  error.value = null;
  step.value = "reading";

  try {
    await callBackendFunction("confirmProductName", {
      itemKey: product.key,
      name: confirmedName.value.trim(),
      productType: confirmedProductType.value.trim() || undefined,
      sku: confirmedSku.value.trim() || undefined,
      unit: confirmedUnit.value.trim() || undefined,
    });

    if (matchState.value) {
      step.value = "match";
      return;
    }
    await completeProduct(`Saved details for ${confirmedName.value.trim()}.`);
  } catch (caught: unknown) {
    error.value =
      caught instanceof Error ? caught.message : "Could not save details.";
    step.value = "confirm";
  }
}

async function handleMerge(targetKey: string, targetName: string, targetStoreId: string) {
  const product = currentProduct.value;
  if (!product) return;
  error.value = null;
  step.value = "reading";
  try {
    const res = await callBackendFunction<
      {
        sourceKey: string;
        targetKey: string;
        name?: string;
        productType?: string;
        sku?: string;
      },
      { success: boolean; targetKey: string; mode: "merged" | "linked" }
    >("mergeProducts", {
      sourceKey: product.key,
      targetKey,
      name: confirmedName.value.trim() || undefined,
      productType: confirmedProductType.value.trim() || undefined,
      sku: confirmedSku.value.trim() || undefined,
    });

    const msg =
      res.mode === "merged"
        ? `Merged into ${targetName}.`
        : `Linked with ${targetName} at ${storeLabel(targetStoreId)}.`;
    await completeProduct(msg);
  } catch (caught: unknown) {
    error.value =
      caught instanceof Error ? caught.message : "Could not merge products.";
    step.value = "idle";
  }
}

async function answerMatch(same: boolean) {
  const product = currentProduct.value;
  const match = matchState.value;
  if (!product || !match) return;
  error.value = null;
  step.value = "reading";
  try {
    await callBackendFunction("resolveProductMatch", {
      itemKey: product.key,
      otherKey: match.itemKey,
      same,
    });
    await completeProduct(
      same
        ? `Linked with ${match.name} at ${match.storeName}.`
        : "Photo saved. The prices stay separate.",
    );
  } catch (caught: unknown) {
    error.value =
      caught instanceof Error ? caught.message : "Could not resolve match.";
    step.value = "match";
  }
}

const similarSkuCandidates = computed(() => {
  const product = currentProduct.value;
  if (
    step.value !== "confirm" ||
    !product ||
    !products.value ||
    !confirmedSku.value.trim()
  ) {
    return [];
  }
  return findSimilarSkuProducts(
    confirmedSku.value,
    products.value,
    product.key,
    product.storeId,
  );
});
</script>

<template>
  <section
    v-if="products && (currentProduct || notice)"
    aria-labelledby="package-photo-heading"
  >
    <h2 id="package-photo-heading">Package photo</h2>

    <p v-if="!currentProduct && notice" class="muted" role="status">
      {{ notice }}
    </p>

    <div v-else-if="currentProduct" class="card" :aria-busy="step === 'reading'">
      <div
        v-if="notice"
        class="pill ok"
        role="status"
        style="align-self: flex-start; margin-bottom: 6px"
      >
        ✓ {{ notice }}
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <p v-if="step === 'reading'" class="muted" role="status">
        Reading package photos for {{ currentProduct.name }}…
      </p>

      <div v-else-if="step === 'confirm'" class="stack">
        <div>
          <div class="name" style="font-size: 16px">Confirm product details</div>
          <p class="muted" style="margin: 2px 0 8px">
            {{ storeLabel(currentProduct.storeId) }} · Review or edit name and SKU
          </p>
        </div>

        <div
          v-if="uploadedPhotoUrls.length > 0"
          style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px"
        >
          <img
            v-for="(url, i) in uploadedPhotoUrls"
            :key="url"
            :src="url"
            :alt="`Photo ${i + 1}`"
            style="
              width: 64px;
              height: 64px;
              object-fit: cover;
              border-radius: 6px;
              border: 1px solid var(--line);
            "
          />
        </div>

        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 2px">
            Product Name
          </label>
          <input
            v-model="confirmedName"
            class="cell"
            type="text"
            placeholder="Product name"
            style="width: 100%; padding: 8px 10px"
          />
        </div>

        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 2px">
            Product Category / Type (Optional)
          </label>
          <input
            v-model="confirmedProductType"
            class="cell"
            type="text"
            placeholder="e.g. Powdered Milk, Soy Sauce, Rice"
            style="width: 100%; padding: 8px 10px"
          />
        </div>

        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 2px">
            SKU / Barcode (Optional)
          </label>
          <input
            v-model="confirmedSku"
            class="cell"
            type="text"
            placeholder="e.g. 48000166"
            style="width: 100%; padding: 8px 10px"
          />
        </div>

        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 2px">
            Unit / Packaging (UOM)
          </label>
          <input
            v-model="confirmedUnit"
            class="cell"
            type="text"
            placeholder="e.g. box, sachet, pc, pack, can, bottle"
            style="width: 100%; padding: 8px 10px"
          />
        </div>

        <div
          v-if="similarSkuCandidates.length > 0"
          style="
            padding: 10px 12px;
            background: var(--card-alt, rgba(255, 255, 255, 0.06));
            border-radius: 8px;
            border: 1px solid var(--brand, #3b82f6);
            margin-top: 4px;
          "
        >
          <div
            style="
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 4px;
            "
          >
            <strong style="font-size: 13px">
              {{
                similarSkuCandidates[0].sameStore
                  ? "Similar item found at this store"
                  : `Similar item at ${storeLabel(similarSkuCandidates[0].product.storeId)}`
              }}
            </strong>
            <span class="pill ok" style="font-size: 11px">
              {{
                similarSkuCandidates[0].reason === "exact"
                  ? "Exact SKU Match"
                  : "Similar SKU"
              }}
            </span>
          </div>
          <div style="font-size: 13px; font-weight: 500; margin-bottom: 2px">
            {{ similarSkuCandidates[0].product.name }}
          </div>
          <div class="sku" style="margin-bottom: 8px">
            SKU: {{ similarSkuCandidates[0].product.sku }}
          </div>

          <button
            class="btn"
            type="button"
            style="width: 100%; margin-bottom: 4px"
            @click="
              handleMerge(
                similarSkuCandidates[0].product.key,
                similarSkuCandidates[0].product.name,
                similarSkuCandidates[0].product.storeId,
              )
            "
          >
            {{
              similarSkuCandidates[0].sameStore
                ? "Merge into existing item"
                : "Link across stores"
            }}
          </button>
        </div>

        <button
          class="btn"
          type="button"
          :disabled="!confirmedName.trim()"
          @click="handleSaveDetails"
        >
          Save details
        </button>
        <button
          class="btn ghost"
          type="button"
          @click="notNow(currentProduct.key)"
        >
          Cancel
        </button>
      </div>

      <div v-else-if="step === 'match' && matchState" class="stack">
        <div class="name">Same item at {{ matchState.storeName }}?</div>
        <p class="muted">
          {{ matchState.name }} looks like this package. Prices at each store
          stay separate.
        </p>
        <button class="btn" type="button" @click="answerMatch(true)">
          Yes, same item
        </button>
        <button class="btn ghost" type="button" @click="answerMatch(false)">
          Not the same
        </button>
      </div>

      <div v-else-if="asking" class="stack">
        <div>
          <div class="name">Add photo: {{ asking.name }}</div>
          <p class="muted">
            {{ storeLabel(asking.storeId) }} · Add front and back photos so
            SKU/barcode can be read.
          </p>
        </div>

        <div v-if="stagedPhotos.length > 0" class="enlist-photo-grid">
          <div
            v-for="(photo, index) in stagedPhotos"
            :key="photo.id"
            class="enlist-photo-card"
          >
            <img
              :src="photo.previewUrl"
              :alt="`Photo ${index + 1}`"
              class="enlist-photo-thumb"
            />
            <span class="enlist-photo-badge">
              {{
                index === 0
                  ? "Front"
                  : index === 1
                  ? "Back / SKU"
                  : `Photo ${index + 1}`
              }}
            </span>
            <button
              type="button"
              class="enlist-photo-delete-btn"
              :aria-label="`Remove photo ${index + 1}`"
              @click="handleRemoveStagedPhoto(index)"
            >
              ✕
            </button>
          </div>

          <label
            v-if="stagedPhotos.length < MAX_PRODUCT_PHOTOS"
            class="enlist-photo-add-tile"
          >
            <span style="font-size: 22px" aria-hidden="true">📷</span>
            <span style="font-size: 12px; font-weight: 500">+ Add photo</span>
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              @change="
                (e) => {
                  const target = e.target as HTMLInputElement;
                  handleAddFiles(target.files);
                  target.value = '';
                }
              "
            />
          </label>
        </div>

        <button
          v-if="stagedPhotos.length > 0"
          class="btn"
          type="button"
          @click="onAnalyze"
        >
          Analyze package ({{ stagedPhotos.length }}
          {{ stagedPhotos.length === 1 ? "photo" : "photos" }})
        </button>

        <template v-else>
          <template v-if="isAndroid">
            <button
              class="btn"
              type="button"
              @click="cameraInputRef?.click()"
            >
              Take photo
            </button>
            <button
              class="btn ghost"
              type="button"
              @click="inputRef?.click()"
            >
              Choose from photos
            </button>
          </template>
          <button
            v-else
            class="btn"
            type="button"
            @click="inputRef?.click()"
          >
            Add photo
          </button>

          <input
            ref="inputRef"
            type="file"
            accept="image/*"
            multiple
            hidden
            @change="
              (e) => {
                const target = e.target as HTMLInputElement;
                handleAddFiles(target.files);
                target.value = '';
              }
            "
          />
          <input
            v-if="isAndroid"
            ref="cameraInputRef"
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            @change="
              (e) => {
                const target = e.target as HTMLInputElement;
                handleAddFiles(target.files);
                target.value = '';
              }
            "
          />
        </template>

        <button class="btn ghost" type="button" @click="notNow(asking.key)">
          Not now
        </button>
      </div>
    </div>
  </section>
</template>
