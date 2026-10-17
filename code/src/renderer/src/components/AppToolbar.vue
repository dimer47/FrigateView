<script setup>
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import { useTimelineStore } from '@/stores/timeline'
import { useEventsStore } from '@/stores/events'
import { useAppSettings } from '@/stores/appSettings'

const server = useServerStore()
const ui = useUiStore()
const tl = useTimelineStore()
const ev = useEventsStore()
const appSettings = useAppSettings()

function fullscreen() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() }
</script>

<template>
  <header class="flex h-[46px] shrink-0 items-center gap-3 border-b border-line bg-panel px-3.5">
    <div class="flex items-center gap-2 text-lg font-bold text-accent">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
      FrigateView
    </div>
    <div class="h-[22px] w-px bg-line" />
    <div class="flex items-center gap-2 text-[13px] text-ink-2" :title="`Frigate ${server.version}`">
      <span class="size-[9px] rounded-full" :class="server.status === 'ok' ? 'bg-ok' : 'bg-bad'" />
      {{ server.server.host }}
      <span v-if="server.status === 'ok'">· {{ $t('toolbar.online', { n: server.onlineCount, total: server.cameras.length }) }}</span>
      <span v-else class="font-semibold text-bad">{{ $t('toolbar.unreachable') }}</span>
    </div>
    <div class="flex-1" />

    <div class="flex overflow-hidden rounded-md border border-line text-xs" :title="$t('toolbar.liveMode')">
      <button class="px-2.5 py-1" :class="ui.liveMode === 'webrtc' ? 'bg-accent text-white' : 'text-ink-2'" @click="ui.setLiveMode('webrtc')">{{ $t('toolbar.video') }}</button>
      <button class="border-l border-line px-2.5 py-1" :class="ui.liveMode === 'snapshot' ? 'bg-accent text-white' : 'text-ink-2'" @click="ui.setLiveMode('snapshot')">{{ $t('toolbar.images') }}</button>
    </div>
    <div class="h-[22px] w-px bg-line" />
    <div v-if="server.profile.username" class="flex items-center gap-2 text-xs text-ink-2">
      <span :title="$t('toolbar.roleTitle', { role: server.profile.role })">{{ server.profile.username }} · {{ $te('roles.' + server.profile.role) ? $t('roles.' + server.profile.role) : server.profile.role }}</span>
    </div>
    <div v-if="server.profile.username" class="h-[22px] w-px bg-line" />
    <button class="tbtn" :class="{ on: ui.sidebar }" :title="$t('toolbar.sidebar') + ' (Ctrl+1)'" @click="ui.toggleSidebar()">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="16" height="16" rx="2" /><line x1="6" y1="1" x2="6" y2="17" /></svg>
    </button>
    <button class="tbtn relative" :class="{ on: ev.visible }" :title="$t('toolbar.events') + ' (Ctrl+2)'" @click="ev.visible = !ev.visible; ev.persist()">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="16" height="16" rx="2" /><line x1="12" y1="1" x2="12" y2="17" /></svg>
      <span v-if="ev.unseenCount" class="absolute -right-1.5 -top-1 min-w-[15px] rounded-lg bg-accent px-1 text-center text-[10px] font-bold leading-[15px] text-white">{{ ev.unseenCount > 99 ? '99+' : ev.unseenCount }}</span>
    </button>
    <button class="tbtn" :class="{ on: tl.visible }" :title="$t('toolbar.timeline') + ' (Ctrl+3)'" @click="tl.visible = !tl.visible; tl.persist()">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="16" height="16" rx="2" /><line x1="1" y1="12" x2="17" y2="12" /></svg>
    </button>
    <button class="tbtn" :title="$t('toolbar.wall') + ' (Ctrl+E)'" @click="ui.expand = true">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="11,1 17,1 17,7" /><polyline points="7,17 1,17 1,11" /><line x1="17" y1="1" x2="10" y2="8" /><line x1="1" y1="17" x2="8" y2="10" /></svg>
    </button>
    <button class="tbtn" :title="$t('toolbar.fullscreen') + ' (F11)'" @click="fullscreen">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1,6 1,1 6,1" /><polyline points="12,1 17,1 17,6" /><polyline points="17,12 17,17 12,17" /><polyline points="6,17 1,17 1,12" /></svg>
    </button>
    <button class="tbtn" :title="$t('toolbar.settings') + ' (Ctrl+,)'" @click="appSettings.show()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
    </button>
  </header>
</template>
