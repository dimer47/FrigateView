<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useTimelineStore, MIN, HOUR, DAY } from '@/stores/timeline'
import { useLayoutStore } from '@/stores/layouts'
import { useServerStore } from '@/stores/server'

const tl = useTimelineStore()
const layouts = useLayoutStore()
const server = useServerStore()

const ruler = ref(null)
const body = ref(null)
const now = ref(Date.now())
const rulerWidth = ref(800)
const hover = ref(null) // { pct, t }
const pop = ref(null) // filter | cal
const calValue = ref('')

const pad = (n) => String(n).padStart(2, '0')
const hms = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
const hm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const pct = (t) => ((t - tl.view.start) / (tl.view.end - tl.view.start)) * 100
const spanLabel = computed(() => { const ms = tl.view.end - tl.view.start; return ms >= HOUR ? `${String(Math.round((ms / HOUR) * 10) / 10).replace('.', ',')} h` : `${Math.round(ms / MIN)} min` })

const cams = computed(() => layouts.cams)
const selectedCam = computed(() => layouts.active?.cells[layouts.selected])
const cursorTime = computed(() => (tl.live ? now.value : tl.time))

/* ---------- Règle graduée ---------- */
const ticks = computed(() => {
  now.value // recalcul régulier
  const span = tl.view.end - tl.view.start, w = rulerWidth.value
  const steps = [MIN, 2 * MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR]
  const step = steps.find((s) => (s / span) * w >= 70) || 12 * HOUR
  const tz = new Date().getTimezoneOffset() * MIN
  const out = []
  for (let t = Math.ceil((tl.view.start - tz) / step) * step + tz; t < tl.view.end; t += step) {
    const d = new Date(t), midnight = d.getHours() === 0 && d.getMinutes() === 0
    out.push({ t, left: pct(t), midnight, major: d.getMinutes() === 0 && (step < HOUR || d.getHours() % 6 === 0), label: midnight ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : hm(t) })
  }
  return out
})

/* ---------- Pistes ---------- */
const bar = (s, e) => { const l = Math.max(pct(s), 0); return { left: l + '%', width: Math.max(Math.min(pct(e), 100) - l, 0.15) + '%' } }
const rows = computed(() => {
  now.value
  return cams.value.map((id) => {
    const d = tl.rangesFor(id), vs = tl.view.start, ve = tl.view.end
    const inView = (r) => r.e > vs && r.s < ve
    return {
      id,
      name: server.camById(id)?.name || id,
      offline: server.online[id] === false,
      rec: d.rec.filter(inView).map((r) => bar(r.s, Math.min(r.e, now.value))),
      motion: tl.filters.motion ? d.motion.filter(inView).map((r) => bar(r.s, r.e)) : [],
      reviews: d.reviews.filter((r) => inView(r) && tl.filters[r.type]).map((r) => ({ ...bar(r.s, r.e), type: r.type }))
    }
  })
})

/* ---------- Souris : clic = relire, glisser = déplacer, molette = zoom ---------- */
let drag = null
const timeAt = (clientX) => { const r = ruler.value.getBoundingClientRect(); return tl.view.start + ((clientX - r.left) / r.width) * (tl.view.end - tl.view.start) }
function onDown(e) {
  if (e.button !== 0 || !e.target.closest('[data-track]')) return
  drag = { x: e.clientX, start: tl.view.start, end: tl.view.end, moved: false, cam: e.target.closest('[data-cam]')?.dataset.cam }
}
function onMove(e) {
  if (drag) {
    const dx = e.clientX - drag.x
    if (Math.abs(dx) > 4) drag.moved = true
    if (drag.moved) {
      const dt = (dx / ruler.value.clientWidth) * (drag.end - drag.start)
      tl.view.start = drag.start - dt; tl.view.end = drag.end - dt
      hover.value = null
      return
    }
  }
  if (!e.target.closest?.('[data-track]') || !ruler.value) { hover.value = null; return }
  const t = timeAt(e.clientX)
  hover.value = { pct: pct(t), t }
}
function onUp(e) {
  if (!drag) return
  const d = drag
  drag = null
  if (d.moved) return
  if (d.cam) { const i = layouts.active.cells.indexOf(d.cam); if (i >= 0) layouts.selected = i }
  tl.seek(timeAt(e.clientX), d.cam || null)
}
function onWheel(e) {
  if (!e.target.closest('[data-track]')) return
  e.preventDefault()
  if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { tl.pan(((e.deltaX || e.deltaY) / ruler.value.clientWidth) * (tl.view.end - tl.view.start)); return }
  tl.zoom(e.deltaY > 0 ? 1.25 : 0.8, timeAt(e.clientX))
}
function selectCam(id) { const i = layouts.active.cells.indexOf(id); if (i >= 0) layouts.selected = i }

/* ---------- Aller à une date ---------- */
function openCal() {
  const d = new Date(cursorTime.value - new Date().getTimezoneOffset() * MIN)
  calValue.value = d.toISOString().slice(0, 19)
  pop.value = pop.value === 'cal' ? null : 'cal'
}
function applyCal() { const t = new Date(calValue.value).getTime(); if (!isNaN(t)) tl.seek(t, null, true); pop.value = null }
function jumpAgo(m) { tl.seek(Date.now() - m * MIN, null, true); pop.value = null }
const calMin = computed(() => new Date(Date.now() - 2 * DAY - new Date().getTimezoneOffset() * MIN).toISOString().slice(0, 16))

/* ---------- Redimensionnement ---------- */
function startResize(e) {
  const y = e.clientY, h = tl.height
  const move = (ev) => { tl.height = Math.max(140, Math.min(480, h + y - ev.clientY)) }
  const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); tl.persist() }
  addEventListener('mousemove', move); addEventListener('mouseup', up)
}

/* ---------- Boucles ---------- */
let last = Date.now(), loop, dataLoop, ro
function loadData() { if (server.server && server.status === 'ok' && cams.value.length) tl.ensureData(server.server, cams.value) }
let dataDebounce
watch(() => [tl.view.start, tl.view.end, cams.value.join()], () => { clearTimeout(dataDebounce); dataDebounce = setTimeout(loadData, 250) })
onMounted(() => {
  loop = setInterval(() => { const t = Date.now(); tl.tick(t - last); last = t; now.value = t }, 200)
  dataLoop = setInterval(loadData, 30e3)
  loadData()
  ro = new ResizeObserver(() => { rulerWidth.value = ruler.value?.clientWidth || 800 })
  ro.observe(ruler.value)
  addEventListener('mousemove', onMove)
  addEventListener('mouseup', onUp)
})
onBeforeUnmount(() => { clearInterval(loop); clearInterval(dataLoop); ro?.disconnect(); removeEventListener('mousemove', onMove); removeEventListener('mouseup', onUp) })

const COLORS = { person: 'var(--color-bad)', car: 'var(--color-warn)', animal: 'var(--color-ok)', other: '#a78bfa' }
const LABELS = { person: 'Personne', car: 'Véhicule', animal: 'Animal', other: 'Autre objet', motion: 'Mouvement' }
</script>

<template>
  <section class="relative flex shrink-0 flex-col border-t border-[#1e2a3a] bg-[#0c1018]" :style="{ height: tl.height + 'px' }">
    <div class="absolute inset-x-0 -top-[3px] z-10 h-[6px] cursor-row-resize hover:bg-accent" title="Glisser pour redimensionner" @mousedown.prevent="startResize" />

    <!-- En-tête -->
    <div class="flex h-11 shrink-0 items-center gap-1 border-b border-[#1e2a3a] px-3">
      <span class="min-w-[98px] font-mono text-xl font-bold" :class="tl.live ? 'text-ok' : 'text-warn'">{{ hms(cursorTime) }}</span>
      <span class="mr-2 whitespace-nowrap text-[13px] text-ink-2">{{ new Date(cursorTime).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) }}</span>
      <button class="tbtn !size-[30px]" title="Zoom avant (molette)" @click="tl.zoom(0.5)"><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5" /><line x1="11" y1="11" x2="14" y2="14" /><line x1="5" y1="7" x2="9" y2="7" /><line x1="7" y1="5" x2="7" y2="9" /></svg></button>
      <span class="min-w-[44px] text-center text-xs text-ink-3" title="Durée affichée">{{ spanLabel }}</span>
      <button class="tbtn !size-[30px]" title="Zoom arrière (molette)" @click="tl.zoom(2)"><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5" /><line x1="11" y1="11" x2="14" y2="14" /><line x1="5" y1="7" x2="9" y2="7" /></svg></button>
      <div class="relative">
        <button class="tbtn !size-[30px]" :class="{ on: pop === 'filter' }" title="Types affichés" @click="pop = pop === 'filter' ? null : 'filter'">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="1,2 15,2 9,8 9,13 7,14 7,8" /></svg>
          <span v-if="Object.values(tl.filters).some((v) => !v)" class="absolute right-1 top-1 size-1.5 rounded-full bg-accent" />
        </button>
        <div v-if="pop === 'filter'" class="absolute bottom-9 left-0 z-50 w-52 rounded-lg border border-line-2 bg-modal p-3 shadow-xl">
          <div class="mb-2 text-xs font-bold">Afficher sur la timeline</div>
          <label v-for="(l, k) in LABELS" :key="k" class="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[13px] text-ink-2 hover:bg-raised">
            <input v-model="tl.filters[k]" type="checkbox" class="accent-accent"><span class="h-1.5 w-3 rounded-sm" :style="{ background: k === 'motion' ? 'var(--color-motion)' : COLORS[k] }" />{{ l }}
          </label>
        </div>
      </div>
      <div class="relative">
        <button class="tbtn !size-[30px]" :class="{ on: pop === 'cal' }" title="Aller à une date / heure" @click="openCal">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="3" width="14" height="12" rx="1" /><line x1="1" y1="7" x2="15" y2="7" /><line x1="4" y1="1" x2="4" y2="5" /><line x1="12" y1="1" x2="12" y2="5" /></svg>
        </button>
        <div v-if="pop === 'cal'" class="absolute bottom-9 left-0 z-50 w-64 rounded-lg border border-line-2 bg-modal p-3 shadow-xl">
          <div class="mb-2 text-xs font-bold">Aller à</div>
          <div class="mb-2.5 flex flex-wrap gap-1">
            <button v-for="[m, l] in [[15, '−15 min'], [60, '−1 h'], [360, '−6 h'], [1440, 'Hier même heure']]" :key="m" class="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2 hover:border-accent" @click="jumpAgo(m)">{{ l }}</button>
          </div>
          <input v-model="calValue" type="datetime-local" step="1" :min="calMin" class="input [color-scheme:dark]">
          <div class="mt-3 flex justify-end gap-2"><button class="btn" @click="pop = null">Annuler</button><button class="btn btn-primary" @click="applyCal">Aller</button></div>
        </div>
      </div>
      <span v-if="!tl.live" class="mx-2.5 whitespace-nowrap text-xs text-ink-3"><b class="text-warn">Relecture</b> · {{ tl.playbackCams ? tl.playbackCams.map((c) => server.camById(c)?.name).join(', ') : 'toutes les caméras du layout' }}</span>
      <span v-if="tl.loading" class="spin ml-1" title="Chargement des enregistrements" />
      <span class="flex-1" />
      <button class="ml-1.5 flex items-center gap-1.5 rounded-[5px] border px-3 py-1 text-[13px] font-bold" :class="tl.live ? 'border-ok/40 bg-ok/10 text-ok' : 'border-line text-ink hover:border-line-2'" :title="tl.live ? 'En direct' : 'Revenir au direct (L)'" @click="tl.goLive()"><i class="size-[7px] rounded-full bg-current" /> LIVE</button>
      <button class="ml-1.5 flex items-center gap-1.5 rounded-[5px] border px-3 py-1 text-[13px] font-bold" :class="tl.sync ? 'border-accent/35 bg-accent/15 text-accent' : 'border-line text-ink-3 hover:text-ink'" title="Synchronisé : toutes les caméras relisent le même instant. Désactivé : seule la caméra cliquée passe en relecture." @click="tl.toggleSync()"><i class="size-[7px] rounded-full bg-current" /> Sync</button>
    </div>

    <div class="flex min-h-0 flex-1">
      <!-- Pistes -->
      <div ref="body" class="relative flex min-w-0 flex-1 flex-col" @mousedown="onDown" @wheel="onWheel" @mouseleave="hover = null">
        <div class="flex h-6 shrink-0 overflow-hidden border-b border-[#1e2a3a] [scrollbar-gutter:stable]">
          <div class="flex w-[120px] shrink-0 items-center border-r border-[#1e2a3a] px-2.5 text-[11px] text-ink-3">{{ cams.length }} caméra{{ cams.length > 1 ? 's' : '' }}</div>
          <div ref="ruler" data-track class="relative flex-1 cursor-pointer overflow-hidden">
            <span v-for="k in ticks" :key="k.t" class="pointer-events-none absolute top-[3px] -translate-x-1/2 whitespace-nowrap text-[11px] after:mx-auto after:mt-px after:block after:w-px after:bg-[#2f3d50]"
              :class="[k.major ? 'font-semibold text-ink-2 after:h-[9px]' : 'text-[#7b8494] after:h-1.5', { '!text-warn': k.midnight }]" :style="{ left: k.left + '%' }">{{ k.label }}</span>
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <p v-if="!cams.length" class="p-5 text-center text-[13px] text-ink-3">Aucune caméra dans ce layout.</p>
          <div v-for="r in rows" :key="r.id" class="group flex h-[26px] border-b border-[#121a26]" :data-cam="r.id">
            <button class="flex w-[120px] shrink-0 items-center gap-1.5 truncate border-l-2 border-r border-r-[#1e2a3a] px-2.5 text-left text-xs"
              :class="r.id === selectedCam ? 'border-l-accent bg-accent/5 font-semibold text-accent' : 'border-l-transparent text-ink-2 hover:text-ink'" @click="selectCam(r.id)">
              <span class="size-1.5 shrink-0 rounded-full" :class="r.offline ? 'bg-bad' : 'bg-ok'" /><span class="truncate">{{ r.name }}</span>
            </button>
            <div data-track class="relative flex-1 cursor-crosshair overflow-hidden group-hover:bg-white/[.025]" :class="{ 'bg-accent/5': r.id === selectedCam }">
              <div v-for="(b, i) in r.rec" :key="'r' + i" class="pointer-events-none absolute top-[18px] h-1 bg-[#1e3a5f]" :style="b" />
              <div v-for="(b, i) in r.motion" :key="'m' + i" class="pointer-events-none absolute top-[5px] h-3 rounded-sm bg-motion opacity-55" :style="b" />
              <div v-for="(b, i) in r.reviews" :key="'v' + i" class="pointer-events-none absolute top-[5px] h-3 min-w-[2px] rounded-sm" :style="{ left: b.left, width: b.width, background: COLORS[b.type] }" />
            </div>
          </div>
        </div>
        <!-- Curseurs -->
        <div class="pointer-events-none absolute bottom-0 left-[120px] right-2 top-0 overflow-hidden">
          <div class="absolute inset-y-0 w-px bg-ok/50" :style="{ left: pct(now) + '%' }" />
          <div v-show="pct(cursorTime) >= 0 && pct(cursorTime) <= 100" class="absolute inset-y-0 -ml-px w-0.5" :class="tl.live ? 'bg-ok' : 'bg-warn'" :style="{ left: pct(cursorTime) + '%' }" />
          <div v-if="hover" class="absolute inset-y-0 w-px bg-white/45" :style="{ left: hover.pct + '%' }">
            <span class="absolute left-1 top-[3px] whitespace-nowrap rounded bg-black/80 px-1.5 font-mono text-[11px]">{{ hover.t > now ? 'futur' : hms(hover.t) }}</span>
          </div>
        </div>
      </div>

      <!-- Commandes -->
      <div class="flex w-[190px] shrink-0 flex-col items-center justify-center gap-3 border-l border-[#1e2a3a] bg-[#0f1520] p-3">
        <div class="flex items-center">
          <button class="h-[30px] w-[30px] rounded-l-[5px] border border-[#2a3a4e] bg-[#1a2432] text-base font-bold text-ink-2 hover:text-ink disabled:opacity-35" :disabled="tl.live || tl.speedIdx === 0" title="Ralentir" @click="tl.setSpeed(-1)">−</button>
          <span class="flex h-[30px] min-w-12 items-center justify-center border-y border-[#2a3a4e] bg-[#1a2432] text-sm font-bold">{{ tl.speed }}x</span>
          <button class="h-[30px] w-[30px] rounded-r-[5px] border border-[#2a3a4e] bg-[#1a2432] text-base font-bold text-ink-2 hover:text-ink disabled:opacity-35" :disabled="tl.live || tl.speedIdx === tl.speeds.length - 1" title="Accélérer" @click="tl.setSpeed(1)">+</button>
        </div>
        <div class="flex items-center gap-0.5">
          <button class="tbtn !size-[30px] text-xs font-bold" title="Reculer 30 s (Maj+←)" @click="tl.skip(-30)">«30</button>
          <button class="tbtn !size-[30px] text-xs font-bold" title="Reculer 10 s (←)" @click="tl.skip(-10)">«10</button>
          <button class="flex size-[38px] items-center justify-center rounded-full border border-[#2a3a4e] bg-[#1a2432] hover:border-accent hover:bg-accent" :title="tl.live || tl.playing ? 'Pause (Espace)' : 'Lecture (Espace)'" @click="tl.togglePlay()">
            <svg v-if="tl.live || tl.playing" width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.5" height="12" rx="1" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" /></svg>
            <svg v-else width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1.5v11l9.5-5.5z" /></svg>
          </button>
          <button class="tbtn !size-[30px] text-xs font-bold disabled:opacity-30" :disabled="tl.live" title="Avancer 10 s (→)" @click="tl.skip(10)">10»</button>
          <button class="tbtn !size-[30px] text-xs font-bold disabled:opacity-30" :disabled="tl.live" title="Avancer 30 s (Maj+→)" @click="tl.skip(30)">30»</button>
        </div>
        <div class="text-center text-[11px] text-ink-3">{{ tl.live ? 'Direct · cliquez sur la timeline pour relire' : tl.playing ? 'Relecture en cours' : 'Relecture en pause' }}</div>
      </div>
    </div>

    <!-- Légende -->
    <div class="flex h-6 shrink-0 items-center gap-4 overflow-hidden border-t border-[#1e2a3a] px-3 text-[11px] text-ink-3">
      <span v-for="(c, k) in COLORS" :key="k" class="flex items-center gap-1.5 whitespace-nowrap"><span class="h-1.5 w-3 rounded-sm" :style="{ background: c }" />{{ LABELS[k] }}</span>
      <span class="flex items-center gap-1.5"><span class="h-1.5 w-3 rounded-sm bg-motion opacity-55" />Mouvement</span>
      <span class="flex items-center gap-1.5"><span class="h-1 w-3 bg-[#1e3a5f]" />Enregistrement</span>
      <span class="ml-auto whitespace-nowrap">Clic : relire · Glisser : déplacer · Molette : zoom</span>
    </div>
  </section>
</template>
