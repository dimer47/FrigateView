<script setup>
// Visages en lecture seule (compte non admin) : personnes reconnues ces 30 derniers jours, d'après les événements.
// Même présentation que la galerie des plaques. Voir services/faces.js (getPeopleEvents).
import { ref, computed, onMounted } from 'vue'
import { useServerStore } from '@/stores/server'
import { eventThumbUrl } from '@/services/frigate'
import { aggregatePeople, getPeopleEvents } from '@/services/faces'
import { fromEvent } from '@/stores/eventFilters'
import WatchBell from './WatchBell.vue'
import { loc } from '@/i18n'

const emit = defineEmits(['replay'])
const server = useServerStore()
const srv = () => server.server

const state = ref('loading') // loading | ok | error
const errorText = ref('')
const people = ref([])
const current = ref(null)
const query = ref('')

const camName = (id) => server.camById(id)?.name || id
const shown = computed(() => { const q = query.value.trim().toLowerCase(); return q ? people.value.filter((p) => p.name.toLowerCase().includes(q) || p.cams.some((c) => camName(c).toLowerCase().includes(q))) : people.value })
const person = computed(() => people.value.find((p) => p.name === current.value) || null)
const passages = computed(() => (person.value?.events || []).map((r) => fromEvent(r, eventThumbUrl(srv(), r.id))))
const when = (ms) => (ms ? new Date(ms).toLocaleString(loc(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

async function load() {
  state.value = 'loading'
  try {
    people.value = aggregatePeople(await getPeopleEvents(srv(), { after: Date.now() / 1000 - 30 * 86400 }))
    if (!person.value) current.value = people.value[0]?.name || null
    state.value = 'ok'
  } catch (e) { state.value = 'error'; errorText.value = e.message }
}
onMounted(load)
defineExpose({ load })
</script>

<template>
  <div v-if="state === 'loading'" class="flex flex-1 items-center justify-center gap-3 text-ink-2"><span class="spin" /> {{ $t('faces.loading') }}</div>
  <div v-else-if="state === 'error'" class="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
    <h3 class="text-[15px] font-bold">{{ $t('faces.errorTitle') }}</h3>
    <p class="max-w-[520px] text-[13px] text-ink-2">{{ errorText }}</p>
    <button class="btn mt-2" @click="load">{{ $t('faces.retry') }}</button>
  </div>
  <div v-else class="flex min-h-0 flex-1">
    <aside class="flex w-72 shrink-0 flex-col border-r border-line bg-panel">
      <div class="border-b border-line p-2">
        <input v-model="query" class="input py-1" :placeholder="$t('faces.seenFilter')" @keydown.esc.stop="query = ''">
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <div class="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-ink-3">{{ $t('faces.seenRecent') }}</div>
        <p v-if="!shown.length" class="px-2 py-2 text-xs text-ink-3">{{ query ? $t('faces.seenNoMatch') : $t('faces.seenNone') }}</p>
        <button v-for="p in shown" :key="p.name" class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px]" :class="current === p.name ? 'bg-accent/15 text-accent' : 'text-ink-2 hover:bg-raised'" @click="current = p.name">
          <img :src="eventThumbUrl(srv(), p.lastEvent.id)" alt="" loading="lazy" class="h-9 w-14 shrink-0 rounded-md bg-raised object-cover" draggable="false">
          <span class="min-w-0 flex-1">
            <b class="block truncate">{{ p.name }}</b>
            <span class="block truncate text-[11px] text-ink-3">{{ when(p.last) }} · {{ $t('plates.passages', { n: p.count }, p.count) }}</span>
          </span>
        </button>
      </div>
    </aside>
    <section class="flex min-w-0 flex-1 flex-col">
      <div class="flex min-h-[52px] shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-[13px]">
        <template v-if="person">
          <b class="text-[14px]">{{ person.name }}</b>
          <WatchBell kind="face" :value="person.name" />
          <span class="text-xs text-ink-3">{{ $t('plates.passages', { n: person.count }, person.count) }} · {{ person.cams.map(camName).join(', ') }}</span>
        </template>
        <span class="ml-auto text-xs text-ink-3">{{ $t('faces.seenHint') }}</span>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          <button v-for="e in passages" :key="e.id" class="overflow-hidden rounded-lg border border-line bg-panel text-left hover:border-accent" :title="$t('plates.replay')" @click="emit('replay', e)">
            <img :src="e.thumb" alt="" loading="lazy" class="aspect-video w-full bg-raised object-cover" draggable="false">
            <span class="block px-2 py-1.5 text-[11px] leading-tight"><b class="block truncate">{{ camName(e.cam) }}</b><span class="text-ink-3">{{ when(e.s) }}</span></span>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
