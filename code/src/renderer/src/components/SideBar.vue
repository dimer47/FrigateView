<script setup>
import { ref } from 'vue'
import { useServerStore } from '@/stores/server'
import { useLayoutStore, GRIDS } from '@/stores/layouts'
import GridIcon from './GridIcon.vue'
import LayoutDialog from './LayoutDialog.vue'
import { useUiStore } from '@/stores/ui'

const server = useServerStore()
const store = useLayoutStore()
const ui = useUiStore()
const dragLayout = ref(null)

function onCamDragStart(e, id) { e.dataTransfer.setData('application/x-fv-cam', id); e.dataTransfer.effectAllowed = 'copy' }

// Double-clic : case sélectionnée si elle est vide, sinon première case vide
function quickPlace(id) {
  if (!store.active) return
  const cells = store.active.cells
  let i = store.selected
  if (cells[i] && cells[i] !== id) { const empty = cells.indexOf(null); if (empty >= 0) i = empty }
  store.place(id, i)
}

function onLayoutDrop(targetId) { if (dragLayout.value && dragLayout.value !== targetId) store.move(dragLayout.value, targetId); dragLayout.value = null }
</script>

<template>
  <aside class="flex w-[230px] shrink-0 flex-col overflow-hidden border-r border-line bg-panel">
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex items-center justify-between px-3 pb-1.5 pt-2.5">
        <span class="text-[11px] font-bold uppercase tracking-wider text-ink-3">{{ $t('sidebar.layouts') }} <span class="ml-1 rounded-lg bg-raised px-1.5 font-normal">{{ store.layouts.length }}</span></span>
        <button class="tbtn !size-6" :title="$t('sidebar.createLayout')" @click="ui.layoutDialog = null">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.6" /></svg>
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <p v-if="!store.layouts.length" class="px-2 py-1.5 text-xs leading-relaxed text-ink-3">{{ $t('sidebar.noLayout') }}</p>
        <div v-for="l in store.layouts" :key="l.id" draggable="true" role="button" tabindex="0"
          class="group mb-0.5 flex cursor-pointer items-center gap-2.5 rounded-md border px-2 py-1.5 text-[13px]"
          :class="[l.id === store.activeId ? 'active border-accent/35 bg-accent/15 text-accent' : 'border-transparent text-ink-2 hover:bg-raised hover:text-ink', { 'opacity-40': dragLayout === l.id }]"
          :title="$t('sidebar.layoutHint')"
          @click="store.apply(l.id)" @keydown.enter="store.apply(l.id)"
          @dragstart="(e) => { dragLayout = l.id; e.dataTransfer.setData('application/x-fv-layout', l.id) }"
          @dragover.prevent @drop.prevent="onLayoutDrop(l.id)" @dragend="dragLayout = null">
          <GridIcon :grid="l.grid" />
          <span class="flex-1 truncate">{{ l.name }}</span>
          <span class="text-[11px] text-ink-3" :title="$t('sidebar.placed')">{{ l.cells.filter(Boolean).length }}/{{ GRIDS[l.grid].n }}</span>
          <button class="tbtn !size-6 opacity-0 group-hover:opacity-100" :class="{ '!opacity-100': l.id === store.activeId }" :title="$t('common.edit')" @click.stop="ui.layoutDialog = l.id">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8.5 1.5l2 2L4 10H2V8z" /></svg>
          </button>
        </div>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col border-t border-line">
      <div class="px-3 pb-1.5 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">{{ $t('sidebar.cameras') }} <span class="ml-1 rounded-lg bg-raised px-1.5 font-normal">{{ server.cameras.length }}</span></div>
      <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <div v-for="c in server.cameras" :key="c.id" draggable="true"
          class="mb-0.5 flex cursor-grab items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-raised"
          :class="store.cams.includes(c.id) ? 'text-ink' : 'text-ink-2'"
          :title="store.cams.includes(c.id) ? $t('sidebar.inLayout') : $t('sidebar.notInLayout')"
          @dragstart="onCamDragStart($event, c.id)" @dblclick="quickPlace(c.id)">
          <span class="size-2 shrink-0 rounded-full" :class="server.online[c.id] === false ? 'bg-bad' : 'bg-ok'" />
          <span class="flex-1 truncate font-medium" :class="{ 'text-ink-3': server.online[c.id] === false }">{{ c.name }}</span>
          <span v-if="server.online[c.id] === false" class="rounded-lg border border-bad/40 px-1.5 text-[10px] font-bold text-bad" :title="$t('common.offline')">{{ $t('sidebar.offlineShort') }}</span>
          <svg v-if="store.cams.includes(c.id)" class="text-accent" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" /><circle cx="8" cy="8" r="2" /></svg>
        </div>
      </div>
      <p class="px-3 pb-2.5 pt-1.5 text-[11px] leading-snug text-ink-3">{{ $t('sidebar.camHint') }}</p>
    </div>
    
  </aside>
</template>
