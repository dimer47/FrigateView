<script setup>
import { GRIDS, gridStyle, cellStyle } from '@/stores/layouts'
defineProps({ grid: { type: String, required: true } })
</script>

<template>
  <div class="gicon" :style="gridStyle(grid)"><div v-for="i in GRIDS[grid]?.n || 4" :key="i" :style="cellStyle(grid, i - 1)" /></div>
</template>
