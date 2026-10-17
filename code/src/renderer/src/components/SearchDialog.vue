<script setup>
// Recherche par description (recherche sémantique de Frigate) et « Trouver des similaires » (voir services/semantic.js)
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import { useLayoutStore } from '@/stores/layouts'
import { getJson, eventThumbUrl } from '@/services/frigate'
import { semanticEnabled, searchPath, similarPath, rankResults, SEARCH_TYPES } from '@/services/semantic'
import { fromEvent } from '@/stores/eventFilters'
import { playEvent } from '@/stores/playEvent'
import { TYPE_COLORS } from '@/stores/events'
import { t, loc } from '@/i18n'

const server = useServerStore()
const ui = useUiStore()
const layouts = useLayoutStore()
const srv = () => server.server

const state = ref('loading') // loading | ok | disabled | error
const errorText = ref('')
const query = ref('')
const type = ref(SEARCH_TYPES[0])
const scopeLayout = ref(false)
const similar = ref(null) // événement de départ { id, label, camera, start_time }
const results = ref([])
const searching = ref(false)
const searched = ref(false)
const input = ref(null)

const close = () => { ui.searchOpen = false; ui.searchSimilar = null }
const camName = (id) => server.camById(id)?.name || id
const objLabel = (o) => { const k = 'labels.' + o, v = t(k); return v === k ? String(o).replace(/_/g, ' ') : v }
const when = (ms) => new Date(ms).toLocaleString(loc(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const cards = computed(() => results.value.map(({ ev, score }) => ({ e: fromEvent(ev, eventThumbUrl(srv(), ev.id)), raw: ev, score, source: ev.search_source })))

async function init() {
  state.value = 'loading'
  try {
    if (!semanticEnabled(await getJson(srv(), '/api/config'))) { state.value = 'disabled'; return }
    state.value = 'ok'
    if (ui.searchSimilar) findSimilar(ui.searchSimilar)
    else { await nextTick(); input.value?.focus() }
  } catch (e) { state.value = 'error'; errorText.value = e.message }
}
onMounted(init)

async function run(path, opts) {
  if (!path) return
  const token = (run.n = (run.n || 0) + 1)
  searching.value = true
  try {
    const list = await getJson(srv(), path, { timeout: 30000 }) // le calcul peut être long sur un petit serveur
    if (token !== run.n) return
    results.value = rankResults(list, opts)
    searched.value = true
  } catch (e) {
    if (token !== run.n) return
    // 400 « Semantic search is not enabled » : configuration changée depuis l'ouverture
    if (e.status === 400 && !similar.value) { state.value = 'disabled'; return }
    results.value = []; searched.value = true; errorText.value = e.message
  } finally { if (token === run.n) searching.value = false }
}
const cams = () => (scopeLayout.value ? layouts.cams.filter(Boolean) : [])
function search() { similar.value = null; errorText.value = ''; run(searchPath({ query: query.value, type: type.value, cameras: cams() }), {}) }
async function findSimilar(src) {
  // src : identifiant d'objet suivi (depuis le détail d'un événement) ou événement Frigate
  if (typeof src === 'string') { try { src = await getJson(srv(), `/api/events/${encodeURIComponent(src)}`) } catch { src = { id: src } } }
  similar.value = src; errorText.value = ''
  run(similarPath(src.id, { cameras: cams() }), { similarity: true, exclude: src.id })
}
function backToText() { similar.value = null; ui.searchSimilar = null; results.value = []; searched.value = false; if (query.value.trim()) search() }
function replay(c) { playEvent(c.e); close() }

const onKey = (e) => { if (e.key === 'Escape' && !e.target.matches?.('input, select')) close() }
onMounted(() => addEventListener('keydown', onKey))
onBeforeUnmount(() => removeEventListener('keydown', onKey))
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/55" @mousedown.self="close">
    <div class="flex h-[calc(100vh-40px)] w-[min(1200px,calc(100vw-40px))] flex-col overflow-hidden rounded-xl border border-line-2 bg-modal shadow-2xl" role="dialog" aria-modal="true">
      <header class="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
        <h2 class="text-[15px] font-bold">{{ $t('search.title') }}</h2>
        <button class="ml-auto flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-bad/15 hover:text-bad" :title="$t('common.closeEsc')" :aria-label="$t('common.close')" @click="close">
          <svg width="13" height="13" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.7" /></svg>
        </button>
      </header>

      <div v-if="state === 'loading'" class="flex flex-1 items-center justify-center gap-3 text-ink-2"><span class="spin" /> {{ $t('search.loading') }}</div>
      <div v-else-if="state === 'disabled' || state === 'error'" class="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" class="text-ink-3"><circle cx="10" cy="10" r="6.5" /><path d="M15 15l6 6M7.5 10h5M10 7.5v5" /></svg>
        <h3 class="text-[15px] font-bold">{{ state === 'disabled' ? $t('search.disabledTitle') : $t('search.errorTitle') }}</h3>
        <template v-if="state === 'disabled'">
          <p class="max-w-[560px] text-[13px] text-ink-2">{{ $t('search.disabledText') }}</p>
          <p class="max-w-[560px] text-[13px] text-warn">{{ $t('search.disabledHardware') }}</p>
          <code class="rounded-md border border-line bg-bg px-3 py-2 text-left font-mono text-xs text-ink-2">semantic_search:<br>&nbsp;&nbsp;enabled: true<br>&nbsp;&nbsp;model_size: small</code>
        </template>
        <p v-else class="max-w-[520px] text-[13px] text-ink-2">{{ errorText }}</p>
        <button class="btn mt-2" @click="init">{{ $t('search.retry') }}</button>
      </div>

      <template v-else>
        <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <template v-if="similar">
            <img :src="eventThumbUrl(srv(), similar.id)" alt="" class="h-9 w-14 rounded-md bg-raised object-cover">
            <span class="text-[13px]"><b>{{ $t('search.similarTo') }}</b> <span class="text-ink-2">{{ [similar.label && objLabel(similar.label), similar.camera && camName(similar.camera), similar.start_time && when(similar.start_time * 1000)].filter(Boolean).join(' · ') }}</span></span>
            <button class="btn ml-auto px-3 py-1 text-xs" @click="backToText">{{ $t('search.backToText') }}</button>
          </template>
          <template v-else>
            <div class="relative min-w-[260px] flex-1">
              <svg class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="5" /><line x1="11" y1="11" x2="15" y2="15" /></svg>
              <input ref="input" v-model="query" type="search" class="input !pl-8" :placeholder="$t('search.placeholder')" :aria-label="$t('search.title')" @keydown.enter="search" @keydown.esc.stop="query = ''">
            </div>
            <select v-model="type" class="input !w-auto py-1 text-xs" :title="$t('search.typeTitle')">
              <option v-for="k in SEARCH_TYPES" :key="k" :value="k">{{ $t('search.type.' + k.replace(',', '_')) }}</option>
            </select>
            <button class="btn btn-primary px-4 py-1.5 text-xs" :disabled="!query.trim() || searching" @click="search">{{ $t('search.go') }}</button>
          </template>
          <button class="rounded-full border px-2 py-0.5 text-[11px]" :class="scopeLayout ? 'border-accent bg-accent text-white' : 'border-line text-ink-2'" :title="$t('events.scopeTitle')"
            @click="scopeLayout = !scopeLayout; similar ? findSimilar(similar) : query.trim() && search()">{{ $t('events.scope') }}</button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <div v-if="searching" class="flex items-center justify-center gap-3 py-16 text-ink-2"><span class="spin" /> {{ $t('search.searching') }}</div>
          <div v-else-if="!searched" class="mx-auto max-w-[560px] py-14 text-center text-[13px] leading-relaxed text-ink-3">
            <p>{{ $t('search.intro') }}</p>
            <p class="mt-2">{{ $t('search.examples') }}</p>
          </div>
          <p v-else-if="!cards.length" class="py-16 text-center text-[13px] text-ink-3">{{ errorText || $t('search.none') }}</p>
          <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
            <div v-for="c in cards" :key="c.e.id" role="button" tabindex="0" class="group relative overflow-hidden rounded-lg border border-line bg-panel text-left hover:border-accent"
              :title="$t('search.replay')" @click="replay(c)" @keydown.enter="replay(c)">
              <div class="relative">
                <img :src="c.e.thumb" alt="" loading="lazy" class="aspect-video w-full bg-raised object-cover" draggable="false">
                <span v-if="c.score != null" class="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 text-[11px] font-semibold text-white" :title="$t('search.scoreTitle', { source: $t('search.source.' + (c.source || 'thumbnail')) })">{{ c.score }} %</span>
                <button class="absolute right-1.5 top-1.5 rounded border border-line-2 bg-modal px-1.5 text-[11px] opacity-0 hover:border-accent hover:bg-accent group-hover:opacity-100" @click.stop="findSimilar(c.raw)">{{ $t('search.similar') }}</button>
              </div>
              <span class="block px-2 py-1.5 text-[11px] leading-tight">
                <span class="flex items-center gap-1"><b class="truncate" :style="{ color: TYPE_COLORS[c.e.type] }">{{ objLabel(c.raw.label) }}</b><span v-for="l in c.e.subLabels" :key="l" class="truncate rounded-sm bg-raised px-1 text-ink">{{ l }}</span></span>
                <span class="block truncate text-ink-3">{{ camName(c.e.cam) }} · {{ when(c.e.s) }}</span>
                <span v-if="c.raw.data?.description" class="mt-0.5 line-clamp-2 block text-ink-2">{{ c.raw.data.description }}</span>
              </span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
