<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { normalizeExtraction } from "@/domain/normalize";
import { SAMPLE_RECEIPT } from "@/domain/sample-receipt";
import type { ExtractedReceipt, ValidationResult } from "@/domain/types";
import { validateReceipt } from "@/domain/validate";
import { storageObjectPath } from "@/domain/keys";
import { assessReceiptText } from "@/src/helpers/ocr/assess-receipt-text";
import { readReceiptText } from "@/src/helpers/ocr/read-receipt-text";
import { compressReceiptImage } from "@/src/helpers/images/compress-receipt-image";
import { saveReviewDraft } from "@/src/lib/review-draft";
import { enqueueOfflineScan } from "@/src/lib/offline-queue";
import { useIsAndroid } from "@/src/helpers/use-is-android";
import { callBackendFunction, uploadStorageBlob } from "@/src/lib/api";
import OfflineQueueList from "@/src/components/OfflineQueueList.vue";

type ScanResponse = {
  receipt: ExtractedReceipt;
  validation: ValidationResult;
};

const router = useRouter();
const isAndroid = useIsAndroid();
const error = ref<string | null>(null);
const info = ref<string | null>(null);
const pending = ref(false);
const activity = ref<string | null>(null);
const queueKey = ref(0);
const fallbackBlob = ref<Blob | null>(null);
const fallbackFileName = ref<string | null>(null);

function receiptImageId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isNetworkError(caught: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (caught instanceof Error) {
    const msg = caught.message.toLowerCase();
    return (
      msg.includes("network") ||
      msg.includes("offline") ||
      msg.includes("failed to fetch") ||
      msg.includes("unavailable")
    );
  }
  return false;
}

function openReview(
  receipt: ExtractedReceipt,
  validation: ValidationResult,
  imagePath: string | null,
) {
  saveReviewDraft({ receipt, validation, imagePath });
  void router.push("/review");
}

function useSample() {
  const receipt = structuredClone(SAMPLE_RECEIPT);
  openReview(receipt, validateReceipt(receipt), null);
}

function handleScanError(
  caught: unknown,
  blob: Blob | null,
  fileName?: string,
) {
  if (blob && isNetworkError(caught)) {
    try {
      void enqueueOfflineScan(blob, { fileName });
      info.value =
        "Network request failed. Your receipt was preserved in the offline queue below.";
      queueKey.value += 1;
    } catch {
      // ignore
    }
  }
  error.value =
    caught instanceof Error ? caught.message : "Could not read that photo.";
  pending.value = false;
  activity.value = null;
}

async function uploadAndScan(blob: Blob, fileName?: string) {
  error.value = null;
  info.value = null;
  fallbackBlob.value = null;
  fallbackFileName.value = null;
  pending.value = true;

  try {
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    if (isOffline) {
      activity.value = "Saving to offline queue…";
      await enqueueOfflineScan(blob, { fileName });
      info.value =
        "You are currently offline. Receipt saved to offline queue below.";
      queueKey.value += 1;
      pending.value = false;
      activity.value = null;
      return;
    }

    activity.value = "Reading the receipt…";
    const imagePath = storageObjectPath(receiptImageId());
    await uploadStorageBlob(imagePath, blob);

    const result = await callBackendFunction<
      { storagePath: string },
      ScanResponse
    >("scanReceipt", { storagePath: imagePath });
    const receipt = normalizeExtraction(result.receipt);
    openReview(receipt, result.validation, imagePath);
  } catch (caught) {
    handleScanError(caught, blob, fileName);
  }
}

async function onFile(file: File | undefined) {
  if (!file) return;
  error.value = null;
  info.value = null;
  fallbackBlob.value = null;
  fallbackFileName.value = null;
  pending.value = true;
  activity.value = "Compressing the photo…";

  let compressedBlob: Blob | null = null;
  try {
    compressedBlob = await compressReceiptImage(file);

    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    if (isOffline) {
      activity.value = "Saving to offline queue…";
      await enqueueOfflineScan(compressedBlob, { fileName: file.name });
      info.value =
        "You are currently offline. Receipt saved to offline queue below.";
      queueKey.value += 1;
      pending.value = false;
      activity.value = null;
      return;
    }

    activity.value = "Checking the photo…";
    const reading = await readReceiptText(compressedBlob, (msg) => {
      activity.value = msg;
    });
    const assessment = assessReceiptText(reading.text, reading.confidence);
    if (!assessment.ok) {
      fallbackBlob.value = compressedBlob;
      fallbackFileName.value = file.name;
      error.value = assessment.reason;
      pending.value = false;
      activity.value = null;
      return;
    }

    await uploadAndScan(compressedBlob, file.name);
  } catch (caught) {
    handleScanError(caught, compressedBlob, file?.name);
  }
}

function handleDrop(e: DragEvent) {
  if (pending.value) return;
  const file = e.dataTransfer?.files?.[0];
  if (file) void onFile(file);
}
</script>

<template>
  <div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <button
      v-if="fallbackBlob && !pending"
      class="btn"
      type="button"
      style="margin-bottom: 12px"
      @click="uploadAndScan(fallbackBlob!, fallbackFileName ?? undefined)"
    >
      Scan with Gemini anyway
    </button>
    <p
      v-if="info"
      role="status"
      style="
        background: var(--warn-bg, #3a2d12);
        color: var(--warn, #f0b65a);
        border: 1px solid var(--line, #2a322e);
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 14px;
        margin: 0 0 16px 0;
      "
    >
      {{ info }}
    </p>

    <div
      class="drop"
      :aria-busy="pending"
      @dragover.prevent
      @drop.prevent="handleDrop"
    >
      <span aria-live="polite">
        {{ activity ?? "Take a photo or choose an image" }}
      </span>
      <br />
      <span class="muted">Crop to the receipt for best results</span>
      <div
        style="
          display: flex;
          gap: 10px;
          justify-content: center;
          margin-top: 14px;
        "
      >
        <template v-if="isAndroid">
          <label
            class="btn"
            :style="{
              flex: 1,
              margin: 0,
              padding: '10px 12px',
              fontSize: '14px',
              cursor: pending ? 'not-allowed' : 'pointer',
            }"
          >
            Take photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              :disabled="pending"
              @change="
                (e) => {
                  const target = e.target as HTMLInputElement;
                  const file = target.files?.[0];
                  target.value = '';
                  onFile(file);
                }
              "
            />
          </label>
          <label
            class="btn ghost"
            :style="{
              flex: 1,
              margin: 0,
              padding: '10px 12px',
              fontSize: '14px',
              cursor: pending ? 'not-allowed' : 'pointer',
            }"
          >
            Choose from photos
            <input
              type="file"
              accept="image/*"
              hidden
              :disabled="pending"
              @change="
                (e) => {
                  const target = e.target as HTMLInputElement;
                  const file = target.files?.[0];
                  target.value = '';
                  onFile(file);
                }
              "
            />
          </label>
        </template>
        <label
          v-else
          class="btn"
          :style="{
            flex: 1,
            margin: 0,
            padding: '10px 12px',
            fontSize: '14px',
            cursor: pending ? 'not-allowed' : 'pointer',
          }"
        >
          Take or choose photo
          <input
            type="file"
            accept="image/*"
            hidden
            :disabled="pending"
            @change="
              (e) => {
                const target = e.target as HTMLInputElement;
                const file = target.files?.[0];
                target.value = '';
                onFile(file);
              }
            "
          />
        </label>
      </div>
    </div>

    <button
      class="btn"
      type="button"
      :disabled="pending"
      @click="useSample"
    >
      Use sample receipt (Lee Hypermart)
    </button>
    <p class="muted" style="margin-top: 12px">
      Photos are compressed and checked on your phone before upload. Buyer name
      and TIN are never stored.
    </p>

    <OfflineQueueList :key="queueKey" @queue-change="queueKey += 1" />
  </div>
</template>

