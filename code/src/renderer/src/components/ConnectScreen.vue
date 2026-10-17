<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useServerStore } from '@/stores/server'
import { useLayoutStore, bestGrid } from '@/stores/layouts'
import { t } from '@/i18n'
import { useAppSettings } from '@/stores/appSettings'
const appSettings = useAppSettings()

const server = useServerStore()
const layouts = useLayoutStore()

const prev = server.server
const host = ref(prev?.host || '')
const PORTS = { secure: '8971', local: '5000' }
const mode = ref(prev?.mode || (String(prev?.port) === '5000' ? 'local' : 'secure'))
const port = ref(String(prev?.port || PORTS[mode.value]))
// Changer de mode remet le port habituel, sauf s'il a été personnalisé
function setMode(m) {
  if (port.value === PORTS[mode.value]) port.value = PORTS[m]
  mode.value = m
  state.value = 'idle'
}
const user = ref(prev?.user || '')
const password = ref('')
const remember = ref(true)
const state = ref('idle') // idle | busy | error | cert
const error = ref(null)
const firstInput = ref(null)
const passInput = ref(null)

const internal = computed(() => mode.value === 'local')
// Reconnexion au même serveur : seuls les identifiants sont demandés (désactivé par « Changer de serveur »)
const reconnecting = ref(!!prev && server.status === 'auth')
const canGo = computed(() => host.value.trim() && /^\d+$/.test(port.value.trim()) && (internal.value || (user.value.trim() && password.value)))

onMounted(() => (reconnecting.value && user.value ? passInput : firstInput).value?.focus())

async function go() {
  if (!canGo.value || state.value === 'busy') return
  state.value = 'busy'
  try {
    await server.connect({ mode: mode.value, host: host.value.trim(), port: port.value.trim(), user: user.value.trim(), password: password.value, remember: remember.value })
    // Premier lancement : un layout avec toutes les caméras, pour voir tout de suite les images
    if (!layouts.layouts.length && server.cameras.length) {
      const ids = server.cameras.map((c) => c.id)
      layouts.create(t('layouts.allCameras'), bestGrid(ids.length), ids)
    }
  } catch (e) {
    error.value = e
    state.value = e.code === 'cert' && e.cert ? 'cert' : 'error'
    if (e.code === 'login') { password.value = ''; passInput.value?.focus() }
  }
}

async function trust() {
  await window.native.trustCert(host.value.trim(), error.value.cert.fingerprint)
  state.value = 'idle'
  go()
}

async function changeServer() {
  await server.changeServer()
  reconnecting.value = false
  state.value = 'idle'
  host.value = ''
  user.value = ''
  password.value = ''
  await nextTick()
  firstInput.value?.focus()
}
const fp = (f) => (f || '').replace(/^sha256\//, '')
</script>

<template>
  <div class="relative flex h-full items-center justify-center" style="background: radial-gradient(ellipse at 50% 30%, #1c2a40, #0b111b 70%)">
    <button type="button" class="tbtn absolute right-3 top-3" :title="$t('toolbar.settings')" @click="appSettings.show('general')">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
    </button>
    <form class="w-[460px] rounded-2xl border border-line-2 bg-modal p-7 shadow-2xl" @submit.prevent="go">
      <div class="mb-1 flex items-center gap-2 text-[22px] font-bold text-accent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
        FrigateView
      </div>
      <p class="mb-5 text-[13px] leading-relaxed text-ink-2">
        <template v-if="reconnecting">{{ server.authReason ? $t(server.authReason) : $t('connect.signInTo') }} <b class="text-ink">{{ host }}</b></template>
        <template v-else>{{ $t('connect.intro') }}</template>
      </p>

      <div v-show="!reconnecting" class="mb-3.5">
        <span class="label">{{ $t('connect.mode') }}</span>
        <div class="grid grid-cols-2 gap-1.5">
          <button v-for="[k, lbl, d] in [['secure', $t('connect.secure'), 'HTTPS · port 8971'], ['local', $t('connect.local'), 'HTTP · port 5000']]" :key="k" type="button"
            class="rounded-lg border px-3 py-2 text-left" :class="mode === k ? 'border-accent bg-accent/15' : 'border-line hover:border-line-2'" @click="setMode(k)">
            <span class="flex items-center gap-1.5 text-[13px] font-semibold" :class="mode === k ? 'text-accent' : 'text-ink'">{{ lbl }}<span v-if="k === 'secure'" class="rounded bg-ok/15 px-1 text-[10px] font-bold text-ok">{{ $t('connect.recommended') }}</span></span>
            <span class="block text-[11px] text-ink-3">{{ d }}</span>
          </button>
        </div>
      </div>
      <div v-show="!reconnecting" class="grid grid-cols-[1fr_90px] gap-2.5">
        <div class="mb-2.5"><label class="label" for="host">{{ $t('connect.host') }}</label><input id="host" ref="firstInput" v-model="host" class="input" :placeholder="$t('connect.hostPlaceholder')" @input="state = 'idle'"></div>
        <div class="mb-2.5"><label class="label" for="port">{{ $t('connect.port') }}</label><input id="port" v-model="port" class="input" @input="state = 'idle'"></div>
      </div>

      <template v-if="!internal">
        <div class="grid grid-cols-2 gap-2.5">
          <div class="mb-2.5"><label class="label" for="user">{{ $t('connect.user') }}</label><input id="user" v-model="user" class="input" autocomplete="username"></div>
          <div class="mb-2.5"><label class="label" for="pass">{{ $t('connect.password') }}</label><input id="pass" ref="passInput" v-model="password" type="password" class="input" autocomplete="current-password"></div>
        </div>
        <label class="flex items-center gap-2 text-[13px] text-ink-2"><input v-model="remember" type="checkbox" class="accent-accent"> {{ $t('connect.remember') }}</label>
      </template>
      <p v-else class="rounded-lg border border-warn/35 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-ink-2">
        <b class="text-warn">{{ $t('connect.localWarnTitle') }}</b> {{ $t('connect.localWarn') }}
      </p>

      <div v-if="state === 'busy'" class="mt-3 flex items-center gap-2 text-[13px] text-ink-2"><span class="spin" />{{ $t('connect.connecting', { host: host + ':' + port }) }}</div>

      <div v-if="state === 'cert'" class="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-xs leading-relaxed text-ink-2">
        <strong class="block text-[13px] text-warn">{{ $t('errors.cert') }}</strong>
        {{ $t('connect.certText') }}
        <div class="mt-1.5 break-all font-mono text-[11px] text-ink">{{ fp(error.cert.fingerprint) }}</div>
        <div class="mt-1 text-ink-3">{{ $t('connect.issuedTo') }} {{ error.cert.subject?.commonName || error.cert.subject || '—' }}</div>
        <button type="button" class="btn mt-2" @click="trust">{{ $t('connect.trust') }}</button>
      </div>

      <div v-if="state === 'error'" class="mt-3 rounded-lg border border-bad/35 bg-bad/10 px-3 py-2.5 text-xs leading-relaxed text-ink-2">
        <template v-if="error.code === 'login'"><strong class="block text-[13px] text-bad">{{ error.message }}</strong>{{ $t('connect.accountsHint') }}</template>
        <template v-else>
          <strong class="block text-[13px] text-bad">{{ $t('connect.notFound') }}</strong>
          {{ $t('connect.noAnswer', { host: host + ':' + port, error: error.message }) }}<br>
          · {{ internal ? $t('connect.checkLocal') : $t('connect.checkSecure') }}<br>
          <template v-if="!internal">· {{ $t('connect.publish8971') }}<br></template>
          · {{ $t('connect.sameNetwork') }}<br>
          · {{ $t('connect.firewall', { port: internal ? '5000' : '8971' }) }}
        </template>
      </div>

      <div class="mt-5 flex items-center gap-2">
        <button v-if="reconnecting" type="button" class="text-xs text-ink-3 hover:text-ink" @click="changeServer">{{ $t('connect.changeServer') }}</button>
        <button type="submit" class="btn btn-primary ml-auto" :disabled="!canGo || state === 'busy'">{{ $t('connect.signIn') }}</button>
      </div>
    </form>
  </div>
</template>
