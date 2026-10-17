<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Hls from 'hls.js'
import { useEventsStore, typeLabel, TYPE_COLORS } from '@/stores/events'
import { t, loc, fmtDuration } from '@/i18n'
import { useServerStore } from '@/stores/server'
import { useLayoutStore } from '@/stores/layouts'
import { useTimelineStore } from '@/stores/timeline'
import { vodUrl } from '@/services/frigate'
import { useMediaStore } from '@/stores/media'

const ev = useEventsStore()
const server = useServerStore()
const layouts = useLayoutStore()
const tl = useTimelineStore()
const media = useMediaStore()

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
    [t('detail.camera'), camName(x.cam)],
    [t('detail.zone'), x.zones.map((z) => z.replace(/_/g, ' ')).join(', ') || '—'],
    [t('detail.start'), `${new Date(x.s).toLocaleDateString(loc())} ${hms(x.s)}`],
    [t('detail.end'), x.e ? hms(x.e) : t('detail.ongoing')],
    [t('detail.duration'), fmtDuration(dur)],
    [t('detail.objects'), x.objects.join(', ') || '—'],
    [t('detail.severity'), x.severity === 'alert' ? t('detail.alert') : t('detail.detection')]
  ]
  if (x.subLabels.length) rows.push([t('detail.recognized'), x.subLabels.join(', ')])
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
// Clip de l'événement, avec 3 s avant et après
function download() { const x = e.value; media.exportClips([x.cam], x.s - 3000, Math.min(Date.now(), (x.e ?? Date.now()) + 3000)) }
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
  <div v-if="e" class="fixed inset-0 z-50 flex items-center justify-center bg-black/55" @mousedown.self="ev.detailId = null">
    <div class="w-[900px] max-w-[calc(100vw-40px)] overflow-hidden rounded-xl border border-line-2 bg-modal shadow-2xl" role="dialog" aria-modal="true">
      <!-- En-tête : titre à gauche, navigation groupée puis fermeture séparée -->
      <header class="flex items-center gap-3 border-b border-line px-5 py-3">
        <span class="size-2.5 shrink-0 rounded-full" :style="{ background: TYPE_COLORS[e.type] }" />
        <h2 class="truncate text-[15px] font-bold">
          <span :style="{ color: TYPE_COLORS[e.type] }">{{ typeLabel(e.type) }}</span>
          <span class="font-normal text-ink-3"> — </span>{{ camName(e.cam) }}
          <span class="ml-2 font-mono text-[13px] font-normal text-ink-2">{{ hms(e.s) }}</span>
        </h2>
        <div class="ml-auto flex overflow-hidden rounded-md border border-line text-xs">
          <button class="flex items-center gap-1 px-2.5 py-1.5 text-ink-2 hover:bg-raised hover:text-ink" :title="$t('detail.newerTitle')" @click="nav(-1)">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 6.5L5 3.5l3 3" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>{{ $t('detail.newer') }}
          </button>
          <button class="flex items-center gap-1 border-l border-line px-2.5 py-1.5 text-ink-2 hover:bg-raised hover:text-ink" :title="$t('detail.olderTitle')" @click="nav(1)">
            {{ $t('detail.older') }}<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5L5 6.5l3-3" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
          </button>
        </div>
        <div class="h-6 w-px bg-line" />
        <button class="flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-bad/15 hover:text-bad" :title="$t('common.closeEsc')" :aria-label="$t('common.close')" @click="ev.detailId = null">
          <svg width="13" height="13" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.7" /></svg>
        </button>
      </header>

      <div class="grid grid-cols-[1fr_250px] gap-5 p-5">
        <div class="flex flex-col gap-3">
          <!-- Choix clip / image : contrôle segmenté, détaché de la vidéo -->
          <div class="flex items-center justify-between">
            <div class="flex rounded-md border border-line p-0.5 text-xs">
              <button v-for="[k, l] in [['clip', $t('detail.clip')], ['snap', $t('detail.snapshot')]]" :key="k" class="rounded px-3 py-1 font-semibold"
                :class="view === k ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink'" @click="view = k">{{ l }}</button>
            </div>
            <span class="text-xs text-ink-3">{{ view === 'clip' ? $t('detail.clipHint') : $t('detail.snapshotHint') }}</span>
          </div>
          <div class="relative aspect-video overflow-hidden rounded-lg bg-black ring-1 ring-line">
            <video v-if="view === 'clip'" ref="video" class="size-full" controls muted playsinline />
            <img v-else-if="e.thumb" :src="e.thumb" class="size-full object-contain" alt="">
            <div v-if="view === 'clip' && clipError" class="absolute inset-0 flex items-center justify-center text-[13px] text-ink-2">{{ $t('detail.clipUnavailable') }}</div>
          </div>
        </div>

        <div class="flex flex-col">
          <div class="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-3">{{ $t('detail.info') }}</div>
          <dl class="divide-y divide-line rounded-lg border border-line text-[13px]">
            <div v-for="[k, v] in info" :key="k" class="flex justify-between gap-3 px-3 py-2"><dt class="text-ink-3">{{ k }}</dt><dd class="truncate text-right">{{ v }}</dd></div>
          </dl>
          <button class="btn mt-auto flex items-center justify-center gap-2 py-2" @click="download">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 1v8M3.5 5.5L7 9l3.5-3.5M1.5 12.5h11" /></svg>{{ $t('detail.download') }}
          </button>
          <button class="btn btn-primary mt-2 flex items-center justify-center gap-2 py-2.5" @click="toTimeline">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5v11l9.5-5.5z" /></svg>{{ $t('detail.toTimeline') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
