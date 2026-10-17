<script setup>
// Export de clips MP4 : caméras, début et durée. Le fichier est assemblé par Frigate à partir des enregistrements.
import { ref, computed } from 'vue'
import { useMediaStore } from '@/stores/media'
import { useServerStore } from '@/stores/server'
import { useLayoutStore } from '@/stores/layouts'
import { useTimelineStore } from '@/stores/timeline'
import { t, loc, fmtDuration } from '@/i18n'

const media = useMediaStore()
const server = useServerStore()
const layouts = useLayoutStore()
const tl = useTimelineStore()
const o = media.exportOpen

const tz = new Date().getTimezoneOffset() * 60e3
const toLocal = (ms) => new Date(ms - tz).toISOString().slice(0, 19)
// Raccourcis de durée : fixent la fin à partir du début
const PRESETS = [10, 30, 60, 120, 300, 600, 1800, 3600]

const picked = ref([...o.cams])
const startStr = ref(toLocal(o.start))
const endStr = ref(toLocal(o.end))
const start = computed(() => new Date(startStr.value).getTime())
const end = computed(() => new Date(endStr.value).getTime())
const length = computed(() => Math.round((end.value - start.value) / 1000))
// Libellé court : 10 s, 5 min, 1 h
const short = (d) => (d < 60 ? `${d} s` : d < 3600 ? `${d / 60} min` : `${d / 3600} h`)
const setDuration = (d) => { if (!isNaN(start.value)) endStr.value = toLocal(start.value + d * 1000) }
// Caméras du layout d'abord, puis les autres
const cams = computed(() => { const inLayout = layouts.cams; return [...inLayout, ...server.cameras.map((c) => c.id).filter((c) => !inLayout.includes(c))] })
const error = computed(() => (isNaN(start.value) || isNaN(end.value) ? t('export.badDate') : end.value <= start.value ? t('export.badRange') : end.value > Date.now() + 1000 ? t('export.future') : !picked.value.length ? t('export.noCamera') : ''))
// Caméras sans enregistrement connu sur la période (d'après la timeline ; inconnu = pas d'avertissement)
const empty = computed(() => picked.value.filter((c) => { const rec = tl.rangesFor(c).rec; return rec.length && !rec.some((r) => r.e > start.value && r.s < end.value) }))
const busy = ref(false)
async function run() { busy.value = true; try { await media.exportClips(picked.value, start.value, end.value) } finally { busy.value = false } }
const close = () => (media.exportOpen = null)
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/55" @mousedown.self="close" @keydown.esc="close">
    <div class="w-[460px] max-w-[calc(100vw-40px)] rounded-xl border border-line-2 bg-modal shadow-2xl" role="dialog" aria-modal="true">
      <header class="flex items-center border-b border-line px-5 py-3">
        <h2 class="text-[15px] font-bold">{{ $t('export.title') }}</h2>
        <button class="ml-auto flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-bad/15 hover:text-bad" :title="$t('common.closeEsc')" @click="close">
          <svg width="13" height="13" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.7" /></svg>
        </button>
      </header>
      <div class="flex flex-col gap-4 p-5 text-[13px]">
        <div>
          <div class="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">{{ $t('export.cameras') }}</div>
          <div class="grid max-h-40 grid-cols-2 gap-x-4 overflow-y-auto">
            <label v-for="c in cams" :key="c" class="flex items-center gap-2 py-1"><input v-model="picked" type="checkbox" :value="c" class="size-4 accent-accent">{{ server.camById(c)?.name || c }}</label>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label><span class="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">{{ $t('export.start') }}</span>
            <input v-model="startStr" type="datetime-local" step="1" class="input [color-scheme:dark]"></label>
          <label><span class="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-3">{{ $t('export.end') }}</span>
            <input v-model="endStr" type="datetime-local" step="1" class="input [color-scheme:dark]"></label>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="mr-1 text-[11px] font-bold uppercase tracking-wider text-ink-3">{{ $t('export.duration') }}</span>
          <button v-for="d in PRESETS" :key="d" type="button" class="rounded-full border px-2.5 py-0.5 text-[11px]" :class="length === d ? 'border-accent bg-accent/15 text-accent' : 'border-line text-ink-2 hover:border-accent'" @click="setDuration(d)">{{ short(d) }}</button>
          <span v-if="length > 0 && !PRESETS.includes(length)" class="ml-1 text-[11px] text-ink-3">{{ fmtDuration(length) }}</span>
        </div>
        <p class="text-xs text-ink-3">
          {{ isNaN(end) ? '' : $t('export.summary', { start: new Date(start).toLocaleString(loc()), end: new Date(end).toLocaleTimeString(loc()) }) }}
          <br>{{ picked.length > 1 ? $t('export.folderHint', { n: picked.length }) : $t('export.fileHint') }}
        </p>
        <p v-if="error" class="text-xs text-bad">{{ error }}</p>
        <p v-else-if="empty.length" class="text-xs text-warn">{{ $t('export.noRecFor', { cams: empty.map((c) => server.camById(c)?.name || c).join(', ') }) }}</p>
        <div class="flex justify-end gap-2">
          <button class="btn" @click="close">{{ $t('common.cancel') }}</button>
          <button class="btn btn-primary" :disabled="!!error || busy" @click="run">{{ $t('export.go') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
