<script setup>
// Commandes des caméras motorisées (ONVIF configuré dans Frigate), affichées sur la caméra agrandie.
// Bouton maintenu = déplacement, relâché = arrêt.
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useServerStore } from '@/stores/server'
import { useEventsStore } from '@/stores/events'
import { useUiStore } from '@/stores/ui'
import { getPtzInfo } from '@/services/frigate'
import { t } from '@/i18n'

const props = defineProps({ camId: { type: String, required: true } })
const server = useServerStore()
const ev = useEventsStore()
const ui = useUiStore()
const info = ref(null)
const preset = ref('')

onMounted(async () => { info.value = await getPtzInfo(server.server, props.camId) })
const has = (f) => info.value?.features?.includes(f)

let moving = false
function send(cmd) { if (!ev.send(`${props.camId}/ptz`, cmd)) ui.notify(t('ptz.unavailable')) }
function start(cmd) { moving = true; send(cmd) }
function stop() { if (moving) { moving = false; send('STOP') } }
function goPreset() { if (preset.value) send('preset_' + preset.value); preset.value = '' }
addEventListener('mouseup', stop)
onBeforeUnmount(() => { stop(); removeEventListener('mouseup', stop) })

const ARROWS = [['MOVE_UP', 'col-start-2', 'M8 4l4 5H4z'], ['MOVE_LEFT', 'col-start-1 row-start-2', 'M4 8l5-4v8z'], ['MOVE_RIGHT', 'col-start-3 row-start-2', 'M12 8l-5-4v8z'], ['MOVE_DOWN', 'col-start-2 row-start-3', 'M8 12l4-5H4z']]
</script>

<template>
  <div v-if="has('pt') || has('zoom') || info?.presets?.length" class="absolute bottom-12 right-3 z-[6] flex items-end gap-2 rounded-lg border border-line-2 bg-black/70 p-2" @dblclick.stop>
    <div v-if="has('pt')" class="grid grid-cols-3 grid-rows-3 gap-0.5" :title="$t('ptz.move')">
      <button v-for="[cmd, pos, d] in ARROWS" :key="cmd" class="flex size-8 items-center justify-center rounded bg-raised hover:bg-accent" :class="pos" :aria-label="$t('ptz.' + cmd)" @mousedown.prevent="start(cmd)">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path :d="d" /></svg>
      </button>
    </div>
    <div v-if="has('zoom')" class="flex flex-col gap-0.5">
      <button class="flex size-8 items-center justify-center rounded bg-raised text-lg font-bold hover:bg-accent" :title="$t('ptz.zoomIn')" @mousedown.prevent="start('ZOOM_IN')">+</button>
      <button class="flex size-8 items-center justify-center rounded bg-raised text-lg font-bold hover:bg-accent" :title="$t('ptz.zoomOut')" @mousedown.prevent="start('ZOOM_OUT')">−</button>
    </div>
    <select v-if="info?.presets?.length" v-model="preset" class="input !h-8 !w-36 !py-0 text-xs" :title="$t('ptz.presets')" @change="goPreset">
      <option value="">{{ $t('ptz.presets') }}</option>
      <option v-for="p in info.presets" :key="p" :value="p">{{ p }}</option>
    </select>
  </div>
</template>
