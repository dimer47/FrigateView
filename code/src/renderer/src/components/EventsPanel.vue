<script setup>
import { computed, ref } from 'vue'
import { useEventsStore, TYPE_LABELS, TYPE_COLORS } from '@/stores/events'
import { useLayoutStore } from '@/stores/layouts'
import { useServerStore } from '@/stores/server'
import { useTimelineStore } from '@/stores/timeline'
import { useUiStore } from '@/stores/ui'

const ev = useEventsStore()
const layouts = useLayoutStore()
const server = useServerStore()
const tl = useTimelineStore()
const ui = useUiStore()
const list = ref(null)

const camName = (id) => server.camById(id)?.name || id
const items = computed(() => ev.filtered(layouts.cams, camName).slice(0, 300))
const pad = (n) => String(n).padStart(2, '0')
const hms = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
const dayKey = (t) => new Date(t).toDateString()
function dayTitle(t) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(t); d.setHours(0, 0, 0, 0)
  const diff = Math.round((today - d) / 864e5)
  return diff === 0 ? "Aujourd'hui" : diff === 1 ? 'Hier' : new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}
function duration(e) {
  const s = Math.max(1, Math.round(((e.e ?? Date.now()) - e.s) / 1000))
  return s >= 60 ? `${Math.floor(s / 60)} min ${pad(s % 60)} s` : `${s} s`
}
const zone = (z) => z.replace(/_/g, ' ')

// Clic : relecture 5 s avant le début, sur la case de la caméra
function open(e) {
  ev.activeId = e.id
  ev.markSeen([e.id])
  const i = layouts.active?.cells.indexOf(e.cam) ?? -1
  if (i >= 0) layouts.selected = i
  else if (layouts.active) ui.notify(`${camName(e.cam)} n'est pas dans ce layout`, { label: "L'ajouter", run: () => { const empty = layouts.active.cells.indexOf(null); layouts.place(e.cam, empty >= 0 ? empty : layouts.selected) } })
  tl.seek(e.s - 5000, e.cam, true)
}
async function allSeen() {
  const n = ev.unseenCount
  if (!(await ev.markAllSeen())) ui.notify('Impossible de marquer les événements : droits insuffisants ou serveur injoignable')
  else ui.notify(`${n} événement${n > 1 ? 's' : ''} marqué${n > 1 ? 's' : ''} comme vu${n > 1 ? 's' : ''}`)
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
    <div class="absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize hover:bg-accent" title="Glisser pour redimensionner" @mousedown.prevent="startResize" />
    <div class="flex flex-col gap-2 border-b border-line px-3 py-2.5">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold">Événements</h3>
        <span class="flex items-center gap-1.5 text-[11px]" :class="ev.realtime === 'on' ? 'text-ok' : 'text-ink-3'" :title="ev.realtime === 'on' ? 'Les nouveaux événements arrivent en direct' : 'Temps réel indisponible : mise à jour chaque minute'">
          <i class="size-1.5 rounded-full bg-current" />{{ ev.realtime === 'on' ? 'Temps réel' : 'Mise à jour 1/min' }}
        </span>
      </div>
      <div class="flex flex-wrap gap-1">
        <button v-for="[k, l, t] in [['all', 'Tout', ''], ['alert', 'Alertes', 'Personnes, en général'], ['detection', 'Détections', 'Véhicules, animaux…']]" :key="k" :title="t"
          class="rounded-full border px-2.5 py-0.5 text-xs" :class="ev.sev === k ? 'border-accent bg-accent text-white' : 'border-line text-ink-2 hover:border-accent hover:text-ink'" @click="ev.sev = k">{{ l }}</button>
      </div>
      <div class="relative">
        <svg class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="5" /><line x1="11" y1="11" x2="15" y2="15" /></svg>
        <input v-model="ev.search" type="search" class="input !pl-8" placeholder="Plaque, visage, caméra, zone…" aria-label="Rechercher dans les événements">
      </div>
      <div class="flex items-center justify-between gap-1.5 text-xs text-ink-3">
        <button class="rounded-full border px-2 py-0.5 text-[11px]" :class="ev.scopeLayout ? 'border-accent bg-accent text-white' : 'border-line text-ink-2'" title="Limiter aux caméras du layout affiché" @click="ev.scopeLayout = !ev.scopeLayout; ev.persist()">Caméras du layout</button>
        <span class="whitespace-nowrap">
          <template v-if="ev.unseenCount">{{ ev.unseenCount }} non vu{{ ev.unseenCount > 1 ? 's' : '' }} · <button class="font-semibold text-accent" title="Tout marquer comme vu" @click="allSeen">Tout vu</button></template>
          <template v-else>Tout est vu</template>
        </span>
      </div>
    </div>

    <div ref="list" class="min-h-0 flex-1 overflow-y-auto p-1.5">
      <p v-if="!items.length" class="px-3 py-8 text-center text-[13px] leading-relaxed text-ink-3">
        {{ ev.search ? `Aucun résultat pour « ${ev.search} »` : 'Aucun événement' }}{{ ev.scopeLayout ? ' pour les caméras de ce layout' : '' }}.
        <template v-if="ev.scopeLayout"><br>Désactivez « Caméras du layout » pour tout voir.</template>
        <span v-if="ev.search" class="mt-2.5 block text-[11px] text-warn">Visages et plaques n'apparaissent que si la reconnaissance est activée dans Frigate.</span>
      </p>
      <template v-for="(e, i) in items" :key="e.id">
        <div v-if="i === 0 || dayKey(e.s) !== dayKey(items[i - 1].s)" class="px-2 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">{{ dayTitle(e.s) }}</div>
        <div role="button" tabindex="0" class="group relative mb-0.5 flex w-full gap-2.5 rounded-md border px-2 py-1.5 text-left"
          :class="[ev.activeId === e.id ? 'border-accent/35 bg-accent/15' : 'border-transparent hover:bg-raised', { 'animate-[pulse_1s_ease-out_2]': ev.fresh.includes(e.id) }]"
          title="Clic : relire · Double-clic : détails" @click="open(e)" @dblclick="ev.detailId = e.id" @keydown.enter="ev.detailId = e.id">
          <span class="relative h-10 w-16 shrink-0 overflow-hidden rounded border-l-[3px] bg-card" :style="{ borderColor: TYPE_COLORS[e.type] }">
            <img v-if="e.thumb" :src="e.thumb" class="size-full object-cover" alt="" loading="lazy" draggable="false">
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-px">
            <span class="flex items-center gap-1.5">
              <span v-if="!e.seen" class="size-[7px] shrink-0 rounded-full bg-accent" title="Non vu" />
              <span class="truncate text-[13px] font-semibold" :style="{ color: TYPE_COLORS[e.type] }">{{ TYPE_LABELS[e.type] }}</span>
              <span class="ml-auto shrink-0 font-mono text-xs text-ink-2">{{ hms(e.s) }}</span>
            </span>
            <span class="truncate text-xs text-ink-3">
              <span v-if="!e.e" class="mr-1 rounded-sm border border-bad/50 px-1 text-[10px] font-bold text-bad">EN COURS</span>
              <span v-for="l in e.subLabels" :key="l" class="mr-1 rounded-sm bg-raised px-1 text-[11px] text-ink">{{ l }}</span>
              {{ camName(e.cam) }}<template v-if="e.zones.length"> · {{ zone(e.zones[0]) }}</template> · {{ duration(e) }}
            </span>
          </span>
          <button class="absolute bottom-1 right-1.5 rounded border border-line-2 bg-modal px-1.5 text-[11px] opacity-0 hover:border-accent hover:bg-accent group-hover:opacity-100" @click.stop="ev.detailId = e.id">Détails</button>
        </div>
      </template>
    </div>
  </aside>
</template>
