<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
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
import { useEventsStore, typeLabel } from '@/stores/events'
import { useTimelineStore } from '@/stores/timeline'
import { useAppSettings } from '@/stores/appSettings'
import SettingsDialog from '@/components/SettingsDialog.vue'
import LayoutDialog from '@/components/LayoutDialog.vue'
import HelpDialog from '@/components/HelpDialog.vue'
import ExportDialog from '@/components/ExportDialog.vue'
import FacesDialog from '@/components/FacesDialog.vue'
import PlatesDialog from '@/components/PlatesDialog.vue'
import DownloadsPanel from '@/components/DownloadsPanel.vue'
import { useMediaStore } from '@/stores/media'
import { bestGrid } from '@/stores/layouts'
import { t, loc, setLocale } from '@/i18n'
import { resolveLang } from '../../shared/langs'
import { load, save } from '@/stores/storage'
import { useStatsStore } from '@/stores/stats'

const server = useServerStore()
const layouts = useLayoutStore()
const ui = useUiStore()
const tl = useTimelineStore()
const ev = useEventsStore()
const appSettings = useAppSettings()
const stats = useStatsStore()
const media = useMediaStore()
watch(() => ui.showStats, (on) => { on ? stats.start() : stats.stop(); server._fast = on; if (server.status === 'ok') server.startPolling(on) }, { immediate: true })

// Fenêtre « mur vidéo » ouverte sur un autre écran : grille seule, layout imposé
const params = new URLSearchParams(location.search)
const wall = params.get('wall') === '1'
if (wall) {
  ui.expand = true
  layouts.activeId = params.get('layout')
  layouts.persist = () => save('fv-layouts', layouts.layouts) // ne jamais changer le layout de la fenêtre principale
  // Mode propre au mur (vidéo ou images 1/s), sinon celui de la fenêtre principale
  const wallMode = ref(params.get('mode') || '')
  if (wallMode.value) ui.liveMode = wallMode.value
  window.native.onWallLayout(({ layout, mode }) => {
    layouts.activeId = layout
    wallMode.value = mode
    ui.liveMode = mode || load('fv-ui', {}).liveMode || 'webrtc'
  })
  // Layouts modifiés dans la fenêtre principale : rechargés ici (sans toucher au layout affiché)
  // Affichage changé dans la fenêtre principale (statistiques, mode vidéo/images) : repris ici
  addEventListener('storage', (e) => {
    if (e.key === 'fv-layouts') layouts.layouts = load('fv-layouts', [])
    if (e.key === 'fv-ui') { const u = load('fv-ui', {}); Object.assign(ui, { showStats: !!u.showStats, fit: u.fit || 'contain', liveMode: wallMode.value || u.liveMode || ui.liveMode, ...(u.statFields && { statFields: u.statFields }) }) }
  })
  // Mur ouvert avant la connexion de la fenêtre principale : nouvel essai toutes les 5 s
  // (la session est partagée, la connexion faite dans la fenêtre principale suffit)
  let since = Date.now(), last = ''
  setInterval(() => {
    if (server.status !== last) { last = server.status; since = Date.now() }
    const stuck = server.status === 'connecting' && Date.now() - since > 20000
    if (server.status !== 'auth' && server.server && !stuck) return
    since = Date.now()
    server.server = load('fv-server', null)
    if (server.server) server.resume()
  }, 5000)
}

onMounted(async () => {
  await appSettings.init()
  setLocale(resolveLang(appSettings.s.lang, appSettings.s.systemLocale))
  server.resume()
  if (!wall) window.native.onNotificationClick((id) => { if (id) ev.detailId = id })
})

// Nouvel événement : notification Windows si la fenêtre n'est pas au premier plan, sinon message dans l'application
async function onNewEvent(e) {
  const s = appSettings.s
  const title = `${typeLabel(e.type)} — ${server.camById(e.cam)?.name || e.cam}`
  const body = [new Date(e.s).toLocaleTimeString(loc()), e.zones[0]?.replace(/_/g, ' '), ...e.subLabels].filter(Boolean).join(' · ')
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

watch(() => appSettings.s?.lang, (l) => appSettings.s && setLocale(resolveLang(l, appSettings.s.systemLocale)))

/* ---------- Menu de l'application ---------- */
const MENU = {
  'layout:new': () => (ui.layoutDialog = null),
  'layout:edit': () => layouts.activeId && (ui.layoutDialog = layouts.activeId),
  'layout:apply': (id) => layouts.apply(id),
  'layout:step': (d) => { const L = layouts.layouts, i = L.findIndex((l) => l.id === layouts.activeId); if (L.length) layouts.apply(L[(i + d + L.length) % L.length].id) },
  'layout:auto': () => { const ids = server.cameras.map((c) => c.id); layouts.create(t('layouts.allCameras'), bestGrid(ids.length), ids) },
  settings: (tab) => appSettings.show(tab),
  'server:change': () => server.changeServer(),
  'server:signout': () => server.signOut(),
  'toggle:sidebar': () => ui.toggleSidebar(),
  'toggle:events': () => { ev.visible = !ev.visible; ev.persist() },
  'toggle:timeline': () => { tl.visible = !tl.visible; tl.persist() },
  'toggle:expand': () => (ui.expand = !ui.expand),
  'toggle:stats': () => ui.toggleStats(),
  livemode: (m) => ui.setLiveMode(m),
  'play:toggle': () => tl.togglePlay(),
  'play:live': () => tl.goLive(),
  'play:skip': (s) => tl.skip(s),
  'play:speed': (d) => tl.setSpeed(d),
  'play:sync': () => tl.toggleSync(),
  'play:ago': (m) => tl.seek(Date.now() - m * 60e3, null, true),
  'events:seen': () => ev.markAllSeen(),
  'faces:open': () => (ui.facesOpen = true),
  'plates:open': () => (ui.platesOpen = true),
  help: () => (ui.helpOpen = true),
  'media:capture': () => { const c = layouts.active?.cells[layouts.selected]; if (c) media.capture(c) },
  'media:export': () => {
    const end = tl.live ? Date.now() : Math.min(Date.now(), tl.time + 30e3), c = layouts.active?.cells[layouts.selected]
    media.openExport({ cams: c ? [c] : [], start: end - 60e3, end })
  },
  'media:mute': () => { const c = layouts.active?.cells[layouts.selected]; if (c) media.toggleAudio(c) }
}
if (!wall) {
  window.native.onMenu(({ cmd, arg }) => MENU[cmd]?.(arg))
  // État renvoyé au menu (coches, liste des layouts, entrées actives)
  watch(() => ({
    connected: server.status === 'ok' || server.status === 'lost',
    hasServer: !!server.server,
    layouts: layouts.layouts.map((l) => ({ id: l.id, name: l.name })),
    activeLayout: layouts.activeId,
    sidebar: ui.sidebar, stats: ui.showStats, events: ev.visible, timeline: tl.visible, expand: ui.expand, liveMode: ui.liveMode,
    live: tl.live, playing: tl.playing, sync: tl.sync, unseen: ev.unseenCount, version: server.version
  }), (st) => window.native.setMenuState(JSON.parse(JSON.stringify(st))), { immediate: true, deep: true })
}

// État affiché sur l'icône de la zone de notification
watch(() => [server.status, server.onlineCount, server.cameras.length], () => {
  if (wall) return
  window.native.setTrayStatus(server.status === 'ok' ? t('toolbar.online', { n: server.onlineCount, total: server.cameras.length }) : server.status === 'lost' ? t('app.serverUnreachable') : '')
})

// Caméras supprimées côté Frigate : on les retire des layouts
watch(() => server.cameras, (cams) => { if (cams.length) layouts.prune(cams.map((c) => c.id)) })

function onKey(e) {
  if (wall || ev.detailId || appSettings.open || ui.helpOpen || ui.facesOpen || ui.platesOpen || media.exportOpen || ui.layoutDialog !== undefined) { if (e.key === 'Escape') ui.helpOpen = false; return }
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
    {{ server.status === 'connecting' ? $t('app.connecting') : $t('app.wallSignIn') }}
  </div>
  <div v-else-if="wall" class="h-full"><CameraGrid class="size-full" /></div>
  <ConnectScreen v-else-if="server.needsLogin" />
  <div v-else class="flex h-full flex-col">
    <AppToolbar v-show="!ui.expand" />
    <div v-if="server.status === 'lost'" v-show="!ui.expand" class="flex items-center gap-3 bg-red-900 px-4 py-1.5 text-[13px] text-white">
      <span class="spin" />
      <span>{{ $t('app.lostBanner', { host: server.server.host, time: new Date(server.lostAt).toLocaleTimeString(loc()) }) }}</span>
      <button class="ml-auto rounded border border-white/30 bg-white/15 px-2.5 py-0.5 text-xs" @click="server.retryNow()">{{ $t('app.retryNow') }}</button>
    </div>
    <div v-if="server.status === 'connecting'" class="flex flex-1 items-center justify-center gap-3 text-ink-2">
      <span class="spin" /> {{ $t('connect.connecting', { host: server.server.host }) }}
    </div>
    <div v-else class="flex min-h-0 flex-1">
      <SideBar v-if="ui.sidebar && !ui.expand" />
      <CameraGrid class="min-w-0 flex-1" />
      <EventsPanel v-if="ev.visible && !ui.expand" />
    </div>
    <TimelinePanel v-if="tl.visible && !ui.expand && server.status !== 'connecting'" />
    <button v-if="ui.expand && !wall" class="fixed right-2.5 top-2.5 z-50 rounded-md border border-white/25 bg-black/70 px-3.5 py-1.5 text-xs font-semibold opacity-0 transition-opacity hover:opacity-100" @click="ui.expand = false">
      {{ $t('app.exitWall') }}
    </button>
  </div>
  <EventDetail v-if="ev.detailId" />
  <SettingsDialog v-if="appSettings.open && appSettings.s" />
  <LayoutDialog v-if="ui.layoutDialog !== undefined && !wall" :layout-id="ui.layoutDialog" @close="ui.layoutDialog = undefined" />
  <HelpDialog v-if="ui.helpOpen" />
  <ExportDialog v-if="media.exportOpen && !wall" />
  <FacesDialog v-if="ui.facesOpen && !wall && server.status === 'ok'" />
  <PlatesDialog v-if="ui.platesOpen && !wall && server.status === 'ok'" />
  <DownloadsPanel v-if="!wall" />
  <AppToast />
</template>
