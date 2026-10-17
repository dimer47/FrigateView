<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useEventsStore, typeLabel, TYPE_COLORS } from '@/stores/events'
import { FILTER_KEYS, filterOptions, toggleFilter, rangePreset, rangeFromDates } from '@/stores/eventFilters'
import { t, dayTitle, fmtDuration } from '@/i18n'
import { useLayoutStore } from '@/stores/layouts'
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import { playEvent } from '@/stores/playEvent'

const ev = useEventsStore()
const layouts = useLayoutStore()
const server = useServerStore()
const ui = useUiStore()
const list = ref(null)

const camName = (id) => server.camById(id)?.name || id
const items = computed(() => ev.filtered(layouts.cams, camName).slice(0, ev.historyMode ? Infinity : 300))
const pad = (n) => String(n).padStart(2, '0')
const hms = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
const dayKey = (t) => new Date(t).toDateString()
const duration = (e) => fmtDuration(Math.max(1, Math.round(((e.e ?? Date.now()) - e.s) / 1000)))
const zone = (z) => z.replace(/_/g, ' ')

/* ---- Filtres par menus et recherche dans l'historique ---- */
const menu = ref(null) // menu ouvert : object | face | plate | zone | cam | range
const dates = ref({ from: '', to: '' })
const options = computed(() => filterOptions([...ev.items, ...ev.hist.items], { ...ev.known, cams: server.cameras?.map((c) => c.id) }))
const objLabel = (o) => { const k = 'labels.' + o, v = t(k); return v === k ? o.replace(/_/g, ' ') : v }
const valueLabel = (k, v) => (k === 'object' ? objLabel(v) : k === 'cam' ? camName(v) : k === 'zone' ? zone(v) : v)
const chips = computed(() => FILTER_KEYS.flatMap((k) => ev.filters[k].map((v) => ({ k, v }))))
const PRESETS = ['today', '7d', '30d']
const rangeText = computed(() => {
  const r = ev.range
  if (PRESETS.includes(r.preset)) return t('events.range.' + r.preset)
  if (r.preset === 'custom') return [dates.value.from, dates.value.to].map((d) => d ? new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '…').join(' – ')
  return t('events.range.any')
})
function toggle(k, v) { ev.filters = toggleFilter(ev.filters, k, v) }
function setPreset(p) { ev.range = { preset: p, ...rangePreset(p) }; menu.value = null }
function applyDates() { const r = rangeFromDates(dates.value.from, dates.value.to); ev.range = { preset: r.after || r.before ? 'custom' : '', ...r } }
function clearAll() { ev.clearFilters(); dates.value = { from: '', to: '' }; menu.value = null }
// Nouvelle recherche dès qu'un filtre ou la plage change (léger délai pour cumuler plusieurs clics)
let timer
watch(() => [ev.filters, ev.range, ev.scopeLayout, layouts.cams], () => { clearTimeout(timer); timer = setTimeout(() => ev.searchHistory(true, layouts.cams), 250) }, { deep: true })
const onDoc = (m) => { if (menu.value && !m.target.closest?.('[data-fmenu]')) menu.value = null }
onMounted(() => document.addEventListener('mousedown', onDoc))
onBeforeUnmount(() => { clearTimeout(timer); document.removeEventListener('mousedown', onDoc) })
// Bas de liste atteint : page suivante
function onScroll(e) { const el = e.target; if (ev.historyMode && el.scrollTop + el.clientHeight > el.scrollHeight - 80) ev.searchHistory(false, layouts.cams) }

// Clic : relecture 5 s avant le début, sur la case de la caméra
const open = playEvent
async function allSeen() {
  const n = ev.unseenCount
  if (!(await ev.markAllSeen())) ui.notify(t('events.markFailed'))
  else ui.notify(t('events.markedSeen', { n }, n))
}

function startResize(e) {
  const x = e.clientX, w = ev.width
  const move = (m) => { ev.width = Math.max(220, Math.min(520, w + x - m.clientX)) }
  const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); ev.persist() }
  addEventListener('mousemove', move); addEventListener('mouseup', up)
}
</script>

<template>
  <aside class="relative flex shrink-0 flex-col border-l border-line bg-panel" :style="{ width: ev.width + 'px' }">
    <div class="absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize hover:bg-accent" :title="$t('common.resize')" @mousedown.prevent="startResize" />
    <div class="flex flex-col gap-2 border-b border-line px-3 py-2.5">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold">{{ $t('events.title') }}</h3>
        <span class="flex items-center gap-1.5 text-[11px]" :class="ev.realtime === 'on' ? 'text-ok' : 'text-ink-3'" :title="ev.realtime === 'on' ? $t('events.realtimeOnTitle') : $t('events.realtimeOffTitle')">
          <i class="size-1.5 rounded-full bg-current" />{{ ev.realtime === 'on' ? $t('events.realtimeOn') : $t('events.realtimeOff') }}
        </span>
      </div>
      <div class="flex flex-wrap gap-1">
        <button v-for="[k, l, tip] in [['all', $t('events.all'), ''], ['alert', $t('events.alerts'), $t('events.alertsTitle')], ['detection', $t('events.detections'), $t('events.detectionsTitle')]]" :key="k" :title="tip"
          class="rounded-full border px-2.5 py-0.5 text-xs" :class="ev.sev === k ? 'border-accent bg-accent text-white' : 'border-line text-ink-2 hover:border-accent hover:text-ink'" @click="ev.sev = k">{{ l }}</button>
      </div>
      <div class="relative">
        <svg class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="5" /><line x1="11" y1="11" x2="15" y2="15" /></svg>
        <input v-model="ev.search" type="search" class="input !pl-8" :placeholder="$t('events.searchPlaceholder')" :aria-label="$t('events.search')">
      </div>
      <!-- Menus de filtres (cumulables) et plage de dates -->
      <div class="relative flex flex-wrap gap-1" data-fmenu>
        <button v-for="k in FILTER_KEYS" :key="k" class="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]"
          :class="ev.filters[k].length ? 'border-accent text-ink' : 'border-line text-ink-2 hover:border-accent hover:text-ink'" @click="menu = menu === k ? null : k">
          {{ $t('events.filter.' + k) }}<b v-if="ev.filters[k].length" class="rounded-sm bg-accent px-1 text-[10px] text-white">{{ ev.filters[k].length }}</b>
          <svg width="8" height="8" viewBox="0 0 10 10"><path d="M2 3.5L5 6.5l3-3" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
        </button>
        <button class="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]" :class="ev.range.preset ? 'border-accent text-ink' : 'border-line text-ink-2 hover:border-accent hover:text-ink'"
          :title="$t('events.range.title')" @click="menu = menu === 'range' ? null : 'range'">
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="2.5" width="11" height="10" rx="1.5" /><path d="M1.5 6h11M4.5 1v3M9.5 1v3" /></svg>{{ rangeText }}
        </button>
        <div v-if="menu" class="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-line-2 bg-modal p-1 shadow-xl">
          <template v-if="menu === 'range'">
            <button v-for="p in ['', ...PRESETS]" :key="p" class="block w-full rounded px-2 py-1 text-left text-xs hover:bg-raised" :class="ev.range.preset === p ? 'font-semibold text-accent' : ''" @click="setPreset(p)">{{ $t('events.range.' + (p || 'any')) }}</button>
            <div class="mt-1 flex items-center gap-1 border-t border-line px-1 pt-1.5 text-[11px] text-ink-3">
              <input v-model="dates.from" type="date" class="input !px-1 !py-0.5 text-[11px]" :aria-label="$t('events.range.from')" @change="applyDates">
              –
              <input v-model="dates.to" type="date" class="input !px-1 !py-0.5 text-[11px]" :aria-label="$t('events.range.to')" @change="applyDates">
            </div>
          </template>
          <template v-else>
            <p v-if="!options[menu].length" class="px-2 py-1.5 text-xs text-ink-3">{{ $t('events.filter.noValues') }}</p>
            <label v-for="v in options[menu]" :key="v" class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-raised">
              <input type="checkbox" class="accent-[var(--color-accent)]" :checked="ev.filters[menu].includes(v)" @change="toggle(menu, v)">
              <span class="truncate">{{ valueLabel(menu, v) }}</span>
            </label>
          </template>
        </div>
      </div>
      <div v-if="ev.historyMode" class="flex flex-wrap items-center gap-1">
        <button v-for="c in chips" :key="c.k + c.v" class="flex items-center gap-1 rounded-sm bg-raised px-1.5 text-[11px] text-ink hover:bg-bad/20" :title="$t('events.filter.remove')" @click="toggle(c.k, c.v)">
          <span class="text-ink-3">{{ $t('events.filter.' + c.k) }}</span> {{ valueLabel(c.k, c.v) }} ×
        </button>
        <button class="ml-auto text-[11px] font-semibold text-accent" @click="clearAll">{{ $t('events.filter.clear') }}</button>
      </div>
      <div class="flex items-center justify-between gap-1.5 text-xs text-ink-3">
        <button class="rounded-full border px-2 py-0.5 text-[11px]" :class="ev.scopeLayout ? 'border-accent bg-accent text-white' : 'border-line text-ink-2'" :title="$t('events.scopeTitle')" @click="ev.scopeLayout = !ev.scopeLayout; ev.persist()">{{ $t('events.scope') }}</button>
        <span class="whitespace-nowrap">
          <template v-if="ev.unseenCount">{{ $t('events.unseen', { n: ev.unseenCount }, ev.unseenCount) }} · <button class="font-semibold text-accent" :title="$t('events.markAllTitle')" @click="allSeen">{{ $t('events.markAll') }}</button></template>
          <template v-else>{{ $t('events.allSeen') }}</template>
        </span>
      </div>
    </div>

    <div ref="list" class="min-h-0 flex-1 overflow-y-auto p-1.5" @scroll.passive="onScroll">
      <div v-if="ev.historyMode" class="px-2 pt-1 text-[11px] text-ink-3" :title="$t('events.history.title')">{{ $t('events.history.label') }}</div>
      <p v-if="ev.historyMode && !items.length" class="px-3 py-8 text-center text-[13px] leading-relaxed text-ink-3">
        {{ ev.hist.loading ? $t('events.history.loading') : ev.hist.error ? $t('events.history.error') : $t('events.history.none') }}
      </p>
      <p v-else-if="!items.length" class="px-3 py-8 text-center text-[13px] leading-relaxed text-ink-3">
        {{ ev.search ? (ev.scopeLayout ? $t('events.noResultLayout', { q: ev.search }) : $t('events.noResult', { q: ev.search })) : (ev.scopeLayout ? $t('events.noneLayout') : $t('events.none')) }}
        <template v-if="ev.scopeLayout"><br>{{ $t('events.scopeHint') }}</template>
        <span v-if="ev.search" class="mt-2.5 block text-[11px] text-warn">{{ $t('events.recognitionHint') }}</span>
      </p>
      <template v-for="(e, i) in items" :key="e.id">
        <div v-if="i === 0 || dayKey(e.s) !== dayKey(items[i - 1].s)" class="px-2 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">{{ dayTitle(e.s) }}</div>
        <div role="button" tabindex="0" class="group relative mb-0.5 flex w-full gap-2.5 rounded-md border px-2 py-1.5 text-left"
          :class="[ev.activeId === e.id ? 'border-accent/35 bg-accent/15' : 'border-transparent hover:bg-raised', { 'animate-[pulse_1s_ease-out_2]': ev.fresh.includes(e.id) }]"
          :title="$t('events.itemHint')" @click="open(e)" @dblclick="ev.detailId = e.id" @keydown.enter="ev.detailId = e.id">
          <span class="relative h-10 w-16 shrink-0 overflow-hidden rounded border-l-[3px] bg-card" :style="{ borderColor: TYPE_COLORS[e.type] }">
            <img v-if="e.thumb" :src="e.thumb" class="size-full object-cover" alt="" loading="lazy" draggable="false">
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-px">
            <span class="flex items-center gap-1.5">
              <span v-if="!e.seen" class="size-[7px] shrink-0 rounded-full bg-accent" :title="$t('events.unseenDot')" />
              <span class="truncate text-[13px] font-semibold" :style="{ color: TYPE_COLORS[e.type] }">{{ typeLabel(e.type) }}</span>
              <span class="ml-auto shrink-0 font-mono text-xs text-ink-2">{{ hms(e.s) }}</span>
            </span>
            <span class="truncate text-xs text-ink-3">
              <span v-if="!e.e" class="mr-1 rounded-sm border border-bad/50 px-1 text-[10px] font-bold text-bad">{{ $t('events.ongoing') }}</span>
              <span v-for="l in e.subLabels" :key="l" class="mr-1 rounded-sm bg-raised px-1 text-[11px] text-ink">{{ l }}</span>
              {{ camName(e.cam) }}<template v-if="e.zones.length"> · {{ zone(e.zones[0]) }}</template> · {{ duration(e) }}
            </span>
          </span>
          <button class="absolute bottom-1 right-1.5 rounded border border-line-2 bg-modal px-1.5 text-[11px] opacity-0 hover:border-accent hover:bg-accent group-hover:opacity-100" @click.stop="ev.detailId = e.id">{{ $t('events.details') }}</button>
        </div>
      </template>
      <div v-if="ev.historyMode && items.length" class="py-2 text-center text-[11px] text-ink-3">
        <span v-if="ev.hist.loading">{{ $t('events.history.loading') }}</span>
        <span v-else-if="ev.hist.error" class="text-warn">{{ $t('events.history.error') }}</span>
        <span v-else-if="ev.hist.done">{{ $t('events.history.end') }}</span>
        <button v-else class="btn px-3 py-1 text-xs" @click="ev.searchHistory(false, layouts.cams)">{{ $t('events.history.more') }}</button>
      </div>
    </div>
  </aside>
</template>
