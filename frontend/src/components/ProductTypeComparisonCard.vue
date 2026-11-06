<script setup lang="ts">
import { computed } from "vue";
import { formatPeso, formatReceiptDate } from "@/domain/money";
import type {
  ComparedProductTypeEntry,
  ProductTypeComparison,
} from "@/domain/product-type-compare";

const props = defineProps<{
  group: ProductTypeComparison;
  today: string;
}>();

const emit = defineEmits<{
  (e: "select", id: string): void;
}>();

const headingId = computed(
  () =>
    `type-compare-${props.group.productType.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
);

function priceClassName(entry: ComparedProductTypeEntry): string {
  const cls = entry.cheapest ? "down" : entry.expensive ? "up" : undefined;
  return ["compare-price", cls].filter(Boolean).join(" ");
}

function priceText(entry: ComparedProductTypeEntry): string {
  const amount = formatPeso(entry.comparedPrice);
  if (entry.cheapest) return `${amount} · cheapest`;
  if (entry.delta > 0) return `${amount} · +${formatPeso(entry.delta)}`;
  return amount;
}

function staleLabel(date: string): string {
  const shown = formatReceiptDate(date);
  const year = date.slice(0, 4);
  const withYear =
    year === props.today.slice(0, 4) ? shown : `${shown}, ${year}`;
  return `Older than 30 days · ${withYear}`;
}

function getSelectId(entry: ComparedProductTypeEntry): string {
  return entry.productId
    ? `product:${entry.productId}`
    : `item:${entry.itemKey}`;
}
</script>

<template>
  <article
    class="card compare-card product-type-card"
    :aria-labelledby="headingId"
  >
    <div class="compare-card-header">
      <div>
        <div class="compare-type-badge-row">
          <span class="pill compare-type-pill">Product Type</span>
          <span class="muted" style="font-size: 12px">
            {{ group.entries.length }}
            {{ group.entries.length === 1 ? "option" : "options" }}
          </span>
        </div>
        <h2 :id="headingId" style="margin-top: 4px">
          {{ group.productType }}
        </h2>
        <div class="muted">{{ group.basis }}</div>
      </div>
    </div>

    <ul class="compare-list">
      <li
        v-for="entry in group.entries"
        :key="entry.itemKey"
        class="compare-offer compare-type-offer"
        role="button"
        tabindex="0"
        :aria-label="`View details for ${entry.productName}`"
        @click="emit('select', getSelectId(entry))"
        @keydown.enter.prevent="emit('select', getSelectId(entry))"
        @keydown.space.prevent="emit('select', getSelectId(entry))"
      >
        <div class="row" style="align-items: baseline">
          <span class="compare-product-name">{{ entry.productName }}</span>
          <span :class="priceClassName(entry)">{{ priceText(entry) }}</span>
        </div>

        <div class="row compare-subrow">
          <span class="muted">
            {{ entry.storeName }} · Shelf {{ formatPeso(entry.shelfPrice)
            }}{{ entry.shelfNote ? ` (${entry.shelfNote})` : "" }}
          </span>

          <span
            v-if="entry.feedback?.rating"
            class="feedback-badge"
            title="Shopper Rating"
          >
            ⭐ {{ entry.feedback.rating.toFixed(1)
            }}{{ entry.feedback.isRecommended ? " · Recommended" : "" }}
          </span>
          <span v-else class="feedback-slot-placeholder" aria-hidden="true" />
        </div>

        <div v-if="entry.stale">
          <span class="pill warn">{{ staleLabel(entry.date) }}</span>
        </div>

        <div class="bar" aria-hidden="true">
          <i
            :class="
              entry.expensive ? 'hi' : entry.cheapest ? 'cheapest' : undefined
            "
            :style="{ width: `${entry.barPercent}%` }"
          />
        </div>
      </li>
    </ul>
  </article>
</template>

