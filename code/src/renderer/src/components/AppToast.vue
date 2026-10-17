<script setup>
import { useUiStore } from '@/stores/ui'
const ui = useUiStore()
function run() { ui.toast.action.run(); ui.toast = null }
</script>

<template>
  <Transition enter-from-class="opacity-0 translate-y-3" leave-to-class="opacity-0" enter-active-class="transition" leave-active-class="transition">
    <div v-if="ui.toast" class="fixed bottom-6 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-line-2 bg-modal px-3.5 py-2 text-[13px] shadow-xl">
      <span>{{ ui.toast.text }}</span>
      <button v-if="ui.toast.action" class="font-bold text-accent" @click="run">{{ ui.toast.action.label }}</button>
    </div>
  </Transition>
</template>
