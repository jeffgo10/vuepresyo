<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import {
  searchProductCandidates,
  type ProductCandidate,
} from "@/domain/product-matcher";
import type { CompareProduct } from "@/domain/store-compare";

export type SelectedItemSuggestion = {
  itemKey: string;
  name: string;
  sku: string | null;
  unit: string;
  productId: string | null;
  storeId: string;
};

const props = defineProps<{
  value: string;
  sku?: string | null;
  products: CompareProduct[] | null;
  storeNames: Record<string, string>;
  placeholder?: string;
  ariaLabel?: string;
}>();

const emit = defineEmits<{
  (e: "change", name: string): void;
  (e: "selectSuggestion", item: SelectedItemSuggestion): void;
}>();

const isOpen = ref(false);
const containerRef = ref<HTMLDivElement | null>(null);

const suggestions = computed(() => {
  if (!props.products || props.products.length === 0) return [];
  const q = props.value.trim();

  if (q.length < 2) {
    return [];
  }

  return searchProductCandidates(q, props.products, 5);
});

function handleDocMouseDown(e: MouseEvent) {
  if (
    containerRef.value &&
    !containerRef.value.contains(e.target as Node)
  ) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener("mousedown", handleDocMouseDown);
});

onUnmounted(() => {
  document.removeEventListener("mousedown", handleDocMouseDown);
});

function handleInput(e: Event) {
  const target = e.target as HTMLInputElement;
  emit("change", target.value);
  isOpen.value = true;
}

function handlePick(s: ProductCandidate) {
  const fullProd = props.products?.find((p) => p.key === s.key);
  emit("selectSuggestion", {
    itemKey: s.key,
    name: s.name,
    sku: s.sku ?? null,
    unit: fullProd?.unit || "pc",
    productId: fullProd?.productId ?? null,
    storeId: s.storeId ?? "",
  });
  isOpen.value = false;
}
</script>

<template>
  <div ref="containerRef" style="position: relative; width: 100%">
    <input
      :value="value"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      autocomplete="off"
      @focus="isOpen = true"
      @input="handleInput"
    />
    <ul v-if="isOpen && suggestions.length > 0" class="autocomplete-dropdown">
      <li v-for="s in suggestions" :key="s.key">
        <button
          type="button"
          class="autocomplete-option"
          @click="handlePick(s)"
        >
          <div style="font-weight: 600; font-size: 13px">{{ s.name }}</div>
          <div class="muted" style="font-size: 11px">
            {{ (s.storeId && storeNames[s.storeId]) || "Catalog"
            }}{{ s.sku ? ` · SKU ${s.sku}` : "" }}
          </div>
        </button>
      </li>
    </ul>
  </div>
</template>
