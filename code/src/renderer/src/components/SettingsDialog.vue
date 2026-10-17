<script setup>
import { ref, onMounted } from 'vue'
import { useAppSettings } from '@/stores/appSettings'
import { useLayoutStore } from '@/stores/layouts'
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import { TYPE_KEYS, typeLabel } from '@/stores/events'
import { t, loc, LANGS } from '@/i18n'
import { isInternal } from '@/services/frigate'

const app = useAppSettings()
const layouts = useLayoutStore()
const server = useServerStore()
const ui = useUiStore()

const TABS = ['general', 'notif', 'screens', 'startup', 'server']
const screens = ref([])
const screenConf = ref({})

onMounted(async () => {
  screens.value = await window.native.listScreens()
  screenConf.value = JSON.parse(JSON.stringify(app.s.screens || {}))
  for (const d of screens.value) screenConf.value[d.id] ||= { enabled: false, layout: layouts.layouts[0]?.id || '' }
})

const setType = (k, v) => app.set({ notifyTypes: { ...app.s.notifyTypes, [k]: v } })
async function applyScreens() {
  await window.native.applyScreens(screenConf.value)
  const n = Object.values(screenConf.value).filter((c) => c.enabled).length
  ui.notify(n ? t('settings.wallsOpened', { n }, n) : t('settings.wallsClosed'))
}
function testNotif() { window.native.notify({ title: t('settings.testNotifTitle'), body: `${new Date().toLocaleTimeString(loc())} · ${t('settings.testNotifBody')}`, id: null }) }
const identify = () => window.native.identifyScreens()
const close = () => (app.open = false)
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/55" @mousedown.self="close" @keydown.esc="close">
    <div class="flex h-[540px] w-[820px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-xl border border-line-2 bg-modal shadow-2xl" role="dialog" aria-modal="true">
      <header class="flex items-center border-b border-line px-5 py-3">
        <h2 class="text-[15px] font-bold">{{ $t('toolbar.settings') }}</h2>
        <button class="ml-auto flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-bad/15 hover:text-bad" :title="$t('common.closeEsc')" @click="close">
          <svg width="13" height="13" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.7" /></svg>
        </button>
      </header>
      <div class="grid min-h-0 flex-1 grid-cols-[180px_1fr]">
        <nav class="flex flex-col gap-0.5 border-r border-line p-2">
          <button v-for="k in TABS" :key="k" class="rounded-md px-2.5 py-2 text-left text-[13px]" :class="app.tab === k ? 'bg-accent/15 font-semibold text-accent' : 'text-ink-2 hover:bg-raised hover:text-ink'" @click="app.tab = k">{{ $t('settings.tabs.' + k) }}</button>
        </nav>
        <div class="overflow-y-auto px-5 py-4 text-[13px]">
          <!-- Général -->
          <template v-if="app.tab === 'general'">
            <h3 class="mb-1.5 font-semibold">{{ $t('settings.language') }}</h3>
            <label class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>{{ $t('settings.languageLabel') }}<small class="block text-xs text-ink-3">{{ $t('settings.languageHint') }}</small></span>
              <select class="input !w-56" :value="app.s.lang || ''" @change="app.set({ lang: $event.target.value || null })">
                <option value="">{{ $t('settings.systemLanguage') }}</option>
                <option v-for="l in LANGS" :key="l.code" :value="l.code">{{ l.name }}</option>
              </select>
            </label>
          </template>

          <!-- Notifications -->
          <template v-else-if="app.tab === 'notif'">
            <h3 class="mb-1.5 font-semibold">{{ $t('settings.notifTitle') }}</h3>
            <label class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>{{ $t('settings.notify') }}<small class="block text-xs text-ink-3">{{ $t('settings.notifyHint') }}</small></span><input type="checkbox" class="size-4 accent-accent" :checked="app.s.notify" @change="app.set({ notify: $event.target.checked })"></label>
            <label v-for="k in TYPE_KEYS" :key="k" class="flex items-center justify-between gap-3 border-b border-line py-2.5 pl-4" :class="{ 'opacity-40': !app.s.notify }"><span>{{ typeLabel(k) }}</span><input type="checkbox" class="size-4 accent-accent" :disabled="!app.s.notify" :checked="app.s.notifyTypes[k]" @change="setType(k, $event.target.checked)"></label>
            <label class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>{{ $t('settings.sound') }}</span><input type="checkbox" class="size-4 accent-accent" :checked="app.s.notifySound" @change="app.set({ notifySound: $event.target.checked })"></label>
            <label class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>{{ $t('settings.dnd') }}<small class="block text-xs text-ink-3">{{ $t('settings.dndHint') }}</small></span><input type="checkbox" class="size-4 accent-accent" :checked="app.s.dnd" @change="app.set({ dnd: $event.target.checked })"></label>
            <button class="btn mt-4" @click="testNotif">{{ $t('settings.testNotif') }}</button>
          </template>

          <!-- Écrans -->
          <template v-else-if="app.tab === 'screens'">
            <h3 class="mb-1 font-semibold">{{ $t('settings.wallsTitle') }}</h3>
            <p class="mb-3 text-xs text-ink-3">{{ $t('settings.wallsHint') }}</p>
            <div class="mb-3 flex items-end gap-3">
              <div v-for="d in screens" :key="d.id" class="flex flex-col items-center justify-center rounded-md border-2 text-[11px]"
                :class="d.current ? 'border-accent bg-accent/15 text-accent' : screenConf[d.id]?.enabled ? 'border-ok/60 text-ink' : 'border-line-2 text-ink-3'"
                :style="{ width: Math.round(d.width / 14) + 'px', height: Math.round(d.height / 14) + 'px' }">
                <b class="text-xl">{{ d.index }}</b>{{ d.width }}×{{ d.height }}
              </div>
            </div>
            <button class="btn mb-3" @click="identify">{{ $t('settings.identify') }}</button>
            <div v-for="d in screens" :key="d.id" class="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <span>{{ $t('settings.screenN', { n: d.index }) }}<small class="block text-xs text-ink-3">{{ d.current ? $t('settings.mainWindow') : d.primary ? $t('settings.primary') : $t('settings.secondary') }}</small></span>
              <span v-if="!d.current" class="flex items-center gap-2">
                <select v-model="screenConf[d.id].layout" class="input !w-44" :disabled="!screenConf[d.id].enabled">
                  <option v-for="l in layouts.layouts" :key="l.id" :value="l.id">{{ l.name }}</option>
                </select>
                <label class="flex items-center gap-1.5 text-xs"><input v-model="screenConf[d.id].enabled" type="checkbox" class="size-4 accent-accent">{{ $t('settings.wall') }}</label>
              </span>
              <span v-else class="text-xs text-ink-3">—</span>
            </div>
            <p v-if="screens.length < 2" class="mt-3 text-xs text-ink-3">{{ $t('settings.oneScreen') }}</p>
            <button class="btn btn-primary mt-4" :disabled="screens.length < 2" @click="applyScreens">{{ $t('settings.apply') }}</button>
          </template>

          <!-- Démarrage -->
          <template v-else-if="app.tab === 'startup'">
            <h3 class="mb-1.5 font-semibold">{{ $t('settings.startupTitle') }}</h3>
            <label class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>{{ $t('settings.startAtLogin') }}<small class="block text-xs text-ink-3">{{ $t('settings.startAtLoginHint') }}</small></span><input type="checkbox" class="size-4 accent-accent" :checked="app.s.startAtLogin" @change="app.set({ startAtLogin: $event.target.checked })"></label>
            <label class="flex items-center justify-between gap-3 border-b border-line py-2.5" :class="{ 'opacity-40': !app.s.startAtLogin }"><span>{{ $t('settings.startHidden') }}</span><input type="checkbox" class="size-4 accent-accent" :disabled="!app.s.startAtLogin" :checked="app.s.startHidden" @change="app.set({ startHidden: $event.target.checked })"></label>
            <label class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>{{ $t('settings.closeToTray') }}<small class="block text-xs text-ink-3">{{ $t('settings.closeToTrayHint') }}</small></span><input type="checkbox" class="size-4 accent-accent" :checked="app.s.closeToTray" @change="app.set({ closeToTray: $event.target.checked })"></label>
          </template>

          <!-- Serveur -->
          <template v-else>
            <h3 class="mb-1.5 font-semibold">{{ $t('settings.serverTitle') }}</h3>
            <p v-if="!server.server" class="py-2.5 text-ink-3">{{ $t('settings.noServer') }}</p>
            <template v-else>
            <div class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>{{ server.server.host }}:{{ server.server.port }}<small class="block text-xs text-ink-3">Frigate {{ server.version }} · {{ $t('timeline.cameras', { n: server.cameras.length }, server.cameras.length) }} · {{ isInternal(server.server) ? $t('settings.modeLocal') : $t('settings.modeSecure') }}</small></span><span :class="server.status === 'ok' ? 'text-ok' : 'text-bad'">{{ server.status === 'ok' ? $t('settings.connected') : $t('settings.unreachable') }}</span></div>
            <div v-if="server.profile.username" class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>{{ $t('settings.account') }}<small class="block text-xs text-ink-3">{{ $t('settings.accountHint') }}</small></span><span>{{ server.profile.username }} · {{ server.profile.role }}</span></div>
            <div class="mt-4 flex gap-2"><button class="btn" @click="close(); server.signOut()">{{ $t('settings.signOut') }}</button><button class="btn" @click="close(); server.changeServer()">{{ $t('settings.changeServer') }}</button></div>
            </template>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
