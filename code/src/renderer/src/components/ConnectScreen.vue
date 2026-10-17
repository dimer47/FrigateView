<script setup>
import { ref, computed, onMounted } from 'vue'
import { useServerStore } from '@/stores/server'
import { useLayoutStore, bestGrid } from '@/stores/layouts'

const server = useServerStore()
const layouts = useLayoutStore()

const prev = server.server
const host = ref(prev?.host || '192.168.0.137')
const port = ref(String(prev?.port || '8971'))
const user = ref(prev?.user || '')
const password = ref('')
const remember = ref(true)
const state = ref('idle') // idle | busy | error | cert
const error = ref(null)
const firstInput = ref(null)
const passInput = ref(null)

const internal = computed(() => port.value.trim() === '5000')
const reconnecting = computed(() => !!prev && server.status === 'auth')
const canGo = computed(() => host.value.trim() && /^\d+$/.test(port.value.trim()) && (internal.value || (user.value.trim() && password.value)))

onMounted(() => (reconnecting.value && user.value ? passInput : firstInput).value?.focus())

async function go() {
  if (!canGo.value || state.value === 'busy') return
  state.value = 'busy'
  try {
    await server.connect({ host: host.value.trim(), port: port.value.trim(), user: user.value.trim(), password: password.value, remember: remember.value })
    // Premier lancement : un layout avec toutes les caméras, pour voir tout de suite les images
    if (!layouts.layouts.length && server.cameras.length) {
      const ids = server.cameras.map((c) => c.id)
      layouts.create('Toutes les caméras', bestGrid(ids.length), ids)
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

async function changeServer() { await server.changeServer(); host.value = ''; user.value = ''; firstInput.value?.focus() }
const fp = (f) => (f || '').replace(/^sha256\//, '')
</script>

<template>
  <div class="flex h-full items-center justify-center" style="background: radial-gradient(ellipse at 50% 30%, #1c2a40, #0b111b 70%)">
    <form class="w-[460px] rounded-2xl border border-line-2 bg-modal p-7 shadow-2xl" @submit.prevent="go">
      <div class="mb-1 flex items-center gap-2 text-[22px] font-bold text-accent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
        FrigateView
      </div>
      <p class="mb-5 text-[13px] leading-relaxed text-ink-2">
        <template v-if="reconnecting">{{ server.authReason || 'Connectez-vous à' }} <b class="text-ink">{{ host }}</b></template>
        <template v-else>Connectez-vous à votre serveur Frigate avec votre compte Frigate.</template>
      </p>

      <div v-show="!reconnecting" class="grid grid-cols-[1fr_90px] gap-2.5">
        <div class="mb-2.5"><label class="label" for="host">Adresse du serveur</label><input id="host" ref="firstInput" v-model="host" class="input" placeholder="192.168.0.137 ou frigate.local" @input="state = 'idle'"></div>
        <div class="mb-2.5"><label class="label" for="port">Port</label><input id="port" v-model="port" class="input" @input="state = 'idle'"></div>
      </div>

      <template v-if="!internal">
        <div class="grid grid-cols-2 gap-2.5">
          <div class="mb-2.5"><label class="label" for="user">Utilisateur</label><input id="user" v-model="user" class="input" autocomplete="username"></div>
          <div class="mb-2.5"><label class="label" for="pass">Mot de passe</label><input id="pass" ref="passInput" v-model="password" type="password" class="input" autocomplete="current-password"></div>
        </div>
        <label class="flex items-center gap-2 text-[13px] text-ink-2"><input v-model="remember" type="checkbox" class="accent-accent"> Rester connecté (mot de passe chiffré sur ce PC)</label>
      </template>
      <p v-else class="rounded-lg border border-warn/35 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-ink-2">
        <b class="text-warn">Port 5000 : accès interne sans compte.</b> Tout appareil du réseau peut voir les caméras. Préférez le port 8971 avec un compte Frigate.
      </p>

      <div v-if="state === 'busy'" class="mt-3 flex items-center gap-2 text-[13px] text-ink-2"><span class="spin" />Connexion à {{ host }}:{{ port }}…</div>

      <div v-if="state === 'cert'" class="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-xs leading-relaxed text-ink-2">
        <strong class="block text-[13px] text-warn">Certificat non reconnu</strong>
        Le serveur utilise un certificat auto-signé (normal pour Frigate). Vérifiez que l'empreinte correspond à celle de votre serveur avant de lui faire confiance.
        <div class="mt-1.5 break-all font-mono text-[11px] text-ink">{{ fp(error.cert.fingerprint) }}</div>
        <div class="mt-1 text-ink-3">Émis pour : {{ error.cert.subject?.commonName || error.cert.subject || '—' }}</div>
        <button type="button" class="btn mt-2" @click="trust">Faire confiance à ce certificat</button>
      </div>

      <div v-if="state === 'error'" class="mt-3 rounded-lg border border-bad/35 bg-bad/10 px-3 py-2.5 text-xs leading-relaxed text-ink-2">
        <template v-if="error.code === 'login'"><strong class="block text-[13px] text-bad">{{ error.message }}</strong>Les comptes se gèrent dans l'interface web de Frigate (Réglages → Utilisateurs).</template>
        <template v-else>
          <strong class="block text-[13px] text-bad">Serveur introuvable</strong>
          {{ host }}:{{ port }} ne répond pas ({{ error.message }}).<br>
          · Vérifiez l'adresse de l'interface web Frigate (port 8971 par défaut)<br>
          · Le PC et le serveur doivent être sur le même réseau, ou reliés par Tailscale<br>
          · Le pare-feu du serveur doit autoriser les ports 8971 et 8555
        </template>
      </div>

      <div class="mt-5 flex items-center gap-2">
        <button v-if="reconnecting" type="button" class="text-xs text-ink-3 hover:text-ink" @click="changeServer">Changer de serveur</button>
        <button type="submit" class="btn btn-primary ml-auto" :disabled="!canGo || state === 'busy'">Se connecter</button>
      </div>
    </form>
  </div>
</template>
