<script setup>
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import { useTimelineStore } from '@/stores/timeline'
import { useEventsStore } from '@/stores/events'
import { useAppSettings } from '@/stores/appSettings'
import { useStatsStore, fmtRate } from '@/stores/stats'
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
const roleName = computed(() => { const r = server.profile.role; return t('roles.' + r) !== 'roles.' + r ? t('roles.' + r) : r })

function fullscreen() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() }
</script>

<template>
  <header class="flex h-[46px] shrink-0 items-center gap-2.5 overflow-hidden whitespace-nowrap border-b border-line bg-panel px-3.5">
    <div class="flex shrink-0 items-center gap-2 text-lg font-bold text-accent">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
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
    <div v-if="ui.showStats" class="flex h-[30px] shrink-0 items-center divide-x divide-line rounded-md border border-line font-mono text-[11px] text-ink-2">
      <span class="px-2" :title="$t('stats.totalTitle')">↓ {{ fmtRate(stats.totalKbps, loc()) }}</span>
      <template v-if="m">
        <span class="px-2" :title="$t('stats.appTitle') + '\n' + $t('stats.mb', { n: num(m.appMem / 1e6) })">{{ $t('stats.app') }} {{ pct(m.appCpu, 1) }}</span>
        <span class="px-2" :title="$t('stats.pcTitle') + '\n' + $t('stats.gbOf', { n: num(m.sysMemUsed / 1e9, 1), total: num(m.sysMemTotal / 1e9, 1) })">{{ $t('stats.pc') }} {{ pct(m.sysCpu) }}</span>
      </template>
    </div>
    <div class="h-[22px] w-px shrink-0 bg-line" />
    <button v-if="server.profile.username" class="flex shrink-0 items-center gap-2 rounded-full py-0.5 pl-0.5 text-xs text-ink-2 hover:bg-raised hover:text-ink" :class="ui.showUser ? 'pr-2.5' : 'pr-0.5'"
      :title="`${server.profile.username} · ${roleName} — ${ui.showUser ? $t('toolbar.hideUser') : $t('toolbar.showUser')}`" @click="ui.toggleUser()">
      <span class="flex size-[26px] items-center justify-center rounded-full bg-accent/20 text-[12px] font-bold uppercase text-accent">{{ server.profile.username[0] }}</span>
      <span v-if="ui.showUser">{{ server.profile.username }} · {{ roleName }}</span>
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
