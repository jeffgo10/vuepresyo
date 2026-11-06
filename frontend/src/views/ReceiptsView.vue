<script setup lang="ts">
import ReceiptList from "@/src/components/ReceiptList.vue";
</script>

<template>
  <div>
    <h1>Receipts</h1>
    <p class="lead">All receipts saved by the GO group.</p>
    <ReceiptList empty="No receipts saved yet." />
  </div>
</template>

