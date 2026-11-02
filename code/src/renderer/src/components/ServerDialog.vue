<script setup>
// Santé du serveur Frigate : remplissage du disque (tout compte), stockage par caméra, journaux et redémarrage (admin).
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import { recordingsDisk, cameraUsage, logLevel, sizeParts, LOG_SERVICES, getCameraStorage, getLogs, restartFrigate } from '@/services/serverAdmin'
import { t, loc } from '@/i18n'

const server = useServerStore()
const ui = useUiStore()
const srv = () => server.server
const admin = computed(() => server.isAdmin)
const close = () => (ui.serverOpen = false)
const camName = (id) => server.camById(id)?.name || id
const size = (mbytes) => { const [k, v, d] = sizeParts(mbytes || 0); return t(k, { n: v.toLocaleString(loc(), { maximumFractionDigits: d }) }) }
const pct = (n) => `${(n || 0).toLocaleString(loc(), { maximumFractionDigits: 1 })} %`

const tab = ref('storage') // storage | logs

/* ---------- Stockage ---------- */
const disk = computed(() => recordingsDisk(server.stats))
const usage = ref(null)
const storageState = ref('idle') // idle | loading | ok | error
const storageError = ref('')
async function loadStorage() {
  if (!admin.value) return
  storageState.value = 'loading'
  try { usage.value = await getCameraStorage(srv()); storageState.value = 'ok' } catch (e) { storageState.value = 'error'; storageError.value = e.message }
}
const usageView = computed(() => cameraUsage(usage.value, disk.value))
const maxUsage = computed(() => Math.max(1, ...usageView.value.rows.map((r) => r.usage)))

/* ---------- Journaux ---------- */
const service = ref('frigate')
const logs = ref({ totalLines: 0, lines: [] })
const logState = ref('idle')
const logError = ref('')
const filter = ref('')
const follow = ref(false)
const logBox = ref(null)
let followTimer = null
async function loadLogs() {
  if (!admin.value) return
  if (logState.value !== 'ok') logState.value = 'loading'
  try {
    const atBottom = !logBox.value || logBox.value.scrollHeight - logBox.value.scrollTop - logBox.value.clientHeight < 40
    logs.value = await getLogs(srv(), service.value)
    logState.value = 'ok'
    if (atBottom) { await nextTick(); if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight }
  } catch (e) { logState.value = 'error'; logError.value = e.message }
}
const shownLines = computed(() => {
  const q = filter.value.trim().toLowerCase()
  const all = (logs.value.lines || []).map((l) => ({ text: l, level: logLevel(l) }))
  return q ? all.filter((l) => l.text.toLowerCase().includes(q)) : all
})
const LEVEL_CLASS = { error: 'text-bad', warning: 'text-warn', info: 'text-ink-2', debug: 'text-ink-3' }
function copyLogs() { navigator.clipboard.writeText(shownLines.value.map((l) => l.text).join('\n')).then(() => ui.notify(t('srv.copied'))) }
watch(service, () => { logState.value = 'idle'; loadLogs() })
watch(follow, (on) => { clearInterval(followTimer); if (on) followTimer = setInterval(loadLogs, 5000) })
watch(tab, (k) => { if (k === 'logs' && logState.value === 'idle') loadLogs() })

/* ---------- Redémarrage ---------- */
const confirmRestart = ref(false)
const restarting = ref(false)
async function restart() {
  if (!confirmRestart.value) { confirmRestart.value = true; return }
  confirmRestart.value = false
  restarting.value = true
  try { await restartFrigate(srv()); ui.notify(t('srv.restarting')); close() } catch (e) { ui.notify(t('srv.restartFailed', { msg: e?.message || String(e) })) } finally { restarting.value = false }
}

function reload() { tab.value === 'storage' ? loadStorage() : loadLogs() }
onMounted(loadStorage)
const onKey = (e) => { if (e.key === 'Escape' && !e.target.matches?.('input, select')) close() }
onMounted(() => addEventListener('keydown', onKey))
onBeforeUnmount(() => { removeEventListener('keydown', onKey); clearInterval(followTimer) })
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/55" @mousedown.self="close">
    <div class="flex h-[calc(100vh-40px)] w-[min(1100px,calc(100vw-40px))] flex-col overflow-hidden rounded-xl border border-line-2 bg-modal shadow-2xl" role="dialog" aria-modal="true">
      <header class="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
        <h2 class="text-[15px] font-bold">{{ $t('srv.title') }}</h2>
        <span class="text-xs text-ink-3">{{ server.server?.host }} · Frigate {{ server.version }}</span>
        <div class="ml-4 flex gap-1">
          <button v-for="k in ['storage', 'logs']" :key="k" class="rounded-md px-2.5 py-1 text-[13px]" :class="tab === k ? 'bg-accent/15 font-semibold text-accent' : 'text-ink-2 hover:bg-raised'" @click="tab = k">{{ $t(k === 'storage' ? 'srv.tabStorage' : 'srv.tabLogs') }}</button>
        </div>
        <button v-if="admin" class="btn btn-danger ml-auto py-1" :disabled="restarting" @click="restart" @blur="confirmRestart = false">{{ confirmRestart ? $t('srv.restartConfirm') : $t('srv.restart') }}</button>
        <button class="flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-raised hover:text-ink" :class="{ 'ml-auto': !admin }" :title="$t('srv.reload')" @click="reload">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3h-3" /></svg>
        </button>
        <button class="flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-bad/15 hover:text-bad" :title="$t('common.closeEsc')" @click="close">
          <svg width="13" height="13" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.7" /></svg>
        </button>
      </header>

      <!-- Stockage -->
      <div v-if="tab === 'storage'" class="min-h-0 flex-1 overflow-y-auto p-5 text-[13px]">
        <h3 class="mb-2 font-semibold">{{ $t('srv.disk') }}</h3>
        <template v-if="disk">
          <div class="h-3 overflow-hidden rounded-full bg-raised"><div class="h-full rounded-full" :class="disk.pct > 90 ? 'bg-bad' : disk.pct > 75 ? 'bg-warn' : 'bg-accent'" :style="{ width: disk.pct + '%' }" /></div>
          <p class="mt-1.5 text-ink-2">{{ $t('srv.diskLine', { used: size(disk.used), total: size(disk.total), free: size(disk.free), pct: pct(disk.pct) }) }}</p>
          <p v-if="usageView.daysLeft != null" class="mt-1 text-ink-3">{{ $t('srv.daysLeft', { n: Math.round(usageView.daysLeft).toLocaleString(loc()), rate: size(usageView.perHour) }) }}</p>
        </template>
        <p v-else class="text-ink-3">{{ $t('srv.loading') }}</p>

        <h3 class="mb-2 mt-6 font-semibold">{{ $t('srv.perCamera') }}</h3>
        <p v-if="!admin" class="text-ink-3">{{ $t('srv.adminOnly') }}</p>
        <p v-else-if="storageState === 'loading'" class="flex items-center gap-2 text-ink-3"><span class="spin" /> {{ $t('srv.loading') }}</p>
        <p v-else-if="storageState === 'error'" class="text-bad">{{ $t('srv.error', { msg: storageError }) }}</p>
        <table v-else-if="storageState === 'ok'" class="w-full border-collapse">
          <thead><tr class="text-left text-[11px] uppercase tracking-wider text-ink-3"><th class="py-1.5 font-bold">{{ $t('srv.cam') }}</th><th class="w-[38%] py-1.5" /><th class="py-1.5 text-right font-bold">{{ $t('srv.used') }}</th><th class="py-1.5 text-right font-bold">{{ $t('srv.share') }}</th><th class="py-1.5 text-right font-bold">{{ $t('srv.rate') }}</th></tr></thead>
          <tbody>
            <tr v-for="r in usageView.rows" :key="r.cam" class="border-t border-line">
              <td class="py-2 pr-3 font-semibold">{{ camName(r.cam) }}</td>
              <td class="py-2 pr-3"><div class="h-2 overflow-hidden rounded-full bg-raised"><div class="h-full rounded-full bg-accent" :style="{ width: (r.usage / maxUsage) * 100 + '%' }" /></div></td>
              <td class="py-2 text-right font-mono">{{ size(r.usage) }}</td>
              <td class="py-2 text-right font-mono text-ink-2">{{ pct(r.pct) }}</td>
              <td class="py-2 text-right font-mono text-ink-2">{{ $t('srv.perHour', { n: size(r.bandwidth) }) }}</td>
            </tr>
            <tr class="border-t border-line-2 font-semibold"><td class="py-2">{{ $t('srv.total') }}</td><td /><td class="py-2 text-right font-mono">{{ size(usageView.used) }}</td><td class="py-2 text-right font-mono text-ink-2">{{ disk ? pct((usageView.used / disk.total) * 100) : '' }}</td><td class="py-2 text-right font-mono text-ink-2">{{ $t('srv.perHour', { n: size(usageView.perHour) }) }}</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Journaux -->
      <div v-else class="flex min-h-0 flex-1 flex-col">
        <p v-if="!admin" class="p-5 text-[13px] text-ink-3">{{ $t('srv.adminOnly') }}</p>
        <template v-else>
          <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-[13px]">
            <select v-model="service" class="input w-auto py-1">
              <option v-for="s in LOG_SERVICES" :key="s" :value="s">{{ s }}</option>
            </select>
            <input v-model="filter" class="input w-64 py-1" :placeholder="$t('srv.logsFilter')" @keydown.esc.stop="filter = ''">
            <label class="flex items-center gap-1.5 text-ink-2"><input v-model="follow" type="checkbox" class="accent-accent">{{ $t('srv.follow') }}</label>
            <span class="ml-auto text-xs text-ink-3">{{ $t('srv.lines', { n: logs.lines?.length || 0, total: logs.totalLines || 0 }) }}</span>
            <button class="btn py-1" :disabled="!shownLines.length" @click="copyLogs">{{ $t('srv.copy') }}</button>
          </div>
          <p v-if="logState === 'loading'" class="flex items-center gap-2 p-4 text-[13px] text-ink-3"><span class="spin" /> {{ $t('srv.loading') }}</p>
          <p v-else-if="logState === 'error'" class="p-4 text-[13px] text-bad">{{ $t('srv.error', { msg: logError }) }}</p>
          <div v-else ref="logBox" class="min-h-0 flex-1 overflow-auto bg-bg px-4 py-2 font-mono text-[11.5px] leading-[1.55]">
            <p v-if="!shownLines.length" class="text-ink-3">{{ $t('srv.noLines') }}</p>
            <div v-for="(l, i) in shownLines" :key="i" class="whitespace-pre-wrap break-all" :class="LEVEL_CLASS[l.level] || 'text-ink-2'">{{ l.text }}</div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
