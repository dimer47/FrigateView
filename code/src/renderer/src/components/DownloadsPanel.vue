<script setup>
// Clips exportés : panneau déplaçable, réductible ; fermeture possible seulement quand tout est fini
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useMediaStore } from '@/stores/media'
import { load, save } from '@/stores/storage'
import { loc } from '@/i18n'

const media = useMediaStore()
// Unité localisée par le navigateur (Mo, MB, МБ…)
const mb = (b) => new Intl.NumberFormat(loc(), { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }).format(b / 1048576)
const pct = (d) => (d.total ? Math.round((d.loaded / d.total) * 100) : null)
const reveal = (p) => window.native.reveal(p)
const running = computed(() => media.downloads.filter((d) => d.state === 'running'))
const anyDone = computed(() => media.downloads.some((d) => d.state !== 'running'))
const failed = computed(() => media.downloads.some((d) => d.state === 'error'))
// Progression globale des clips en cours (null = taille inconnue)
const totalPct = computed(() => {
  const r = running.value
  if (!r.length || r.some((d) => !d.total)) return null
  return Math.round((r.reduce((a, d) => a + d.loaded, 0) / r.reduce((a, d) => a + d.total, 0)) * 100)
})

const mini = ref(load('fv-dl-mini', false))
const toggleMini = () => { mini.value = !mini.value; save('fv-dl-mini', mini.value) }

/* ---------- Déplacement : position gardée en distance au coin bas droit ---------- */
const panel = ref(null)
const pos = ref(load('fv-dl-pos', { right: 16, bottom: 24 }))
let drag = null
const clamp = () => {
  const el = panel.value
  if (!el) return
  const w = el.offsetWidth, h = el.offsetHeight
  pos.value = {
    right: Math.min(Math.max(pos.value.right, 0), Math.max(window.innerWidth - w, 0)),
    bottom: Math.min(Math.max(pos.value.bottom, 0), Math.max(window.innerHeight - h, 0))
  }
}
function onDown(e) {
  if (e.button !== 0 || e.target.closest('button')) return
  drag = { x: e.clientX, y: e.clientY, ...pos.value }
  e.currentTarget.setPointerCapture(e.pointerId)
}
function onMove(e) {
  if (!drag) return
  pos.value = { right: drag.right - (e.clientX - drag.x), bottom: drag.bottom - (e.clientY - drag.y) }
  clamp()
}
function onUp() {
  if (!drag) return
  drag = null
  save('fv-dl-pos', pos.value)
}
onMounted(() => window.addEventListener('resize', clamp))
onBeforeUnmount(() => window.removeEventListener('resize', clamp))
</script>

<template>
  <div v-if="media.downloads.length" ref="panel" class="fixed z-[80] rounded-lg border border-line-2 bg-modal shadow-xl" :class="mini ? 'w-64' : 'w-80'" :style="{ right: pos.right + 'px', bottom: pos.bottom + 'px' }">
    <header class="flex cursor-move select-none items-center gap-2 px-3 py-2 text-xs font-bold" :class="{ 'border-b border-line': !mini }" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp">
      <span class="min-w-0 flex-1 truncate">
        {{ $t('export.downloads') }}
        <span v-if="mini" class="ml-1 font-normal" :class="failed && !running.length ? 'text-bad' : 'text-ink-3'">
          · {{ running.length ? $t('export.runningN', { n: running.length }) + (totalPct !== null ? ' · ' + totalPct + ' %' : '') : failed ? $t('export.someFailed') : $t('export.allDone') }}
        </span>
      </span>
      <button v-if="anyDone && !mini" class="font-semibold text-accent" @click="media.clear()">{{ $t('export.clear') }}</button>
      <button class="flex size-5 items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-ink" :title="mini ? $t('export.expand') : $t('export.minimize')" @click="toggleMini">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path v-if="mini" d="M3 7.5 6 4.5l3 3" /><path v-else d="M3 4.5 6 7.5l3-3" /></svg>
      </button>
      <!-- Fermer seulement quand plus rien n'est en cours -->
      <button v-if="!running.length" class="flex size-5 items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-ink" :title="$t('common.close')" @click="media.clear()">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 3l6 6M9 3 3 9" /></svg>
      </button>
    </header>
    <div v-if="mini && running.length" class="px-3 pb-2"><div class="h-1 overflow-hidden rounded bg-raised"><div class="h-full bg-accent transition-all" :class="{ 'w-1/3 animate-pulse': totalPct === null }" :style="totalPct !== null ? { width: totalPct + '%' } : null" /></div></div>
    <ul v-if="!mini" class="max-h-60 overflow-y-auto">
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
