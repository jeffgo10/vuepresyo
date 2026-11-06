<script setup lang="ts">
import ScanPanel from "@/src/components/ScanPanel.vue";
</script>

<template>
  <div>
    <h1>Scan Receipt</h1>
    <p class="lead">
      Gemini reads items, quantities, and 12% VAT-inclusive totals.
    </p>
    <ScanPanel />
  </div>
</template>

