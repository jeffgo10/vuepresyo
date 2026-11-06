<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { normalizeExtraction } from "@/domain/normalize";
import type { ExtractedReceipt, ValidationResult } from "@/domain/types";
import { storageObjectPath } from "@/domain/keys";
import { saveReviewDraft } from "@/src/lib/review-draft";
import { useOnline } from "@/src/helpers/use-online";
import { callBackendFunction, uploadStorageBlob } from "@/src/lib/api";
import {
  getOfflineScans,
  deleteOfflineScan,
  updateOfflineScan,
  subscribeToOfflineQueue,
  type QueuedScan,
} from "@/src/lib/offline-queue";

type ScanResponse = {
  receipt: ExtractedReceipt;
  validation: ValidationResult;
};

const emit = defineEmits<{
  (e: "queueChange"): void;
}>();

const router = useRouter();
const isOnline = useOnline();
const items = ref<QueuedScan[]>([]);
const previews = ref<Record<string, string>>({});
const processingId = ref<string | null>(null);

function receiptImageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function loadScans() {
  try {
    const scans = await getOfflineScans();
    items.value = scans;
    emit("queueChange");

    for (const url of Object.values(previews.value)) {
      URL.revokeObjectURL(url);
    }
    const nextPreviews: Record<string, string> = {};
    for (const item of scans) {
      nextPreviews[item.id] = URL.createObjectURL(item.blob);
    }
    previews.value = nextPreviews;
  } catch {
    items.value = [];
  }
}

let unsub: (() => void) | null = null;
onMounted(() => {
  void loadScans();
  unsub = subscribeToOfflineQueue(() => {
    void loadScans();
  });
});

onUnmounted(() => {
  if (unsub) unsub();
  for (const url of Object.values(previews.value)) {
    URL.revokeObjectURL(url);
  }
});

async function processScan(item: QueuedScan) {
  if (!isOnline.value) {
    alert("Cannot scan while offline. Please connect to the internet first.");
    return;
  }

  processingId.value = item.id;
  await updateOfflineScan(item.id, { status: "scanning", error: null });

  try {
    const imagePath = storageObjectPath(receiptImageId());
    await uploadStorageBlob(imagePath, item.blob);

    const result = await callBackendFunction<
      { storagePath: string },
      ScanResponse
    >("scanReceipt", { storagePath: imagePath });
    const receipt = normalizeExtraction(result.receipt);

    await deleteOfflineScan(item.id);
    saveReviewDraft({ receipt, validation: result.validation, imagePath });
    await router.push("/review");
  } catch (caught: unknown) {
    const errorMsg =
      caught instanceof Error
        ? caught.message
        : "Scanning failed. Check your connection.";
    await updateOfflineScan(item.id, { status: "failed", error: errorMsg });
    await loadScans();
    processingId.value = null;
  }
}

async function removeItem(id: string) {
  try {
    await deleteOfflineScan(id);
    await loadScans();
  } catch {
    // ignore
  }
}
</script>

<template>
  <div v-if="items.length > 0" class="card" style="margin-top: 20px">
    <div
      style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      "
    >
      <h2 style="margin: 0; font-size: 16px">
        Pending Offline Scans ({{ items.length }})
      </h2>
      <span class="pill" style="font-size: 12px">
        {{ isOnline ? "Online — Ready to scan" : "Offline" }}
      </span>
    </div>
    <p class="muted" style="margin: 0 0 16px 0; font-size: 13px">
      Receipts captured while offline are saved on this device. You can send
      them to Gemini once back online.
    </p>

    <div style="display: flex; flex-direction: column; gap: 12px">
      <div
        v-for="item in items"
        :key="item.id"
        style="
          display: flex;
          gap: 12px;
          padding: 10px;
          background: var(--chip, #242c28);
          border-radius: 8px;
          align-items: center;
        "
      >
        <img
          v-if="previews[item.id]"
          :src="previews[item.id]"
          alt="Queued receipt preview"
          style="
            width: 56px;
            height: 56px;
            object-fit: cover;
            border-radius: 6px;
            border: 1px solid var(--line, #2a322e);
          "
        />
        <div
          v-else
          style="
            width: 56px;
            height: 56px;
            border-radius: 6px;
            background: var(--card);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
          "
        >
          🧾
        </div>

        <div style="flex: 1; min-width: 0">
          <div
            style="
              font-size: 14px;
              font-weight: 500;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            "
          >
            {{ item.fileName }}
          </div>
          <div class="muted" style="font-size: 12px">
            {{
              new Date(item.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            }}
            •
            <span
              v-if="item.status === 'scanning'"
              style="color: var(--brand)"
            >
              Reading receipt…
            </span>
            <span
              v-else-if="item.status === 'failed'"
              style="color: var(--up)"
            >
              Scan failed
            </span>
            <span v-else>Ready</span>
          </div>
          <div
            v-if="item.error"
            style="color: var(--up); font-size: 12px; margin-top: 2px"
          >
            {{ item.error }}
          </div>
        </div>

        <div style="display: flex; gap: 6px">
          <button
            class="btn"
            type="button"
            style="padding: 6px 12px; font-size: 13px"
            :disabled="
              !isOnline ||
              processingId === item.id ||
              item.status === 'scanning'
            "
            @click="processScan(item)"
          >
            {{
              processingId === item.id || item.status === "scanning"
                ? "Scanning…"
                : "Scan"
            }}
          </button>
          <button
            class="btn-line-delete"
            type="button"
            style="padding: 6px 10px; font-size: 13px"
            :disabled="processingId === item.id || item.status === 'scanning'"
            aria-label="Delete queued receipt"
            @click="removeItem(item.id)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

