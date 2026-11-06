<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import { useOnline } from "@/src/helpers/use-online";
import { useAuth } from "@/src/lib/auth";
import { BRAND_NAME } from "@/src/lib/brand";
import { getQueuedScans, subscribeToOfflineQueue } from "@/src/lib/offline-queue";

const route = useRoute();
const router = useRouter();
const { user, loading, signOut } = useAuth();
const isOnline = useOnline();
const queueCount = ref(0);

const displayName = computed(() => {
  if (!user.value) return "Member";
  if (user.value.name) return user.value.name;
  const email = user.value.email?.toLowerCase();
  if (email === "abdinglasa@gmail.com") return "Aidee";
  if (email === "jeffrey.t.go@gmail.com") return "Jeff";
  return user.value.email?.split("@")[0] ?? "Member";
});

watch(
  [loading, user, () => route.path],
  ([isLoading, currentUser, path]) => {
    if (!isLoading && !currentUser && path !== "/login") {
      void router.replace("/login");
    }
  },
  { immediate: true },
);

async function updateCount() {
  try {
    const items = await getQueuedScans();
    queueCount.value = items.length;
  } catch {
    // ignore
  }
}

let unsubQueue: (() => void) | null = null;
onMounted(() => {
  void updateCount();
  unsubQueue = subscribeToOfflineQueue(() => {
    void updateCount();
  });
});

onUnmounted(() => {
  if (unsubQueue) unsubQueue();
});

async function handleSignOut() {
  await signOut();
  await router.replace("/login");
}
</script>

<template>
  <main v-if="loading" class="viewport-spinner-wrap" aria-busy="true" aria-label="Loading">
    <div class="spinner" aria-hidden="true" />
  </main>

  <main v-else-if="!user || route.path === '/login'" class="app-main">
    <slot />
  </main>

  <template v-else>
    <header class="app-header">
      <RouterLink class="brand" to="/" :aria-label="BRAND_NAME">
        Vue<span>Presyo</span>
      </RouterLink>
      <div style="display: flex; align-items: center; gap: 8px">
        <span v-if="!isOnline" class="pill warn" title="Working offline">
          Offline
        </span>
        <div class="group">Group {{ user.groupId }} · {{ displayName }}</div>
        <button
          class="btn ghost"
          style="width: auto; padding: 6px 10px"
          type="button"
          @click="handleSignOut"
        >
          Sign out
        </button>
      </div>
    </header>

    <main class="app-main">
      <slot />
    </main>

    <RouterLink class="fab" to="/scan">
      + Scan{{ queueCount > 0 ? ` (${queueCount})` : "" }}
    </RouterLink>

    <nav class="app-nav" aria-label="Primary">
      <RouterLink to="/" :class="route.path === '/' ? 'on' : undefined">
        <span class="ico" aria-hidden="true">⌂</span>
        Home
      </RouterLink>
      <RouterLink
        to="/receipts"
        :class="route.path.startsWith('/receipts') ? 'on' : undefined"
      >
        <span class="ico" aria-hidden="true">☰</span>
        Receipts
      </RouterLink>
      <RouterLink
        to="/stores"
        :class="route.path.startsWith('/stores') ? 'on' : undefined"
      >
        <span class="ico" aria-hidden="true">🏬</span>
        Stores
      </RouterLink>
      <RouterLink
        to="/compare"
        :class="route.path.startsWith('/compare') ? 'on' : undefined"
      >
        <span class="ico" aria-hidden="true">⚖</span>
        Compare
      </RouterLink>
      <RouterLink
        to="/items"
        :class="route.path.startsWith('/items') ? 'on' : undefined"
      >
        <span class="ico" aria-hidden="true">▤</span>
        Items
      </RouterLink>
    </nav>
  </template>
</template>

