<script setup>
// Clips en cours de téléchargement, en bas à droite
import { computed } from 'vue'
import { useMediaStore } from '@/stores/media'
import { loc } from '@/i18n'

const media = useMediaStore()
const mb = (b) => (b / 1048576).toLocaleString(loc(), { maximumFractionDigits: 1 }) + ' Mo'
const pct = (d) => (d.total ? Math.round((d.loaded / d.total) * 100) : null)
const reveal = (p) => window.native.reveal(p)
const anyDone = computed(() => media.downloads.some((d) => d.state !== 'running'))
</script>

<template>
  <div v-if="media.downloads.length" class="fixed bottom-6 right-4 z-[80] w-80 rounded-lg border border-line-2 bg-modal shadow-xl">
    <header class="flex items-center border-b border-line px-3 py-2 text-xs font-bold">
      {{ $t('export.downloads') }}
      <button v-if="anyDone" class="ml-auto font-semibold text-accent" @click="media.clear()">{{ $t('export.clear') }}</button>
    </header>
    <ul class="max-h-60 overflow-y-auto">
      <li v-for="d in media.downloads" :key="d.id" class="border-b border-line px-3 py-2 text-xs last:border-0">
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate" :title="d.path">{{ d.name }}</span>
          <button v-if="d.state === 'running'" class="text-ink-3 hover:text-bad" @click="media.cancel(d.id)">{{ $t('common.cancel') }}</button>
          <button v-else-if="d.state === 'done'" class="font-semibold text-accent" @click="reveal(d.path)">{{ $t('media.show') }}</button>
        </div>
        <div v-if="d.state === 'running'" class="mt-1.5 h-1 overflow-hidden rounded bg-raised"><div class="h-full bg-accent transition-all" :class="{ 'w-1/3 animate-pulse': pct(d) === null }" :style="pct(d) !== null ? { width: pct(d) + '%' } : null" /></div>
        <div class="mt-1 text-[11px]" :class="d.state === 'error' ? 'text-bad' : 'text-ink-3'">
          {{ d.state === 'running' ? (d.loaded ? mb(d.loaded) + (d.total ? ' / ' + mb(d.total) : '') : $t('export.preparing')) : d.state === 'done' ? $t('export.done', { size: mb(d.loaded) }) : d.state === 'canceled' ? $t('export.canceled') : d.error }}
        </div>
      </li>
    </ul>
  </div>
</template>
