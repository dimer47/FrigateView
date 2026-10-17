<script setup>
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import { useTimelineStore } from '@/stores/timeline'

const server = useServerStore()
const ui = useUiStore()
const tl = useTimelineStore()

const roleLabel = { admin: 'administrateur', viewer: 'consultation' }
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
      <span v-if="server.status === 'ok'">· {{ server.onlineCount }}/{{ server.cameras.length }} caméras en ligne</span>
      <span v-else class="font-semibold text-bad">injoignable</span>
    </div>
    <div class="flex-1" />

    <div class="flex overflow-hidden rounded-md border border-line text-xs" title="Mode d'affichage du direct">
      <button class="px-2.5 py-1" :class="ui.liveMode === 'webrtc' ? 'bg-accent text-white' : 'text-ink-2'" @click="ui.setLiveMode('webrtc')">Vidéo</button>
      <button class="border-l border-line px-2.5 py-1" :class="ui.liveMode === 'snapshot' ? 'bg-accent text-white' : 'text-ink-2'" @click="ui.setLiveMode('snapshot')">Images (1/s)</button>
    </div>
    <div class="h-[22px] w-px bg-line" />
    <div v-if="server.profile.username" class="flex items-center gap-2 text-xs text-ink-2">
      <span :title="`Rôle Frigate : ${server.profile.role}`">{{ server.profile.username }} · {{ roleLabel[server.profile.role] || server.profile.role }}</span>
      <button class="rounded border border-line px-2 py-0.5 hover:border-line-2 hover:text-ink" title="Se déconnecter du serveur Frigate" @click="server.signOut()">Déconnexion</button>
    </div>
    <div v-if="server.profile.username" class="h-[22px] w-px bg-line" />
    <button class="tbtn" :class="{ on: ui.sidebar }" title="Layouts et caméras (Ctrl+1)" @click="ui.toggleSidebar()">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="16" height="16" rx="2" /><line x1="6" y1="1" x2="6" y2="17" /></svg>
    </button>
    <button class="tbtn" :class="{ on: tl.visible }" title="Timeline (Ctrl+3)" @click="tl.visible = !tl.visible; tl.persist()">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="16" height="16" rx="2" /><line x1="1" y1="12" x2="17" y2="12" /></svg>
    </button>
    <button class="tbtn" title="Mur vidéo seul (Ctrl+E)" @click="ui.expand = true">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="11,1 17,1 17,7" /><polyline points="7,17 1,17 1,11" /><line x1="17" y1="1" x2="10" y2="8" /><line x1="1" y1="17" x2="8" y2="10" /></svg>
    </button>
    <button class="tbtn" title="Plein écran (F11)" @click="fullscreen">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1,6 1,1 6,1" /><polyline points="12,1 17,1 17,6" /><polyline points="17,12 17,17 12,17" /><polyline points="6,17 1,17 1,12" /></svg>
    </button>
  </header>
</template>
