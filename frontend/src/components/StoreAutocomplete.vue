<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { normalizeStoreName, type StoreRecord } from "@/domain/store-matcher";

const props = defineProps<{
  id?: string;
  value: string;
  stores: Record<string, StoreRecord>;
  placeholder?: string;
  required?: boolean;
}>();

const emit = defineEmits<{
  (e: "change", name: string): void;
  (e: "selectStore", store: { id: string; name: string; branch: string | null }): void;
}>();

const isOpen = ref(false);
const containerRef = ref<HTMLDivElement | null>(null);

const uniqueStores = computed(() => {
  const list: Array<{ id: string; name: string; branch: string | null }> = [];
  const seen = new Set<string>();

  for (const [storeId, record] of Object.entries(props.stores)) {
    const key = `${normalizeStoreName(record.name)}|${(record.branch || "").toLowerCase().trim()}`;
    if (!seen.has(key)) {
      seen.add(key);
      list.push({ id: storeId, name: record.name, branch: record.branch ?? null });
    }
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
});

const suggestions = computed(() => {
  const q = normalizeStoreName(props.value);
  if (!q) return uniqueStores.value.slice(0, 6);
  return uniqueStores.value
    .filter(
      (s) =>
        normalizeStoreName(s.name).includes(q) ||
        (s.branch && s.branch.toLowerCase().includes(q)),
    )
    .slice(0, 6);
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

function handleSelect(s: { id: string; name: string; branch: string | null }) {
  emit("selectStore", s);
  isOpen.value = false;
}
</script>

<template>
  <div ref="containerRef" class="store-autocomplete" style="position: relative">
    <input
      :id="id"
      :value="value"
      :placeholder="placeholder"
      :required="required"
      autocomplete="off"
      @focus="isOpen = true"
      @input="handleInput"
    />
    <ul v-if="isOpen && suggestions.length > 0" class="autocomplete-dropdown">
      <li v-for="s in suggestions" :key="s.id">
        <button
          type="button"
          class="autocomplete-option"
          @click="handleSelect(s)"
        >
          <span class="name">{{ s.name }}</span>
          <span v-if="s.branch" class="muted" style="margin-left: 6px">
            ({{ s.branch }})
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
