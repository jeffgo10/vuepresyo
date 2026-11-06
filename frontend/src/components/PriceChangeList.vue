<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { formatPeso } from "@/domain/money";
import {
  currentYearMonth,
  formatPriceChange,
  priceChangeLabel,
  priceChangesInMonth,
  type RecordedPriceChange,
} from "@/domain/price-change";
import { apiFetch } from "@/src/lib/api";
import { safeGetCachedData, safeSetCachedData } from "@/src/lib/offline-queue";

type PriceChangeRow = RecordedPriceChange & { id: string };

const rows = ref<PriceChangeRow[] | null>(null);
const error = ref<string | null>(null);

const visible = computed(() => {
  if (!rows.value) return [];
  return priceChangesInMonth(rows.value, currentYearMonth());
});

onMounted(async () => {
  const cached =
    await safeGetCachedData<PriceChangeRow[]>("cached_price_changes");
  if (cached && cached.length > 0 && !rows.value) {
    rows.value = cached;
  }

  try {
    const data = await apiFetch<PriceChangeRow[]>("/api/price-changes");
    rows.value = data ?? [];
    error.value = null;
    void safeSetCachedData("cached_price_changes", rows.value);
  } catch {
    if (!rows.value) {
      rows.value = [];
    }
  }
});
</script>

<template>
  <p v-if="error" class="error" role="alert">{{ error }}</p>
  <p v-else-if="!rows" class="muted">Loading price changes…</p>
  <p v-else-if="visible.length === 0" class="muted">
    No price changes this month.
  </p>
  <div v-else class="card">
    <div v-for="change in visible" :key="change.id" class="row">
      <div>
        <div class="name">{{ change.name }}</div>
        <div class="muted">
          {{ change.storeName }} · was {{ formatPeso(change.previousPrice) }}
        </div>
      </div>
      <div
        :class="change.delta > 0 ? 'up' : 'down'"
        :aria-label="priceChangeLabel(change)"
      >
        {{ formatPriceChange(change) }}
      </div>
    </div>
  </div>
</template>

