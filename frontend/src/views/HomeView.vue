<script setup lang="ts">
import ProductPhotoPrompt from "@/src/components/ProductPhotoPrompt.vue";
import PriceChangeList from "@/src/components/PriceChangeList.vue";
import ReceiptList from "@/src/components/ReceiptList.vue";
</script>

<template>
  <div>
    <ProductPhotoPrompt />
    <h1>Price Changes</h1>
    <p class="lead">Increases and decreases recorded this month.</p>
    <PriceChangeList />
    <h2>Recent Receipts</h2>
    <ReceiptList empty="No receipts yet. Scan one from the Scan tab." />
  </div>
</template>

