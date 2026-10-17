<script setup>
// Galerie des plaques : plaques vues récemment (agrégées depuis les événements), passages d'une plaque, plaques connues.
// Plaques connues en lecture seule (voir services/plates.js).
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import { getJson, eventThumbUrl } from '@/services/frigate'
import { lprEnabled, knownPlates, aggregatePlates, filterPlates, getPlateEvents } from '@/services/plates'
import { fromEvent } from '@/stores/eventFilters'
import { playEvent } from '@/stores/playEvent'
import { t, loc } from '@/i18n'

const server = useServerStore()
const ui = useUiStore()
const srv = () => server.server

const state = ref('loading') // loading | ok | disabled | error
const errorText = ref('')
const known = ref([])
const plates = ref([])
const current = ref(null) // plaque sélectionnée, null = plaques connues
const query = ref('')

const close = () => (ui.platesOpen = false)
const camName = (id) => server.camById(id)?.name || id
const shown = computed(() => filterPlates(plates.value, query.value, camName))
const plate = computed(() => plates.value.find((p) => p.plate === current.value) || null)
const passages = computed(() => (plate.value?.events || []).map((r) => fromEvent(r, eventThumbUrl(srv(), r.id))))

async function load() {
  try {
    const config = await getJson(srv(), '/api/config')
    if (!lprEnabled(config)) { state.value = 'disabled'; return }
    known.value = knownPlates(config)
    const list = await getPlateEvents(srv(), { after: Date.now() / 1000 - 30 * 86400 })
    plates.value = aggregatePlates(Array.isArray(list) ? list : [], known.value)
    if (current.value && !plate.value) current.value = null
    state.value = 'ok'
  } catch (e) {
    state.value = 'error'; errorText.value = e.message
  }
}
onMounted(load)

function replay(e) { playEvent(e); close() }
const when = (ms) => (ms ? new Date(ms).toLocaleString(loc(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
const seenFor = (name) => plates.value.filter((p) => p.name === name)

const onKey = (e) => { if (e.key === 'Escape' && !e.target.matches?.('input, select')) close() }
onMounted(() => addEventListener('keydown', onKey))
onBeforeUnmount(() => removeEventListener('keydown', onKey))
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/55" @mousedown.self="close">
    <div class="flex h-[calc(100vh-40px)] w-[min(1200px,calc(100vw-40px))] flex-col overflow-hidden rounded-xl border border-line-2 bg-modal shadow-2xl" role="dialog" aria-modal="true">
      <header class="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
        <h2 class="text-[15px] font-bold">{{ $t('plates.title') }}</h2>
        <button class="ml-auto flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-raised hover:text-ink" :title="$t('plates.reload')" @click="load">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3h-3" /></svg>
        </button>
        <button class="flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-bad/15 hover:text-bad" :title="$t('common.closeEsc')" @click="close">
          <svg width="13" height="13" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.7" /></svg>
        </button>
      </header>

      <div v-if="state === 'loading'" class="flex flex-1 items-center justify-center gap-3 text-ink-2"><span class="spin" /> {{ $t('plates.loading') }}</div>
      <div v-else-if="state === 'disabled' || state === 'error'" class="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" class="text-ink-3"><rect x="2" y="7" width="20" height="10" rx="2" /><path d="M6 12h2M10 12h4M16 12h2" /></svg>
        <h3 class="text-[15px] font-bold">{{ state === 'disabled' ? $t('plates.disabledTitle') : $t('plates.errorTitle') }}</h3>
        <p class="max-w-[520px] text-[13px] text-ink-2">{{ state === 'disabled' ? $t('plates.disabledText') : errorText }}</p>
        <code v-if="state === 'disabled'" class="rounded-md border border-line bg-bg px-3 py-2 text-left font-mono text-xs text-ink-2">lpr:<br>&nbsp;&nbsp;enabled: true</code>
        <button class="btn mt-2" @click="state = 'loading'; load()">{{ $t('plates.retry') }}</button>
      </div>

      <div v-else class="flex min-h-0 flex-1">
        <!-- Colonne gauche : plaques connues puis plaques vues -->
        <aside class="flex w-72 shrink-0 flex-col border-r border-line bg-panel">
          <div class="border-b border-line p-2">
            <input v-model="query" class="input py-1" :placeholder="$t('plates.filter')" @keydown.esc.stop="query = ''">
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto p-2">
            <button class="mb-2 flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px]" :class="current === null ? 'bg-accent/15 text-accent' : 'text-ink-2 hover:bg-raised'" @click="current = null">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-raised">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" /></svg>
              </span>
              <span class="min-w-0 flex-1"><span class="block truncate font-semibold">{{ $t('plates.known') }}</span><span class="block text-[11px] text-ink-3">{{ $t('plates.names', { n: known.length }, known.length) }}</span></span>
            </button>
            <div class="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-ink-3">{{ $t('plates.recent') }}</div>
            <p v-if="!shown.length" class="px-2 py-2 text-xs text-ink-3">{{ query ? $t('plates.noMatch') : $t('plates.noPlates') }}</p>
            <button v-for="p in shown" :key="p.plate" class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px]" :class="current === p.plate ? 'bg-accent/15 text-accent' : 'text-ink-2 hover:bg-raised'" @click="current = p.plate">
              <img :src="eventThumbUrl(srv(), p.lastEvent.id)" alt="" loading="lazy" class="h-9 w-14 shrink-0 rounded-md bg-raised object-cover" draggable="false">
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5"><b class="truncate font-mono">{{ p.plate }}</b><span v-if="p.name" class="truncate rounded bg-ok/15 px-1 text-[10px] text-ok">{{ p.name }}</span></span>
                <span class="block truncate text-[11px] text-ink-3">{{ when(p.last) }} · {{ $t('plates.passages', { n: p.count }, p.count) }}</span>
              </span>
            </button>
          </div>
        </aside>

        <!-- Partie droite -->
        <section class="flex min-w-0 flex-1 flex-col">
          <div class="flex min-h-[52px] shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-[13px]">
            <template v-if="plate">
              <b class="rounded border border-line-2 bg-bg px-2 py-0.5 font-mono text-[15px] tracking-wider">{{ plate.plate }}</b>
              <span v-if="plate.name" class="rounded bg-ok/15 px-1.5 py-0.5 text-xs text-ok">{{ plate.name }}</span>
              <span class="text-xs text-ink-3">{{ $t('plates.passages', { n: plate.count }, plate.count) }} · {{ plate.cams.map(camName).join(', ') }}</span>
            </template>
            <template v-else>
              <b class="text-[14px]">{{ $t('plates.known') }}</b>
              <span class="text-xs text-ink-3">{{ $t('plates.readOnlyHint') }}</span>
            </template>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-4">
            <template v-if="plate">
              <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                <button v-for="e in passages" :key="e.id" class="overflow-hidden rounded-lg border border-line bg-panel text-left hover:border-accent" :title="$t('plates.replay')" @click="replay(e)">
                  <img :src="e.thumb" alt="" loading="lazy" class="aspect-video w-full bg-raised object-cover" draggable="false">
                  <span class="block px-2 py-1.5 text-[11px] leading-tight"><b class="block truncate">{{ camName(e.cam) }}</b><span class="text-ink-3">{{ when(e.s) }}</span></span>
                </button>
              </div>
            </template>
            <template v-else>
              <p v-if="!known.length" class="py-16 text-center text-[13px] text-ink-3">{{ $t('plates.noKnown') }}</p>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                <div v-for="k in known" :key="k.name" class="rounded-lg border border-line bg-panel p-3">
                  <b class="block truncate text-[13px]">{{ k.name }}</b>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <code v-for="p in k.plates" :key="p" class="rounded border border-line-2 bg-bg px-1.5 py-0.5 font-mono text-xs">{{ p }}</code>
                  </div>
                  <div class="mt-2 flex flex-wrap gap-1.5 text-[11px] text-ink-3">
                    <template v-if="seenFor(k.name).length">
                      <button v-for="s in seenFor(k.name)" :key="s.plate" class="rounded px-1 hover:bg-raised hover:text-ink" @click="current = s.plate">{{ s.plate }} · {{ when(s.last) }}</button>
                    </template>
                    <span v-else>{{ $t('plates.notSeen') }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
