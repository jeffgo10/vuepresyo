<script setup lang="ts">
import { ref, onMounted } from "vue";
import { RouterLink } from "vue-router";
import { formatPeso, formatReceiptDate } from "@/domain/money";
import type { SavedReceipt } from "@/domain/types";
import { useOnline } from "@/src/helpers/use-online";
import { apiFetch } from "@/src/lib/api";
import { safeGetCachedData, safeSetCachedData } from "@/src/lib/offline-queue";

type ReceiptRow = SavedReceipt & { id: string };

const props = defineProps<{
  empty: string;
}>();

const isOnline = useOnline();
const rows = ref<ReceiptRow[] | null>(null);

function sortReceipts(list: ReceiptRow[]): ReceiptRow[] {
  return [...list].sort((left, right) => {
    const date = right.date.localeCompare(left.date);
    if (date !== 0) return date;
    return (right.time ?? "").localeCompare(left.time ?? "");
  });
}

onMounted(async () => {
  const cached = await safeGetCachedData<ReceiptRow[]>("cached_receipts");
  if (cached && cached.length > 0 && !rows.value) {
    rows.value = cached;
  }

  try {
    const data = await apiFetch<ReceiptRow[]>("/api/receipts");
    const sorted = sortReceipts(data ?? []);
    rows.value = sorted;
    void safeSetCachedData("cached_receipts", sorted);
  } catch {
    if (!rows.value) {
      rows.value = [];
    }
  }
});
</script>

<template>
  <p v-if="!rows" class="muted">Loading receipts…</p>
  <p v-else-if="rows.length === 0" class="muted">
    {{
      !isOnline
        ? "You are offline. Connect to the internet once to load receipts."
        : props.empty
    }}
  </p>
  <div v-else>
    <div v-if="!isOnline" style="margin-bottom: 8px">
      <span class="pill warn" style="font-size: 11px">
        ⚡ Offline · Viewing cached receipts
      </span>
    </div>
    <div class="card">
      <RouterLink
        v-for="receipt in rows"
        :key="receipt.id"
        class="receipt-row-link"
        :to="`/receipts/detail?id=${encodeURIComponent(receipt.id)}`"
        :aria-label="`View details for ${receipt.storeName} receipt`"
      >
        <div class="receipt-row-main">
          <div class="name">{{ receipt.storeName }}</div>
          <div class="muted">
            {{ formatReceiptDate(receipt.date) }} ·
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
  </div>
</template>

