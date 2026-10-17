<script setup>
import { ref, onMounted } from 'vue'
import { useAppSettings } from '@/stores/appSettings'
import { useLayoutStore } from '@/stores/layouts'
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import { TYPE_LABELS } from '@/stores/events'
import { isInternal } from '@/services/frigate'

const app = useAppSettings()
const layouts = useLayoutStore()
const server = useServerStore()
const ui = useUiStore()

const TABS = [['notif', 'Notifications'], ['screens', 'Écrans'], ['startup', 'Démarrage'], ['server', 'Serveur']]
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
  ui.notify(n ? `${n} mur${n > 1 ? 's' : ''} vidéo ouvert${n > 1 ? 's' : ''}` : 'Murs vidéo fermés')
}
function testNotif() { window.native.notify({ title: 'Personne détectée — Test', body: `${new Date().toLocaleTimeString('fr-FR')} · notification de test`, id: null }) }
const identify = () => window.native.identifyScreens()
const close = () => (app.open = false)
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/55" @mousedown.self="close" @keydown.esc="close">
    <div class="flex h-[540px] w-[820px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-xl border border-line-2 bg-modal shadow-2xl" role="dialog" aria-modal="true">
      <header class="flex items-center border-b border-line px-5 py-3">
        <h2 class="text-[15px] font-bold">Réglages</h2>
        <button class="ml-auto flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-bad/15 hover:text-bad" title="Fermer (Échap)" @click="close">
          <svg width="13" height="13" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.7" /></svg>
        </button>
      </header>
      <div class="grid min-h-0 flex-1 grid-cols-[180px_1fr]">
        <nav class="flex flex-col gap-0.5 border-r border-line p-2">
          <button v-for="[k, l] in TABS" :key="k" class="rounded-md px-2.5 py-2 text-left text-[13px]" :class="app.tab === k ? 'bg-accent/15 font-semibold text-accent' : 'text-ink-2 hover:bg-raised hover:text-ink'" @click="app.tab = k">{{ l }}</button>
        </nav>
        <div class="overflow-y-auto px-5 py-4 text-[13px]">
          <!-- Notifications -->
          <template v-if="app.tab === 'notif'">
            <h3 class="mb-1.5 font-semibold">Notifications Windows</h3>
            <label class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>Notifier les nouvelles détections<small class="block text-xs text-ink-3">Aussi quand FrigateView est réduit dans la zone de notification</small></span><input type="checkbox" class="size-4 accent-accent" :checked="app.s.notify" @change="app.set({ notify: $event.target.checked })"></label>
            <label v-for="(l, k) in TYPE_LABELS" :key="k" class="flex items-center justify-between gap-3 border-b border-line py-2.5 pl-4" :class="{ 'opacity-40': !app.s.notify }"><span>{{ l }}</span><input type="checkbox" class="size-4 accent-accent" :disabled="!app.s.notify" :checked="app.s.notifyTypes[k]" @change="setType(k, $event.target.checked)"></label>
            <label class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>Son</span><input type="checkbox" class="size-4 accent-accent" :checked="app.s.notifySound" @change="app.set({ notifySound: $event.target.checked })"></label>
            <label class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>Ne pas déranger<small class="block text-xs text-ink-3">Aucune notification ; les événements restent dans la liste</small></span><input type="checkbox" class="size-4 accent-accent" :checked="app.s.dnd" @change="app.set({ dnd: $event.target.checked })"></label>
            <button class="btn mt-4" @click="testNotif">Tester une notification</button>
          </template>

          <!-- Écrans -->
          <template v-else-if="app.tab === 'screens'">
            <h3 class="mb-1 font-semibold">Murs vidéo sur les autres écrans</h3>
            <p class="mb-3 text-xs text-ink-3">Chaque écran choisi reçoit une fenêtre plein écran avec un layout. Elles se rouvrent au démarrage.</p>
            <div class="mb-3 flex items-end gap-3">
              <div v-for="d in screens" :key="d.id" class="flex flex-col items-center justify-center rounded-md border-2 text-[11px]"
                :class="d.current ? 'border-accent bg-accent/15 text-accent' : screenConf[d.id]?.enabled ? 'border-ok/60 text-ink' : 'border-line-2 text-ink-3'"
                :style="{ width: Math.round(d.width / 14) + 'px', height: Math.round(d.height / 14) + 'px' }">
                <b class="text-xl">{{ d.index }}</b>{{ d.width }}×{{ d.height }}
              </div>
            </div>
            <button class="btn mb-3" @click="identify">Identifier les écrans</button>
            <div v-for="d in screens" :key="d.id" class="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <span>Écran {{ d.index }}<small class="block text-xs text-ink-3">{{ d.current ? 'Fenêtre principale (layouts, événements, timeline)' : d.primary ? 'Écran principal' : 'Écran secondaire' }}</small></span>
              <span v-if="!d.current" class="flex items-center gap-2">
                <select v-model="screenConf[d.id].layout" class="input !w-44" :disabled="!screenConf[d.id].enabled">
                  <option v-for="l in layouts.layouts" :key="l.id" :value="l.id">{{ l.name }}</option>
                </select>
                <label class="flex items-center gap-1.5 text-xs"><input v-model="screenConf[d.id].enabled" type="checkbox" class="size-4 accent-accent">Mur vidéo</label>
              </span>
              <span v-else class="text-xs text-ink-3">—</span>
            </div>
            <p v-if="screens.length < 2" class="mt-3 text-xs text-ink-3">Un seul écran détecté. Branchez un second écran pour y afficher un mur vidéo.</p>
            <button class="btn btn-primary mt-4" :disabled="screens.length < 2" @click="applyScreens">Appliquer</button>
          </template>

          <!-- Démarrage -->
          <template v-else-if="app.tab === 'startup'">
            <h3 class="mb-1.5 font-semibold">Démarrage et fermeture</h3>
            <label class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>Lancer FrigateView au démarrage de Windows<small class="block text-xs text-ink-3">Pris en compte dans l'application installée</small></span><input type="checkbox" class="size-4 accent-accent" :checked="app.s.startAtLogin" @change="app.set({ startAtLogin: $event.target.checked })"></label>
            <label class="flex items-center justify-between gap-3 border-b border-line py-2.5" :class="{ 'opacity-40': !app.s.startAtLogin }"><span>Démarrer réduit dans la zone de notification</span><input type="checkbox" class="size-4 accent-accent" :disabled="!app.s.startAtLogin" :checked="app.s.startHidden" @change="app.set({ startHidden: $event.target.checked })"></label>
            <label class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>Fermer la fenêtre = réduire dans la zone de notification<small class="block text-xs text-ink-3">L'application continue de recevoir les alertes. « Quitter » depuis l'icône.</small></span><input type="checkbox" class="size-4 accent-accent" :checked="app.s.closeToTray" @change="app.set({ closeToTray: $event.target.checked })"></label>
          </template>

          <!-- Serveur -->
          <template v-else>
            <h3 class="mb-1.5 font-semibold">Serveur Frigate</h3>
            <div class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>{{ server.server.host }}:{{ server.server.port }}<small class="block text-xs text-ink-3">Frigate {{ server.version }} · {{ server.cameras.length }} caméras · {{ isInternal(server.server) ? 'sans compte (HTTP)' : 'avec compte (HTTPS)' }}</small></span><span :class="server.status === 'ok' ? 'text-ok' : 'text-bad'">{{ server.status === 'ok' ? 'Connecté' : 'Injoignable' }}</span></div>
            <div v-if="server.profile.username" class="flex items-center justify-between gap-3 border-b border-line py-2.5"><span>Compte<small class="block text-xs text-ink-3">Les comptes se gèrent dans l'interface web de Frigate</small></span><span>{{ server.profile.username }} · {{ server.profile.role }}</span></div>
            <div class="mt-4 flex gap-2"><button class="btn" @click="close(); server.signOut()">Se déconnecter</button><button class="btn" @click="close(); server.changeServer()">Changer de serveur ou de mode</button></div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
