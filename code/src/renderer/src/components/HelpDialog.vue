<script setup>
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { t } from '@/i18n'
const ui = useUiStore()
const KEYS = computed(() => [
  ['Ctrl+1 / 2 / 3', t('help.panels')], ['Ctrl+E', t('toolbar.wall')], ['F11', t('toolbar.fullscreen')], ['Ctrl+,', t('toolbar.settings')],
  ['Ctrl+N', t('layoutDialog.newTitle')], ['Ctrl+Alt+1…9', t('help.layoutN')], ['Ctrl+Alt+← / →', t('help.layoutStep')],
  [t('help.space'), t('help.playPause')], ['← / →', t('help.skip')], ['L', t('help.live')],
  ['Ctrl+Shift+S', t('help.capture')], ['Ctrl+Shift+E', t('help.exportClip')], ['Ctrl+Shift+M', t('help.sound')],
  [t('help.dblclick'), t('help.dblclickAction')], ['↑ / ↓', t('help.eventStep')], [t('help.esc'), t('help.escAction')]
])
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/55" @mousedown.self="ui.helpOpen = false">
    <div class="w-[480px] rounded-xl border border-line-2 bg-modal shadow-2xl" role="dialog" aria-modal="true">
      <header class="flex items-center border-b border-line px-5 py-3">
        <h2 class="text-[15px] font-bold">{{ $t('help.title') }}</h2>
        <button class="ml-auto flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-bad/15 hover:text-bad" :title="$t('common.closeEsc')" @click="ui.helpOpen = false">
          <svg width="13" height="13" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.7" /></svg>
        </button>
      </header>
      <dl class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 p-5 text-[13px]">
        <template v-for="[k, d] in KEYS" :key="k"><dt><kbd class="whitespace-nowrap rounded border border-line-2 bg-raised px-1.5 py-0.5 font-mono text-[11px]">{{ k }}</kbd></dt><dd class="text-ink-2">{{ d }}</dd></template>
      </dl>
    </div>
  </div>
</template>
