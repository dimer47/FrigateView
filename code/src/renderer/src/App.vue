<script setup>
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { useServerStore } from '@/stores/server'
import { useLayoutStore } from '@/stores/layouts'
import { useUiStore } from '@/stores/ui'
import ConnectScreen from '@/components/ConnectScreen.vue'
import AppToolbar from '@/components/AppToolbar.vue'
import SideBar from '@/components/SideBar.vue'
import CameraGrid from '@/components/CameraGrid.vue'
import AppToast from '@/components/AppToast.vue'
import TimelinePanel from '@/components/TimelinePanel.vue'
import EventsPanel from '@/components/EventsPanel.vue'
import EventDetail from '@/components/EventDetail.vue'
import { useEventsStore, TYPE_LABELS } from '@/stores/events'
import { useTimelineStore } from '@/stores/timeline'

const server = useServerStore()
const layouts = useLayoutStore()
const ui = useUiStore()
const tl = useTimelineStore()
const ev = useEventsStore()

onMounted(() => server.resume())

// Événements : démarrés à la connexion, arrêtés à la déconnexion
watch(() => server.status === 'ok' && server.server, (on, was) => {
  if (on && !was) ev.start(server.server, (e) => { if (e.severity === 'alert') ui.notify(`${TYPE_LABELS[e.type]} — ${server.camById(e.cam)?.name || e.cam}`, { label: 'Voir', run: () => (ev.detailId = e.id) }) })
  if (!on && server.status !== 'lost') ev.stop()
})

// Caméras supprimées côté Frigate : on les retire des layouts
watch(() => server.cameras, (cams) => { if (cams.length) layouts.prune(cams.map((c) => c.id)) })

function onKey(e) {
  if (ev.detailId) return
  if (e.key === 'Escape') {
    if (layouts.focus !== null) layouts.focus = null
    else if (ui.expand) ui.expand = false
  }
  if (e.ctrlKey && e.key === '1') { e.preventDefault(); ui.toggleSidebar() }
  if (e.ctrlKey && e.key === '2') { e.preventDefault(); ev.visible = !ev.visible; ev.persist() }
  if (e.ctrlKey && e.key === '3') { e.preventDefault(); tl.visible = !tl.visible; tl.persist() }
  if (e.target.matches?.('input, textarea, select') || e.ctrlKey || e.metaKey) return
  if (e.key === ' ') { e.preventDefault(); tl.togglePlay() }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); tl.skip(e.shiftKey ? -30 : -10) }
  else if (e.key === 'ArrowRight' && !tl.live) { e.preventDefault(); tl.skip(e.shiftKey ? 30 : 10) }
  else if (e.key.toLowerCase() === 'l') tl.goLive()
  if (e.ctrlKey && e.key.toLowerCase() === 'e') { e.preventDefault(); ui.expand = !ui.expand }
}
onMounted(() => addEventListener('keydown', onKey))
onBeforeUnmount(() => removeEventListener('keydown', onKey))
</script>

<template>
  <ConnectScreen v-if="server.needsLogin" />
  <div v-else class="flex h-full flex-col">
    <AppToolbar v-show="!ui.expand" />
    <div v-if="server.status === 'lost'" v-show="!ui.expand" class="flex items-center gap-3 bg-red-900 px-4 py-1.5 text-[13px] text-white">
      <span class="spin" />
      <span>Serveur {{ server.server.host }} injoignable depuis {{ new Date(server.lostAt).toLocaleTimeString('fr-FR') }} — nouvelle tentative toutes les 10 s. Les images affichées sont figées.</span>
      <button class="ml-auto rounded border border-white/30 bg-white/15 px-2.5 py-0.5 text-xs" @click="server.retryNow()">Réessayer maintenant</button>
    </div>
    <div v-if="server.status === 'connecting'" class="flex flex-1 items-center justify-center gap-3 text-ink-2">
      <span class="spin" /> Connexion à {{ server.server.host }}…
    </div>
    <div v-else class="flex min-h-0 flex-1">
      <SideBar v-if="ui.sidebar && !ui.expand" />
      <CameraGrid class="min-w-0 flex-1" />
      <EventsPanel v-if="ev.visible && !ui.expand" />
    </div>
    <TimelinePanel v-if="tl.visible && !ui.expand && server.status !== 'connecting'" />
    <button v-if="ui.expand" class="fixed right-2.5 top-2.5 z-50 rounded-md border border-white/25 bg-black/70 px-3.5 py-1.5 text-xs font-semibold opacity-0 transition-opacity hover:opacity-100" @click="ui.expand = false">
      Quitter le mur vidéo (Échap)
    </button>
  </div>
  <EventDetail v-if="ev.detailId" />
  <AppToast />
</template>
