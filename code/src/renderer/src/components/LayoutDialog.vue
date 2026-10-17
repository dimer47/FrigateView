<script setup>
import { ref, computed, onMounted } from 'vue'
import { GRIDS, useLayoutStore } from '@/stores/layouts'
import { useUiStore } from '@/stores/ui'
import GridIcon from './GridIcon.vue'

const props = defineProps({ layoutId: { type: String, default: null } })
const emit = defineEmits(['close'])
const store = useLayoutStore()
const ui = useUiStore()

const editing = computed(() => store.layouts.find((l) => l.id === props.layoutId))
const name = ref(editing.value?.name || '')
const grid = ref(editing.value?.grid || '2x2')
const nameInput = ref(null)
const nameError = ref(false)
onMounted(() => nameInput.value?.focus())

const lost = computed(() => (editing.value ? editing.value.cells.slice(GRIDS[grid.value].n).filter(Boolean).length : 0))

function save() {
  if (!name.value.trim()) { nameError.value = true; nameInput.value.focus(); return }
  if (editing.value) { store.update(editing.value.id, name.value.trim(), grid.value); ui.notify(`Layout « ${name.value.trim()} » enregistré`) }
  else { store.create(name.value.trim(), grid.value); ui.notify(`Layout « ${name.value.trim()} » créé — glissez des caméras dans les cases`) }
  emit('close')
}
function remove() {
  const snap = store.remove(editing.value.id)
  ui.notify(`Layout « ${snap.removed.name} » supprimé`, { label: 'Annuler', run: () => store.restore(snap) })
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45" @mousedown.self="emit('close')" @keydown.esc.stop="emit('close')">
    <form class="w-[340px] rounded-xl border border-line-2 bg-modal p-5 shadow-2xl" @submit.prevent="save">
      <div class="mb-3.5 text-[15px] font-bold">{{ editing ? 'Modifier le layout' : 'Nouveau layout' }}</div>
      <label class="label" for="lname">Nom</label>
      <input id="lname" ref="nameInput" v-model="name" maxlength="40" class="input mb-4" :class="{ '!border-bad': nameError }" :placeholder="nameError ? 'Le nom est obligatoire' : 'Ex : Parking, Nuit, Bureau…'">
      <span class="label">Grille</span>
      <div class="grid grid-cols-3 gap-1.5">
        <button v-for="(g, k) in GRIDS" :key="k" type="button" class="flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-xs font-semibold"
          :class="grid === k ? 'active border-accent bg-accent/15 text-accent' : 'border-line bg-bg text-ink-2 hover:border-accent hover:text-accent'" @click="grid = k">
          <GridIcon :grid="k" class="!h-5 !w-[30px]" />{{ g.label }}<small class="font-normal text-ink-3">{{ g.n }} cam.</small>
        </button>
      </div>
      <p v-if="lost" class="mt-2 text-xs text-warn">{{ lost }} caméra{{ lost > 1 ? 's' : '' }} ne tiendr{{ lost > 1 ? 'ont' : 'a' }} plus dans cette grille et ser{{ lost > 1 ? 'ont retirées' : 'a retirée' }}.</p>
      <div class="mt-4 flex items-center gap-2 border-t border-line pt-3.5">
        <button v-if="editing" type="button" class="btn btn-danger mr-auto" @click="remove">Supprimer</button>
        <button type="button" class="btn ml-auto" @click="emit('close')">Annuler</button>
        <button type="submit" class="btn btn-primary">{{ editing ? 'Enregistrer' : 'Créer' }}</button>
      </div>
    </form>
  </div>
</template>
