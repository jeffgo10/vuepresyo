<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { RouterLink } from "vue-router";
import {
  getQueuedEnlistItems,
  subscribeToOfflineQueue,
  type QueuedEnlistItem,
} from "@/src/lib/offline-queue";

const props = defineProps<{
  showBackToItemsLink?: boolean;
}>();

const queuedItems = ref<QueuedEnlistItem[]>([]);

async function loadQueue() {
  try {
    queuedItems.value = await getQueuedEnlistItems();
  } catch {
    // ignore
  }
}

let unsub: (() => void) | null = null;
onMounted(() => {
  void loadQueue();
  unsub = subscribeToOfflineQueue(() => {
    void loadQueue();
  });
});

onUnmounted(() => {
  if (unsub) unsub();
});
</script>

<template>
  <div v-if="queuedItems.length > 0" class="card offline-queue-card">
    <div
      class="row"
      style="padding-top: 0; border-bottom: 1px solid var(--line)"
    >
      <div>
        <div class="name">
          Queued Offline Enlistments ({{ queuedItems.length }})
        </div>
        <div class="muted">
          Saved on your device. Open theItems tab when back online to process.
        </div>
      </div>
      <RouterLink
        v-if="props.showBackToItemsLink"
        to="/items"
        class="btn primary"
      >
        View in Items
      </RouterLink>
    </div>
    <div style="margin-top: 8px; font-size: 13px">
      <div
        v-for="item in queuedItems"
        :key="item.id"
        style="padding: 4px 0"
      >
        <span style="font-weight: 600">
          {{ item.name || "Photo-only enlistment" }}
        </span>
        <span class="muted"> · {{ item.storeName }}</span>
      </div>
    </div>
  </div>
</template>

