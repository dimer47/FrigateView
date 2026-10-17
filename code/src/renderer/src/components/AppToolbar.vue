<script setup>
import logo from '../assets/logo.png'
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import { useTimelineStore } from '@/stores/timeline'
import { useEventsStore } from '@/stores/events'
import { useAppSettings } from '@/stores/appSettings'
import { useStatsStore, fmtRate, serverSummary } from '@/stores/stats'
import { computed } from 'vue'
import { loc, t } from '@/i18n'

const server = useServerStore()
const ui = useUiStore()
const tl = useTimelineStore()
const ev = useEventsStore()
const appSettings = useAppSettings()
const stats = useStatsStore()
const num = (v, d = 0) => v.toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (v, d = 0) => (v == null ? '—' : `${num(v, d)} %`)
const m = computed(() => stats.metrics)
// Segments des statistiques, selon les éléments cochés dans les réglages
const statGroups = computed(() => {
  const f = ui.statFields.global, mm = stats.metrics, s = serverSummary(server.stats), out = []
  const seg = (on, text, title) => (on ? [{ text, title }] : [])
  if (f.total) out.push({ items: seg(true, `↓ ${fmtRate(stats.totalKbps, loc())}`, t('stats.totalTitle')) })
  if (mm) {
    out.push({ label: t('stats.app'), title: t('stats.appTitle'), items: [...seg(f.appCpu, pct(mm.appCpu, 1), t('stats.cpuTitle')), ...seg(f.appMem, t('stats.mb', { n: num(mm.appMem / 1e6) }), t('stats.memTitle'))] })
    out.push({ label: t('stats.pc'), title: t('stats.pcTitle'), items: [...seg(f.pcCpu, pct(mm.sysCpu), t('stats.cpuTitle')), ...seg(f.pcMem, t('stats.gbOf', { n: num(mm.sysMemUsed / 1e9, 1), total: num(mm.sysMemTotal / 1e9, 1) }), t('stats.memTitle'))] })
  }
  if (s) {
    out.push({ label: 'Frigate', title: t('stats.srvTitle'), items: [
      ...seg(f.srvCpu && s.cpu != null, pct(s.cpu), t('stats.srvCpuTitle')),
      ...seg(f.srvMem && s.mem != null, `${t('stats.mem')} ${pct(s.mem)}`, t('stats.srvMemTitle')),
      ...seg(f.srvGo2rtc && s.go2rtc != null, `go2rtc ${pct(s.go2rtc)}`, t('stats.go2rtcTitle')),
      ...seg(f.srvRecord && s.record != null, `${t('stats.record')} ${pct(s.record)}`, t('stats.recordTitle')),
      ...seg(f.srvStorage && s.storageUsed != null, `${t('stats.disk')} ${t('stats.gbOf', { n: num(s.storageUsed), total: num(s.storageTotal) })}`, t('stats.diskTitle')),
      ...seg(f.srvDetector && s.inference != null, `${t('stats.detector')} ${num(s.inference)} ms`, t('stats.detectorTitle')),
      ...seg(f.srvUptime && s.uptime != null, `⏱ ${t('stats.uptimeVal', { h: Math.floor(s.uptime / 3600), m: Math.floor((s.uptime % 3600) / 60) })}`, t('stats.uptimeTitle'))
    ] })
  }
  return out.filter((g) => g.items.length)
})
const diskFull = computed(() => { const s = serverSummary(server.stats); return s?.storageUsed && s.storageUsed / s.storageTotal > 0.9 })
const roleName = computed(() => { const r = server.profile.role; return t('roles.' + r) !== 'roles.' + r ? t('roles.' + r) : r })

function fullscreen() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() }
</script>

<template>
  <header class="flex h-[46px] shrink-0 items-center gap-2.5 overflow-hidden whitespace-nowrap border-b border-line bg-panel px-3.5">
    <div class="flex shrink-0 items-center gap-2 text-lg font-bold text-accent">
      <img :src="logo" alt="" width="22" height="22" draggable="false">
      FrigateView
    </div>
    <div class="h-[22px] w-px shrink-0 bg-line" />
    <button class="flex min-w-0 items-center gap-2 rounded px-1.5 py-0.5 text-[13px] text-ink-2 hover:bg-raised hover:text-ink" :title="$t('toolbar.serverTitle', { version: server.version || '?' })" @click="appSettings.show('server')">
      <span class="size-[9px] shrink-0 rounded-full" :class="server.status === 'ok' ? 'bg-ok' : 'bg-bad'" />
      <span class="shrink-0">{{ server.server.host }}</span>
      <span v-if="server.status === 'ok'" class="truncate">· {{ $t('toolbar.online', { n: server.onlineCount, total: server.cameras.length }) }}</span>
      <span v-else class="font-semibold text-bad">{{ $t('toolbar.unreachable') }}</span>
    </button>
    <div class="flex-1" />

    <div class="flex shrink-0 overflow-hidden rounded-md border border-line text-xs" :title="$t('toolbar.liveMode')">
      <button class="px-2.5 py-1" :class="ui.liveMode === 'webrtc' ? 'bg-accent text-white' : 'text-ink-2'" @click="ui.setLiveMode('webrtc')">{{ $t('toolbar.video') }}</button>
      <button class="border-l border-line px-2.5 py-1" :class="ui.liveMode === 'snapshot' ? 'bg-accent text-white' : 'text-ink-2'" @click="ui.setLiveMode('snapshot')">{{ $t('toolbar.images') }}</button>
    </div>
    <div v-if="ui.showStats && statGroups.length" class="flex h-[30px] min-w-0 shrink items-center divide-x divide-line overflow-hidden rounded-md border border-line font-mono text-[11px] text-ink-2">
      <span v-for="(g, i) in statGroups" :key="i" class="flex items-center gap-1.5 px-2" :title="g.title">
        <b v-if="g.label" class="font-sans font-semibold text-ink-3">{{ g.label }}</b>
        <span v-for="(it, j) in g.items" :key="j" :title="it.title" :class="{ 'text-warn': g.label === 'Frigate' && it.title === $t('stats.diskTitle') && diskFull }">{{ it.text }}</span>
      </span>
    </div>
    <div class="h-[22px] w-px shrink-0 bg-line" />
    <button v-if="server.profile.username" class="flex shrink-0 items-center gap-2 rounded-full py-0.5 pl-0.5 text-xs text-ink-2 hover:bg-raised hover:text-ink" :class="ui.showUser ? 'pr-2.5' : 'pr-0.5'"
      :title="`${server.profile.username} · ${roleName} — ${ui.showUser ? $t('toolbar.hideUser') : $t('toolbar.showUser')}`" @click="ui.toggleUser()">
      <span class="flex size-[26px] items-center justify-center rounded-full bg-accent/20 text-[12px] font-bold uppercase text-accent">{{ server.profile.username[0] }}</span>
      <span v-if="ui.showUser">{{ server.profile.username }} · {{ roleName }}</span>
    </button>
    <button class="tbtn shrink-0" :class="{ on: ui.cover }" :title="ui.cover ? $t('fit.cover') : $t('fit.contain')" @click="ui.toggleCover()">
      <svg v-if="ui.cover" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="3.5" width="15" height="11" rx="1.5" /><path d="M5 6.5V5h1.5M13 6.5V5h-1.5M5 11.5V13h1.5M13 11.5V13h-1.5" /></svg>
      <svg v-else width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="3.5" width="15" height="11" rx="1.5" /><rect x="5" y="6" width="8" height="6" rx=".5" /></svg>
    </button>
    <button class="tbtn shrink-0" :class="{ on: ui.showStats }" :title="$t('stats.toggle')" @click="ui.toggleStats()">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 14l4-5 3 3 4-6 5 5" /><line x1="1" y1="17" x2="17" y2="17" /></svg>
    </button>
    <div class="h-[22px] w-px shrink-0 bg-line" />
    <button class="tbtn shrink-0" :class="{ on: ui.sidebar }" :title="$t('toolbar.sidebar') + ' (Ctrl+1)'" @click="ui.toggleSidebar()">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="16" height="16" rx="2" /><line x1="6" y1="1" x2="6" y2="17" /></svg>
    </button>
    <button class="tbtn relative shrink-0" :class="{ on: ev.visible }" :title="$t('toolbar.events') + ' (Ctrl+2)'" @click="ev.visible = !ev.visible; ev.persist()">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="16" height="16" rx="2" /><line x1="12" y1="1" x2="12" y2="17" /></svg>
      <span v-if="ev.unseenCount" class="absolute -right-1.5 -top-1 min-w-[15px] rounded-lg bg-accent px-1 text-center text-[10px] font-bold leading-[15px] text-white">{{ ev.unseenCount > 99 ? '99+' : ev.unseenCount }}</span>
    </button>
    <button class="tbtn shrink-0" :class="{ on: tl.visible }" :title="$t('toolbar.timeline') + ' (Ctrl+3)'" @click="tl.visible = !tl.visible; tl.persist()">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="16" height="16" rx="2" /><line x1="1" y1="12" x2="17" y2="12" /></svg>
    </button>
    <button class="tbtn shrink-0" :title="$t('toolbar.wall') + ' (Ctrl+E)'" @click="ui.expand = true">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="11,1 17,1 17,7" /><polyline points="7,17 1,17 1,11" /><line x1="17" y1="1" x2="10" y2="8" /><line x1="1" y1="17" x2="8" y2="10" /></svg>
    </button>
    <button class="tbtn shrink-0" :title="$t('toolbar.fullscreen') + ' (F11)'" @click="fullscreen">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1,6 1,1 6,1" /><polyline points="12,1 17,1 17,6" /><polyline points="17,12 17,17 12,17" /><polyline points="6,17 1,17 1,12" /></svg>
    </button>
    <button class="tbtn shrink-0" :title="$t('toolbar.settings') + ' (Ctrl+,)'" @click="appSettings.show()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
    </button>
  </header>
</template>
