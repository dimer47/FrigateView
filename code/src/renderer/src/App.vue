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
import { useAppSettings } from '@/stores/appSettings'
import SettingsDialog from '@/components/SettingsDialog.vue'
import LayoutDialog from '@/components/LayoutDialog.vue'
import HelpDialog from '@/components/HelpDialog.vue'
import { bestGrid } from '@/stores/layouts'
import { load, save } from '@/stores/storage'

const server = useServerStore()
const layouts = useLayoutStore()
const ui = useUiStore()
const tl = useTimelineStore()
const ev = useEventsStore()
const appSettings = useAppSettings()

// Fenêtre « mur vidéo » ouverte sur un autre écran : grille seule, layout imposé
const params = new URLSearchParams(location.search)
const wall = params.get('wall') === '1'
if (wall) {
  ui.expand = true
  layouts.activeId = params.get('layout')
  layouts.persist = () => save('fv-layouts', layouts.layouts) // ne jamais changer le layout de la fenêtre principale
  window.native.onWallLayout((id) => (layouts.activeId = id))
  // Layouts modifiés dans la fenêtre principale : rechargés ici (sans toucher au layout affiché)
  addEventListener('storage', (e) => { if (e.key === 'fv-layouts') layouts.layouts = load('fv-layouts', []) })
}

onMounted(async () => {
  await appSettings.init()
  server.resume()
  if (!wall) window.native.onNotificationClick((id) => { if (id) ev.detailId = id })
})

// Nouvel événement : notification Windows si la fenêtre n'est pas au premier plan, sinon message dans l'application
async function onNewEvent(e) {
  const s = appSettings.s
  const title = `${TYPE_LABELS[e.type]} — ${server.camById(e.cam)?.name || e.cam}`
  const body = [new Date(e.s).toLocaleTimeString('fr-FR'), e.zones[0]?.replace(/_/g, ' '), ...e.subLabels].filter(Boolean).join(' · ')
  const wanted = s?.notify && s.notifyTypes[e.type] && !s.dnd
  if (await window.native.isFocused()) { if (e.severity === 'alert' || wanted) ui.notify(title, { label: 'Voir', run: () => (ev.detailId = e.id) }) }
  else if (wanted) window.native.notify({ title, body, id: e.id })
}

// Événements : démarrés à la connexion, arrêtés à la déconnexion (fenêtre principale seulement)
watch(() => server.status === 'ok' && server.server, (on, was) => {
  if (wall) return
  if (on && !was) ev.start(server.server, onNewEvent)
  if (!on && server.status !== 'lost') ev.stop()
})

/* ---------- Menu de l'application ---------- */
const MENU = {
  'layout:new': () => (ui.layoutDialog = null),
  'layout:edit': () => layouts.activeId && (ui.layoutDialog = layouts.activeId),
  'layout:apply': (id) => layouts.apply(id),
  'layout:step': (d) => { const L = layouts.layouts, i = L.findIndex((l) => l.id === layouts.activeId); if (L.length) layouts.apply(L[(i + d + L.length) % L.length].id) },
  'layout:auto': () => { const ids = server.cameras.map((c) => c.id); layouts.create('Toutes les caméras', bestGrid(ids.length), ids) },
  settings: (tab) => appSettings.show(tab),
  'server:change': () => server.changeServer(),
  'server:signout': () => server.signOut(),
  'toggle:sidebar': () => ui.toggleSidebar(),
  'toggle:events': () => { ev.visible = !ev.visible; ev.persist() },
  'toggle:timeline': () => { tl.visible = !tl.visible; tl.persist() },
  'toggle:expand': () => (ui.expand = !ui.expand),
  livemode: (m) => ui.setLiveMode(m),
  'play:toggle': () => tl.togglePlay(),
  'play:live': () => tl.goLive(),
  'play:skip': (s) => tl.skip(s),
  'play:speed': (d) => tl.setSpeed(d),
  'play:sync': () => tl.toggleSync(),
  'play:ago': (m) => tl.seek(Date.now() - m * 60e3, null, true),
  'events:seen': () => ev.markAllSeen(),
  help: () => (ui.helpOpen = true)
}
if (!wall) {
  window.native.onMenu(({ cmd, arg }) => MENU[cmd]?.(arg))
  // État renvoyé au menu (coches, liste des layouts, entrées actives)
  watch(() => ({
    connected: server.status === 'ok' || server.status === 'lost',
    layouts: layouts.layouts.map((l) => ({ id: l.id, name: l.name })),
    activeLayout: layouts.activeId,
    sidebar: ui.sidebar, events: ev.visible, timeline: tl.visible, expand: ui.expand, liveMode: ui.liveMode,
    live: tl.live, playing: tl.playing, sync: tl.sync, unseen: ev.unseenCount, version: server.version
  }), (st) => window.native.setMenuState(JSON.parse(JSON.stringify(st))), { immediate: true, deep: true })
}

// État affiché sur l'icône de la zone de notification
watch(() => [server.status, server.onlineCount, server.cameras.length], () => {
  if (wall) return
  window.native.setTrayStatus(server.status === 'ok' ? `${server.onlineCount}/${server.cameras.length} caméras` : server.status === 'lost' ? 'serveur injoignable' : '')
})

// Caméras supprimées côté Frigate : on les retire des layouts
watch(() => server.cameras, (cams) => { if (cams.length) layouts.prune(cams.map((c) => c.id)) })

function onKey(e) {
  if (wall || ev.detailId || appSettings.open || ui.helpOpen || ui.layoutDialog !== undefined) { if (e.key === 'Escape') ui.helpOpen = false; return }
  if (e.ctrlKey && e.key === ',') { e.preventDefault(); appSettings.show(); return }
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
  <div v-if="wall && (server.needsLogin || server.status === 'connecting')" class="flex h-full items-center justify-center text-[15px] text-ink-2">
    {{ server.status === 'connecting' ? 'Connexion…' : 'Connectez-vous dans la fenêtre principale de FrigateView.' }}
  </div>
  <div v-else-if="wall" class="h-full"><CameraGrid class="size-full" /></div>
  <ConnectScreen v-else-if="server.needsLogin" />
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
    <button v-if="ui.expand && !wall" class="fixed right-2.5 top-2.5 z-50 rounded-md border border-white/25 bg-black/70 px-3.5 py-1.5 text-xs font-semibold opacity-0 transition-opacity hover:opacity-100" @click="ui.expand = false">
      Quitter le mur vidéo (Échap)
    </button>
  </div>
  <EventDetail v-if="ev.detailId" />
  <SettingsDialog v-if="appSettings.open && appSettings.s" />
  <LayoutDialog v-if="ui.layoutDialog !== undefined && !wall" :layout-id="ui.layoutDialog" @close="ui.layoutDialog = undefined" />
  <HelpDialog v-if="ui.helpOpen" />
  <AppToast />
</template>
