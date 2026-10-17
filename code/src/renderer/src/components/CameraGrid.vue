<script setup>
import { computed, ref } from 'vue'
import { useLayoutStore, bestGrid, gridStyle, cellStyle } from '@/stores/layouts'
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import CameraCell from './CameraCell.vue'
import LayoutDialog from './LayoutDialog.vue'
import PtzPad from './PtzPad.vue'
import { useMediaStore } from '@/stores/media'
import { useTimelineStore } from '@/stores/timeline'
import { t } from '@/i18n'

const store = useLayoutStore()
const server = useServerStore()
const ui = useUiStore()
const media = useMediaStore()
const tl = useTimelineStore()
const dropTarget = ref(null)
const creating = ref(false)

const layout = computed(() => store.active)
const focused = computed(() => store.focus !== null && layout.value?.cells[store.focus])
const indices = computed(() => (focused.value ? [store.focus] : layout.value.cells.map((_, i) => i)))

function accepts(e) { const t = e.dataTransfer.types; return t.includes('application/x-fv-cam') || t.includes('application/x-fv-cell') }
function onDragOver(e, i) { if (!accepts(e)) return; e.preventDefault(); dropTarget.value = i }
function onDrop(e, i) {
  dropTarget.value = null
  const cam = e.dataTransfer.getData('application/x-fv-cam')
  const from = e.dataTransfer.getData('application/x-fv-cell')
  if (cam) { store.place(cam, i); ui.notify(t('grid.placed', { cam: server.camById(cam)?.name, layout: layout.value.name })) }
  else if (from !== '' && +from !== i) store.swap(+from, i)
}
function toggleFocus(i) { store.focus = store.focus === null ? i : null; store.selected = i }
function removeCam(i) {
  const id = store.clearCell(i)
  ui.notify(t('grid.removed', { cam: server.camById(id)?.name }), { label: t('common.undo'), run: () => store.place(id, i) })
}
// Export : 1 min autour de la position de relecture, ou la dernière minute en direct
function exportCam(cam) {
  const end = tl.live ? Date.now() : Math.min(Date.now(), tl.time + 30e3)
  media.openExport({ cams: [cam], start: end - 60e3, end })
}
function autoLayout() {
  const ids = server.cameras.map((c) => c.id)
  store.create(t('layouts.allCameras'), bestGrid(ids.length), ids)
}
</script>

<template>
  <main class="relative select-none">
    <div v-if="!layout" class="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-5 text-center text-[13px] text-ink-2">
      <h2 class="text-lg font-semibold text-ink">{{ $t('grid.noLayoutTitle') }}</h2>
      <p>{{ $t('grid.noLayoutText') }}<br>{{ $t('grid.camerasFound', { n: server.cameras.length }) }}</p>
      <div class="mt-2 flex gap-2">
        <button class="btn btn-primary" @click="autoLayout">{{ $t('grid.createAll') }}</button>
        <button class="btn" @click="creating = true">{{ $t('grid.createEmpty') }}</button>
      </div>
      <LayoutDialog v-if="creating" @close="creating = false" />
    </div>

    <div v-else class="grid size-full overflow-hidden" :style="gridStyle(focused ? '1x1' : layout.grid)" :class="[ui.expand ? 'gap-px p-0' : 'gap-[3px] p-1']">
      <div v-for="i in indices" :key="i + ':' + (layout.cells[i] || '')"
        class="group relative min-h-0 min-w-0 cursor-pointer overflow-hidden border bg-card"
        :class="[ui.expand ? 'rounded-none border-transparent' : 'rounded-[5px] border-line hover:border-accent/50',
          { '!border-accent shadow-[inset_0_0_0_2px_var(--color-accent)]': i === store.selected && !ui.expand, '!border-dashed !border-accent bg-accent/10': dropTarget === i }]"
        :style="focused ? null : cellStyle(layout.grid, i)"
        :draggable="!!layout.cells[i]"
        @click="store.selected = i"
        @dblclick="layout.cells[i] && toggleFocus(i)"
        @dragstart="(e) => { e.dataTransfer.setData('application/x-fv-cell', String(i)); e.dataTransfer.effectAllowed = 'move' }"
        @dragover="onDragOver($event, i)" @dragleave="dropTarget = null" @drop.prevent="onDrop($event, i)">
        <template v-if="layout.cells[i]">
          <CameraCell :cam-id="layout.cells[i]" />
          <div class="absolute right-1.5 top-1.5 z-[4] flex gap-1 opacity-0 transition-opacity group-hover:opacity-100" :class="{ '!opacity-100': media.audioCam === layout.cells[i] }">
            <button v-if="media.hasAudio[layout.cells[i]] || !tl.live" class="flex size-[26px] items-center justify-center rounded-[5px] bg-black/65 text-white hover:bg-accent" :class="{ '!bg-accent': media.audioCam === layout.cells[i] }"
              :title="media.audioCam === layout.cells[i] ? $t('media.mute') : $t('media.unmute')" @click.stop="media.toggleAudio(layout.cells[i])">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 6h3l4-3v10L5 10H2z" fill="currentColor" /><template v-if="media.audioCam === layout.cells[i]"><path d="M11 5.5a3.5 3.5 0 0 1 0 5" /><path d="M12.8 3.5a6 6 0 0 1 0 9" /></template><path v-else d="M11 6l4 4M15 6l-4 4" /></svg>
            </button>
            <button class="flex size-[26px] items-center justify-center rounded-[5px] bg-black/65 text-white hover:bg-accent" :title="$t('media.capture')" @click.stop="media.capture(layout.cells[i])">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 5h2.5l1.2-2h4.6l1.2 2H14v8H2z" /><circle cx="8" cy="9" r="2.4" /></svg>
            </button>
            <button class="flex size-[26px] items-center justify-center rounded-[5px] bg-black/65 text-white hover:bg-accent" :title="$t('media.exportClip')" @click.stop="exportCam(layout.cells[i])">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="4" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><path d="M5.6 5.2L14 12M5.6 10.8L14 4" /></svg>
            </button>
            <button class="flex size-[26px] items-center justify-center rounded-[5px] bg-black/65 text-white hover:bg-accent" :title="focused ? $t('grid.shrink') : $t('grid.enlarge')" @click.stop="toggleFocus(i)">
              <svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="11,1 17,1 17,7" /><polyline points="7,17 1,17 1,11" /><line x1="17" y1="1" x2="10" y2="8" /><line x1="1" y1="17" x2="8" y2="10" /></svg>
            </button>
            <button v-if="!focused" class="flex size-[26px] items-center justify-center rounded-[5px] bg-black/65 text-white hover:bg-accent" :title="$t('grid.remove')" @click.stop="removeCam(i)">
              <svg width="11" height="11" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.8" /></svg>
            </button>
          </div>
        </template>
        <div v-else class="absolute inset-1.5 flex flex-col items-center justify-center gap-1.5 rounded border border-dashed border-line-2 p-2.5 text-center text-xs text-ink-3">
          <svg width="22" height="22" viewBox="0 0 22 22"><path d="M11 4v14M4 11h14" stroke="currentColor" stroke-width="1.5" /></svg>
          {{ $t('grid.dropHere') }}
        </div>
      </div>
    </div>

    <PtzPad v-if="focused" :key="layout.cells[store.focus]" :cam-id="layout.cells[store.focus]" />
    <div v-if="focused" class="absolute left-1/2 top-2.5 z-[6] flex -translate-x-1/2 items-center gap-2.5 rounded-md border border-line-2 bg-black/70 py-1 pl-3 pr-2 text-xs">
      {{ $t('grid.focused', { cam: server.camById(layout.cells[store.focus])?.name, layout: layout.name }) }}
      <button class="rounded border border-line-2 bg-raised px-2 py-0.5 hover:border-accent hover:bg-accent" @click="store.focus = null">{{ $t('grid.backToLayout') }}</button>
    </div>
  </main>
</template>
