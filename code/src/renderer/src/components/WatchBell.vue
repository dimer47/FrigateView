<script setup>
// Cloche : notification système quand cette personne ou cette plaque est reconnue
import { computed } from 'vue'
import { useAppSettings } from '@/stores/appSettings'
import { toggleIn } from '@/services/watch'

const props = defineProps({ kind: { type: String, required: true }, value: { type: String, required: true } }) // kind : face | plate
const app = useAppSettings()
const key = computed(() => (props.kind === 'face' ? 'watchFaces' : 'watchPlates'))
const on = computed(() => (app.s?.[key.value] || []).includes(props.value))
const toggle = () => app.set({ [key.value]: toggleIn([...(app.s?.[key.value] || [])], props.value) })
</script>

<template>
  <button type="button" class="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-raised" :class="on ? 'text-accent' : 'text-ink-3 hover:text-ink'"
    :title="on ? $t('watch.bellOff') : $t('watch.bellOn')" :aria-pressed="on" @click.stop="toggle">
    <svg width="15" height="15" viewBox="0 0 24 24" :fill="on ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" fill="none" /></svg>
  </button>
</template>
