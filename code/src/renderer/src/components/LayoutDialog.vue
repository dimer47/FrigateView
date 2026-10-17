<script setup>
import { ref, computed, onMounted } from 'vue'
import { GRIDS, useLayoutStore } from '@/stores/layouts'
import { useUiStore } from '@/stores/ui'
import GridIcon from './GridIcon.vue'
import { t } from '@/i18n'

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

const groups = [...new Set(Object.values(GRIDS).map((g) => g.group))]
const byGroup = (grp) => Object.fromEntries(Object.entries(GRIDS).filter(([, g]) => g.group === grp))
const lost = computed(() => (editing.value ? editing.value.cells.slice(GRIDS[grid.value].n).filter(Boolean).length : 0))

function save() {
  if (!name.value.trim()) { nameError.value = true; nameInput.value.focus(); return }
  if (editing.value) { store.update(editing.value.id, name.value.trim(), grid.value); ui.notify(t('layoutDialog.saved', { name: name.value.trim() })) }
  else { store.create(name.value.trim(), grid.value); ui.notify(t('layoutDialog.created', { name: name.value.trim() })) }
  emit('close')
}
function remove() {
  const snap = store.remove(editing.value.id)
  ui.notify(t('layoutDialog.deleted', { name: snap.removed.name }), { label: t('common.undo'), run: () => store.restore(snap) })
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45" @mousedown.self="emit('close')" @keydown.esc.stop="emit('close')">
    <form class="w-[620px] max-w-[calc(100vw-40px)] rounded-xl border border-line-2 bg-modal p-5 shadow-2xl" @submit.prevent="save">
      <div class="mb-3.5 text-[15px] font-bold">{{ editing ? $t('layoutDialog.editTitle') : $t('layoutDialog.newTitle') }}</div>
      <label class="label" for="lname">{{ $t('layoutDialog.name') }}</label>
      <input id="lname" ref="nameInput" v-model="name" maxlength="40" class="input mb-4" :class="{ '!border-bad': nameError }" :placeholder="nameError ? $t('layoutDialog.nameRequired') : $t('layoutDialog.namePlaceholder')">
      <span class="label">{{ $t('layoutDialog.grid') }}</span>
      <div class="max-h-[min(460px,60vh)] overflow-y-auto pr-1">
      <template v-for="grp in groups" :key="grp">
      <div class="mb-1 mt-2 text-[11px] text-ink-3 first:mt-0">{{ $t('grids.' + grp) }}</div>
      <div class="grid grid-cols-6 gap-1.5">
        <button v-for="(g, k) in byGroup(grp)" :key="k" type="button" class="flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-xs font-semibold"
          :class="grid === k ? 'active border-accent bg-accent/15 text-accent' : 'border-line bg-bg text-ink-2 hover:border-accent hover:text-accent'" @click="grid = k">
          <GridIcon :grid="k" class="!h-5 !w-[30px]" />{{ g.label }}<small class="font-normal text-ink-3">{{ $t('layoutDialog.camCount', { n: g.n }) }}</small>
        </button>
      </div>
      </template>
      </div>
      <p v-if="lost" class="mt-2 text-xs text-warn">{{ $t('layoutDialog.lost', { n: lost }, lost) }}</p>
      <div class="mt-4 flex items-center gap-2 border-t border-line pt-3.5">
        <button v-if="editing" type="button" class="btn btn-danger mr-auto" @click="remove">{{ $t('common.delete') }}</button>
        <button type="button" class="btn ml-auto" @click="emit('close')">{{ $t('common.cancel') }}</button>
        <button type="submit" class="btn btn-primary">{{ editing ? $t('common.save') : $t('common.create') }}</button>
      </div>
    </form>
  </div>
</template>
