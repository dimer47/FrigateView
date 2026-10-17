<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Hls from 'hls.js'
import { useEventsStore, TYPE_LABELS, TYPE_COLORS } from '@/stores/events'
import { useServerStore } from '@/stores/server'
import { useLayoutStore } from '@/stores/layouts'
import { useTimelineStore } from '@/stores/timeline'
import { vodUrl } from '@/services/frigate'

const ev = useEventsStore()
const server = useServerStore()
const layouts = useLayoutStore()
const tl = useTimelineStore()

const e = computed(() => ev.byId(ev.detailId))
const view = ref('clip')
const video = ref(null)
const clipError = ref(false)
let hls = null

const pad = (n) => String(n).padStart(2, '0')
const hms = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
const camName = (id) => server.camById(id)?.name || id

const info = computed(() => {
  const x = e.value
  if (!x) return []
  const dur = Math.round(((x.e ?? Date.now()) - x.s) / 1000)
  const rows = [
    ['Caméra', camName(x.cam)],
    ['Zone', x.zones.map((z) => z.replace(/_/g, ' ')).join(', ') || '—'],
    ['Début', `${new Date(x.s).toLocaleDateString('fr-FR')} ${hms(x.s)}`],
    ['Fin', x.e ? hms(x.e) : 'en cours'],
    ['Durée', dur >= 60 ? `${Math.floor(dur / 60)} min ${pad(dur % 60)} s` : `${dur} s`],
    ['Objets', x.objects.join(', ') || '—'],
    ['Gravité', x.severity === 'alert' ? 'Alerte' : 'Détection']
  ]
  if (x.subLabels.length) rows.push(['Reconnu', x.subLabels.join(', ')])
  return rows
})

function loadClip() {
  destroy()
  clipError.value = false
  const x = e.value
  if (!x || view.value !== 'clip' || !video.value) return
  if (!Hls.isSupported()) { clipError.value = true; return }
  hls = new Hls()
  hls.on(Hls.Events.ERROR, (_a, d) => { if (d.fatal) clipError.value = true })
  hls.on(Hls.Events.MANIFEST_PARSED, () => video.value?.play().catch(() => {}))
  hls.loadSource(vodUrl(server.server, x.cam, (x.s - 3000) / 1000, ((x.e ?? Date.now()) + 3000) / 1000))
  hls.attachMedia(video.value)
}
function destroy() { if (hls) { hls.destroy(); hls = null } }

watch(() => [ev.detailId, view.value], async () => { if (e.value) ev.markSeen([e.value.id]); await nextTick(); loadClip() })
onMounted(() => { ev.markSeen([e.value.id]); loadClip(); addEventListener('keydown', onKey) })
onBeforeUnmount(() => { destroy(); removeEventListener('keydown', onKey) })

function nav(d) {
  const list = ev.filtered(layouts.cams, camName)
  const n = list[list.findIndex((x) => x.id === ev.detailId) + d]
  if (n) ev.detailId = n.id
}
function onKey(k) {
  if (k.key === 'Escape') { k.stopImmediatePropagation(); ev.detailId = null }
  else if (k.key === 'ArrowUp') { k.preventDefault(); nav(-1) }
  else if (k.key === 'ArrowDown') { k.preventDefault(); nav(1) }
}
function toTimeline() {
  const x = e.value
  ev.detailId = null
  ev.activeId = x.id
  const i = layouts.active?.cells.indexOf(x.cam) ?? -1
  if (i >= 0) layouts.selected = i
  tl.seek(x.s - 5000, x.cam, true)
}
</script>

<template>
  <div v-if="e" class="fixed inset-0 z-50 flex items-center justify-center bg-black/45" @mousedown.self="ev.detailId = null">
    <div class="w-[880px] max-w-[calc(100vw-40px)] rounded-xl border border-line-2 bg-modal p-5 shadow-2xl" role="dialog" aria-modal="true">
      <div class="mb-3.5 flex items-center gap-2 text-[15px] font-bold">
        <span :style="{ color: TYPE_COLORS[e.type] }">{{ TYPE_LABELS[e.type] }}</span> · {{ camName(e.cam) }}
        <span class="ml-auto flex gap-1">
          <button class="tbtn !size-7" title="Plus récent (↑)" @click="nav(-1)">‹</button>
          <button class="tbtn !size-7" title="Plus ancien (↓)" @click="nav(1)">›</button>
        </span>
        <button class="tbtn !size-7" title="Fermer (Échap)" @click="ev.detailId = null">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.6" /></svg>
        </button>
      </div>
      <div class="grid grid-cols-[1fr_260px] gap-4.5">
        <div>
          <div class="mb-2 flex gap-1">
            <button v-for="[k, l] in [['clip', 'Clip'], ['snap', 'Image']]" :key="k" class="rounded-full border px-2.5 py-0.5 text-xs" :class="view === k ? 'border-accent bg-accent text-white' : 'border-line text-ink-2'" @click="view = k">{{ l }}</button>
          </div>
          <div class="relative aspect-video overflow-hidden rounded-lg bg-black">
            <video v-if="view === 'clip'" ref="video" class="size-full" controls muted playsinline />
            <img v-else-if="e.thumb" :src="e.thumb" class="size-full object-contain" alt="">
            <div v-if="view === 'clip' && clipError" class="absolute inset-0 flex items-center justify-center text-[13px] text-ink-2">Clip indisponible pour cette période</div>
          </div>
        </div>
        <div>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[13px]">
            <template v-for="[k, v] in info" :key="k"><dt class="text-ink-3">{{ k }}</dt><dd class="text-right">{{ v }}</dd></template>
          </dl>
          <div class="mt-4 flex flex-col gap-1.5">
            <button class="btn btn-primary text-left" @click="toTimeline">Relire dans la timeline</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
