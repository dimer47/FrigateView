<script setup>
// Galerie des visages : personnes connues de Frigate, visages récents à attribuer, dernières apparitions.
// Modifications (créer, renommer, attribuer, supprimer, ajouter des images) réservées au rôle admin.
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import { getJson, getPath, eventThumbUrl } from '@/services/frigate'
import { TRAIN, getFaces, faceImageUrl, faceRecognitionEnabled, validName, folderName, rangeSelect, imageTime,
  createFace, classifyFace, deleteFaceImages, renameFace, registerFace } from '@/services/faces'
import { fromEvent } from '@/stores/eventFilters'
import { playEvent } from '@/stores/playEvent'
import WatchBell from './WatchBell.vue'
import { t, loc } from '@/i18n'

const server = useServerStore()
const ui = useUiStore()
const srv = () => server.server
const admin = computed(() => server.isAdmin)

const state = ref('loading') // loading | ok | disabled | error
const errorText = ref('')
const people = ref([])
const train = ref([])
const current = ref(TRAIN) // TRAIN ou nom d'une personne
const busy = ref(false)
const stamp = ref(Date.now()) // anti-cache des images après modification

const person = computed(() => people.value.find((p) => p.name === current.value) || null)
const close = () => (ui.facesOpen = false)
const fail = (e) => ui.notify(t('faces.failed', { msg: e?.message || String(e) }))
const label = (name) => name.replace(/_/g, ' ')

async function load() {
  try {
    const config = await getJson(srv(), '/api/config')
    if (!faceRecognitionEnabled(config)) { state.value = 'disabled'; return }
    const f = await getFaces(srv())
    people.value = f.people
    train.value = f.train
    stamp.value = Date.now()
    if (current.value !== TRAIN && !person.value) current.value = TRAIN
    state.value = 'ok'
  } catch (e) {
    // 404 : Frigate antérieur à 0.16 ; 400 : reconnaissance coupée
    if (e.status === 404 || e.status === 400) state.value = 'disabled'
    else { state.value = 'error'; errorText.value = e.message }
  }
}
onMounted(load)

/* ---- Sélection (admin) : clic = cocher, Maj+clic = plage ---- */
const selected = ref(new Set())
let last = null
watch(current, () => { selected.value = new Set(); last = null; confirmDel.value = false; renaming.value = false; loadEvents() })
const files = computed(() => (current.value === TRAIN ? train.value.map((x) => x.file) : person.value?.images || []))
function pick(file, e) {
  if (!admin.value) return
  const s = new Set(selected.value)
  if (e.shiftKey && last) selected.value = rangeSelect(files.value, s, last, file)
  else { s.has(file) ? s.delete(file) : s.add(file); selected.value = s }
  last = file
}
const allSelected = computed(() => files.value.length > 0 && selected.value.size === files.value.length)
const toggleAll = () => (selected.value = allSelected.value ? new Set() : new Set(files.value))

/* ---- Actions ---- */
async function run(fn, done) {
  busy.value = true
  try { const n = await fn(); if (done) ui.notify(done(n)) } catch (e) { fail(e) } finally { busy.value = false; selected.value = new Set(); confirmDel.value = false; await load() }
}

// Attribution des visages récents sélectionnés
const assignTo = ref('')
const newName = ref('')
async function assign() {
  let name = assignTo.value
  if (name === '__new') {
    if (!validName(newName.value)) return ui.notify(t('faces.badName'))
    name = folderName(newName.value)
  }
  if (!name) return
  const list = [...selected.value]
  await run(async () => {
    if (!people.value.some((p) => p.name === name)) await createFace(srv(), name)
    for (const f of list) await classifyFace(srv(), f, name)
    return list.length
  }, (n) => t('faces.assigned', { n, name: label(name) }, n))
  assignTo.value = ''; newName.value = ''
}

const confirmDel = ref(false)
async function deleteSelected() {
  if (!confirmDel.value) { confirmDel.value = true; return }
  const list = [...selected.value]
  await run(async () => { await deleteFaceImages(srv(), current.value, list); return list.length }, (n) => t('faces.deleted', { n }, n))
}

// Personnes : création, renommage, suppression
const creating = ref(false)
const createName = ref('')
async function create() {
  if (!validName(createName.value)) return ui.notify(t('faces.badName'))
  const name = folderName(createName.value)
  await run(() => createFace(srv(), name))
  creating.value = false; createName.value = ''
  current.value = name
}
const renaming = ref(false)
const renameValue = ref('')
function startRename() { renameValue.value = label(current.value); renaming.value = true }
async function rename() {
  if (!validName(renameValue.value)) return ui.notify(t('faces.badName'))
  const target = folderName(renameValue.value)
  if (target === current.value) { renaming.value = false; return }
  await run(() => renameFace(srv(), current.value, target))
  renaming.value = false
  current.value = target
}
const confirmPerson = ref(false)
async function deletePerson() {
  if (!confirmPerson.value) { confirmPerson.value = true; return }
  const p = person.value
  confirmPerson.value = false
  await run(async () => { await deleteFaceImages(srv(), p.name, p.images); return 1 }, () => t('faces.personDeleted', { name: label(p.name) }))
  current.value = TRAIN
}

// Images ajoutées depuis des fichiers (JPEG, PNG, WebP) : Frigate y cherche le visage
const fileInput = ref(null)
const readB64 = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.onerror = () => reject(r.error); r.readAsDataURL(file) })
async function onFiles(e) {
  const list = [...e.target.files]
  e.target.value = ''
  if (!list.length) return
  const name = current.value
  await run(async () => {
    let n = 0
    for (const f of list) {
      const res = await registerFace(srv(), name, { filename: f.name, type: f.type, base64: await readB64(f) })
      if (res.success === false) throw new Error(res.message || f.name)
      n++
    }
    return n
  }, (n) => t('faces.uploaded', { n }, n))
}

/* ---- Dernières apparitions d'une personne (événements dont le sous-libellé est son nom) ---- */
const events = ref([])
const eventsLoading = ref(false)
async function loadEvents() {
  events.value = []
  if (current.value === TRAIN) return
  const name = current.value
  eventsLoading.value = true
  try {
    const list = await getPath(srv(), `/api/events?sub_labels=${encodeURIComponent(name)}&limit=24`)
    if (current.value === name) events.value = (Array.isArray(list) ? list : []).map((r) => fromEvent(r, eventThumbUrl(srv(), r.id)))
  } catch { /* liste facultative */ } finally { eventsLoading.value = false }
}
function replay(e) { playEvent(e); close() }

const img = (name, file) => `${faceImageUrl(srv(), name, file)}?t=${stamp.value}`
const when = (ms) => (ms ? new Date(ms).toLocaleString(loc(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
const pct = (s) => (s == null ? '' : `${Math.round(s * 100)} %`)
const camName = (id) => server.camById(id)?.name || id

const onKey = (e) => { if (e.key === 'Escape' && !e.target.matches?.('input, select')) close() }
onMounted(() => addEventListener('keydown', onKey))
onBeforeUnmount(() => removeEventListener('keydown', onKey))
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/55" @mousedown.self="close">
    <div class="flex h-[calc(100vh-40px)] w-[min(1200px,calc(100vw-40px))] flex-col overflow-hidden rounded-xl border border-line-2 bg-modal shadow-2xl" role="dialog" aria-modal="true">
      <header class="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
        <h2 class="text-[15px] font-bold">{{ $t('faces.title') }}</h2>
        <span v-if="!admin" class="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-3">{{ $t('faces.readOnly') }}</span>
        <button class="ml-auto flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-raised hover:text-ink" :title="$t('faces.reload')" :disabled="busy" @click="load">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3h-3" /></svg>
        </button>
        <button class="flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-bad/15 hover:text-bad" :title="$t('common.closeEsc')" @click="close">
          <svg width="13" height="13" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.7" /></svg>
        </button>
      </header>

      <div v-if="state === 'loading'" class="flex flex-1 items-center justify-center gap-3 text-ink-2"><span class="spin" /> {{ $t('faces.loading') }}</div>
      <div v-else-if="state === 'disabled' || state === 'error'" class="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" class="text-ink-3"><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r=".8" fill="currentColor" /><circle cx="15" cy="10" r=".8" fill="currentColor" /><path d="M8.5 15.5c2 1.5 5 1.5 7 0" /></svg>
        <h3 class="text-[15px] font-bold">{{ state === 'disabled' ? $t('faces.disabledTitle') : $t('faces.errorTitle') }}</h3>
        <p class="max-w-[520px] text-[13px] text-ink-2">{{ state === 'disabled' ? $t('faces.disabledText') : errorText }}</p>
        <code v-if="state === 'disabled'" class="rounded-md border border-line bg-bg px-3 py-2 text-left font-mono text-xs text-ink-2">face_recognition:<br>&nbsp;&nbsp;enabled: true</code>
        <button class="btn mt-2" @click="state = 'loading'; load()">{{ $t('faces.retry') }}</button>
      </div>

      <div v-else class="flex min-h-0 flex-1">
        <!-- Colonne gauche : visages récents puis personnes -->
        <aside class="flex w-64 shrink-0 flex-col border-r border-line bg-panel">
          <div class="min-h-0 flex-1 overflow-y-auto p-2">
            <button class="mb-2 flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px]" :class="current === TRAIN ? 'bg-accent/15 text-accent' : 'text-ink-2 hover:bg-raised'" @click="current = TRAIN">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-raised">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01" /></svg>
              </span>
              <span class="min-w-0 flex-1"><span class="block truncate font-semibold">{{ $t('faces.recent') }}</span><span class="block text-[11px] text-ink-3">{{ $t('faces.images', { n: train.length }, train.length) }}</span></span>
            </button>
            <div class="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-ink-3">{{ $t('faces.people') }}</div>
            <p v-if="!people.length" class="px-2 py-2 text-xs text-ink-3">{{ $t('faces.noPeople') }}</p>
            <button v-for="p in people" :key="p.name" class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px]" :class="current === p.name ? 'bg-accent/15 text-accent' : 'text-ink-2 hover:bg-raised'" @click="current = p.name">
              <img v-if="p.images[0]" :src="img(p.name, p.images[0])" alt="" class="size-9 shrink-0 rounded-md bg-raised object-cover" draggable="false">
              <span v-else class="flex size-9 shrink-0 items-center justify-center rounded-md bg-raised text-sm font-bold uppercase">{{ p.name[0] }}</span>
              <span class="min-w-0 flex-1"><span class="block truncate font-semibold">{{ label(p.name) }}</span><span class="block text-[11px] text-ink-3">{{ $t('faces.images', { n: p.images.length }, p.images.length) }}</span></span>
            </button>
          </div>
          <div v-if="admin" class="border-t border-line p-2">
            <form v-if="creating" class="flex gap-1.5" @submit.prevent="create">
              <input v-model="createName" class="input py-1" :placeholder="$t('faces.namePlaceholder')" autofocus @keydown.esc.stop="creating = false">
              <button class="btn btn-primary px-2.5 py-1" :disabled="busy || !createName.trim()">{{ $t('common.create') }}</button>
            </form>
            <button v-else class="btn w-full" @click="creating = true">+ {{ $t('faces.newPerson') }}</button>
          </div>
        </aside>

        <!-- Partie droite -->
        <section class="flex min-w-0 flex-1 flex-col">
          <div class="flex min-h-[52px] shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-[13px]">
            <template v-if="current === TRAIN">
              <b class="text-[14px]">{{ $t('faces.recent') }}</b>
              <span class="text-xs text-ink-3">{{ $t('faces.recentHint') }}</span>
            </template>
            <template v-else-if="person">
              <form v-if="renaming" class="flex gap-1.5" @submit.prevent="rename">
                <input v-model="renameValue" class="input py-1" style="width: 14rem" autofocus @keydown.esc.stop="renaming = false">
                <button class="btn btn-primary px-2.5 py-1" :disabled="busy">{{ $t('common.save') }}</button>
                <button type="button" class="btn px-2.5 py-1" @click="renaming = false">{{ $t('common.cancel') }}</button>
              </form>
              <b v-else class="text-[14px]">{{ label(person.name) }}</b>
              <WatchBell v-if="!renaming" kind="face" :value="person.name" />
              <span class="text-xs text-ink-3">{{ $t('faces.images', { n: person.images.length }, person.images.length) }}</span>
              <template v-if="admin && !renaming">
                <button class="btn ml-2 px-2.5 py-1" @click="startRename">{{ $t('faces.rename') }}</button>
                <button class="btn px-2.5 py-1" :disabled="busy" @click="fileInput.click()">{{ $t('faces.addImages') }}</button>
                <button class="btn btn-danger px-2.5 py-1" :disabled="busy" @click="deletePerson" @blur="confirmPerson = false">{{ confirmPerson ? $t('faces.confirmDeletePerson') : $t('faces.deletePerson') }}</button>
                <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple class="hidden" @change="onFiles">
              </template>
            </template>
            <span v-if="busy" class="spin ml-2" />
          </div>

          <!-- Barre de sélection (admin) -->
          <div v-if="admin && files.length" class="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-1.5 text-xs">
            <label class="flex items-center gap-1.5"><input type="checkbox" class="size-4 accent-accent" :checked="allSelected" @change="toggleAll">{{ $t('faces.selectAll') }}</label>
            <span class="text-ink-3">{{ selected.size ? $t('faces.selected', { n: selected.size }, selected.size) : $t('faces.selectHint') }}</span>
            <div class="flex-1" />
            <template v-if="selected.size">
              <template v-if="current === TRAIN">
                <select v-model="assignTo" class="input py-1 text-xs" style="width: auto">
                  <option value="" disabled>{{ $t('faces.assignTo') }}</option>
                  <option v-for="p in people" :key="p.name" :value="p.name">{{ label(p.name) }}</option>
                  <option value="__new">{{ $t('faces.newPersonOption') }}</option>
                </select>
                <input v-if="assignTo === '__new'" v-model="newName" class="input py-1 text-xs" style="width: 10rem" :placeholder="$t('faces.namePlaceholder')" @keydown.enter="assign">
                <button class="btn btn-primary px-2.5 py-1" :disabled="busy || !assignTo || (assignTo === '__new' && !newName.trim())" @click="assign">{{ $t('faces.assign') }}</button>
              </template>
              <button class="btn btn-danger px-2.5 py-1" :disabled="busy" @click="deleteSelected" @blur="confirmDel = false">{{ confirmDel ? $t('faces.confirmDelete', { n: selected.size }, selected.size) : $t('faces.deleteSelected') }}</button>
            </template>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto p-4">
            <!-- Visages récents -->
            <template v-if="current === TRAIN">
              <p v-if="!train.length" class="py-16 text-center text-[13px] text-ink-3">{{ $t('faces.emptyRecent') }}</p>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3">
                <button v-for="f in train" :key="f.file" class="group relative overflow-hidden rounded-lg border-2 bg-panel text-left" :class="selected.has(f.file) ? 'border-accent' : 'border-line hover:border-line-2'" :title="f.file" @click="pick(f.file, $event)">
                  <img :src="img(TRAIN, f.file)" alt="" loading="lazy" class="aspect-square w-full bg-raised object-cover" draggable="false">
                  <span v-if="admin" class="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded border border-white/40 bg-black/50 text-[11px] text-white" :class="{ 'bg-accent': selected.has(f.file) }">{{ selected.has(f.file) ? '✓' : '' }}</span>
                  <span class="block px-2 py-1.5 text-[11px] leading-tight">
                    <span class="flex justify-between gap-1"><b class="truncate">{{ f.name ? label(f.name) : $t('faces.unknown') }}</b><span v-if="f.score != null" class="font-mono" :class="f.score >= 0.8 ? 'text-ok' : f.score >= 0.6 ? 'text-warn' : 'text-ink-3'">{{ pct(f.score) }}</span></span>
                    <span class="block text-ink-3">{{ when(f.ts) }}</span>
                  </span>
                </button>
              </div>
            </template>

            <!-- Personne : images d'entraînement, puis dernières apparitions -->
            <template v-else-if="person">
              <p v-if="!person.images.length" class="py-8 text-center text-[13px] text-ink-3">{{ $t('faces.emptyPerson') }}</p>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
                <button v-for="f in person.images" :key="f" class="relative overflow-hidden rounded-lg border-2 bg-panel" :class="[selected.has(f) ? 'border-accent' : 'border-line hover:border-line-2', { 'cursor-default': !admin }]" :title="when(imageTime(f)) || f" @click="pick(f, $event)">
                  <img :src="img(person.name, f)" alt="" loading="lazy" class="aspect-square w-full bg-raised object-cover" draggable="false">
                  <span v-if="admin" class="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded border border-white/40 bg-black/50 text-[11px] text-white" :class="{ 'bg-accent': selected.has(f) }">{{ selected.has(f) ? '✓' : '' }}</span>
                </button>
              </div>
              <h3 class="mb-2 mt-6 text-[11px] font-bold uppercase tracking-wider text-ink-3">{{ $t('faces.appearances') }}</h3>
              <p v-if="eventsLoading" class="flex items-center gap-2 text-xs text-ink-3"><span class="spin" /> {{ $t('faces.loading') }}</p>
              <p v-else-if="!events.length" class="text-xs text-ink-3">{{ $t('faces.noAppearances') }}</p>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                <button v-for="e in events" :key="e.id" class="overflow-hidden rounded-lg border border-line bg-panel text-left hover:border-accent" :title="$t('faces.replay')" @click="replay(e)">
                  <img :src="e.thumb" alt="" loading="lazy" class="aspect-video w-full bg-raised object-cover" draggable="false">
                  <span class="block px-2 py-1.5 text-[11px] leading-tight"><b class="block truncate">{{ camName(e.cam) }}</b><span class="text-ink-3">{{ when(e.s) }}</span></span>
                </button>
              </div>
            </template>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
