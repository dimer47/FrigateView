<script setup>
import { GRIDS } from '@/stores/layouts'
defineProps({ grid: { type: String, required: true } })
</script>

<template>
  <div class="gicon" :class="'g-' + grid"><div v-for="i in GRIDS[grid].n" :key="i" /></div>
</template>
