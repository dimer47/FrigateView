<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import Hls from 'hls.js'
import { snapshotUrl, getRecordings, vodUrl } from '@/services/frigate'
import { connectWebRTC } from '@/services/webrtc'
import { useTimelineStore } from '@/stores/timeline'
import { loc } from '@/i18n'
import { useStatsStore, fmtRate } from '@/stores/stats'

const props = defineProps({ camId: { type: String, required: true } })
const server = useServerStore()
const ui = useUiStore()
const tl = useTimelineStore()
const playback = computed(() => tl.isPlayback(props.camId))
const stats = useStatsStore()
const imgEl = ref(null)

const root = ref(null)
const video = ref(null)
const imgSrc = ref('')
const imgError = ref(false)
const lastFrame = ref(0)
const rtc = ref('off') // off | connecting | playing | failed
const now = ref(Date.now())

const cam = computed(() => server.camById(props.camId))
const offline = computed(() => server.online[props.camId] === false)
const frozen = computed(() => server.status === 'lost')
const wantVideo = computed(() => ui.liveMode === 'webrtc' && !frozen.value && !offline.value && !playback.value)
const showVideo = computed(() => wantVideo.value && rtc.value === 'playing')

/* ---- Images fixes (mode Images, ou en attendant / à défaut de la vidéo) ---- */
let snapTimer = null
function snapHeight() {
  const h = (root.value?.clientHeight || 360) * (window.devicePixelRatio || 1)
  return Math.max(180, Math.min(1080, Math.round(h / 60) * 60)) // paliers de 60 px pour profiter du cache
}
function loadSnapshot() {
  if (frozen.value || showVideo.value || playback.value || !server.server) return
  const url = snapshotUrl(server.server, props.camId, snapHeight())
  const img = new Image()
  img.onload = () => { imgSrc.value = url; imgError.value = false; lastFrame.value = Date.now() }
  img.onerror = () => { imgError.value = true }
  img.src = url
}
function startSnapshots() { stopSnapshots(); loadSnapshot(); snapTimer = setInterval(loadSnapshot, 1000) }
function stopSnapshots() { clearInterval(snapTimer); snapTimer = null }

/* ---- Vidéo WebRTC ---- */
let pc = null
let retryTimer = null
async function startVideo() {
  stopVideo()
  if (!wantVideo.value || !video.value) return
  rtc.value = 'connecting'
  lastRtcBytes = 0
  try {
    pc = await connectWebRTC(server.server, props.camId, video.value, () => {
      rtc.value = 'failed'
      scheduleRetry()
    })
  } catch {
    rtc.value = 'failed'
    scheduleRetry()
  }
}
function scheduleRetry() { clearTimeout(retryTimer); retryTimer = setTimeout(() => wantVideo.value && startVideo(), 15000) }
function stopVideo() {
  clearTimeout(retryTimer)
  if (pc) { pc.onconnectionstatechange = null; pc.close(); pc = null }
  if (video.value) video.value.srcObject = null
  rtc.value = 'off'
}
function onPlaying() { rtc.value = 'playing'; lastFrame.value = Date.now() }

watch(wantVideo, (v) => (v ? startVideo() : stopVideo()))
watch(() => props.camId, () => { imgSrc.value = ''; stopPlayback(); startSnapshots(); if (wantVideo.value) startVideo(); if (playback.value) syncPlayback() })

/* ---- Relecture HLS ----
   Frigate assemble les segments enregistrés en retirant les coupures : la position dans
   la vidéo ne correspond donc à l'heure réelle qu'à travers la liste des segments. */
const pbVideo = ref(null)
const pbState = ref('idle') // idle | loading | playing | norec | error
let hls = null
let chunk = null // { start, end, segs: [{ s, e }] } en ms
let chunkLoading = false
const CHUNK = 30 * 60 * 1000

function toOffset(t) {
  let acc = 0
  for (const g of chunk.segs) {
    if (t < g.s) return null
    if (t < g.e) return acc + (t - g.s) / 1000
    acc += (g.e - g.s) / 1000
  }
  return null
}

async function loadChunk(t) {
  chunkLoading = true
  pbState.value = 'loading'
  try {
    const recs = await getRecordings(server.server, props.camId, t / 1000 - 15, (t + CHUNK) / 1000)
    const segs = []
    for (const r of recs.map((x) => ({ s: x.start_time * 1000, e: x.end_time * 1000 })).sort((a, b) => a.s - b.s)) {
      if (r.e <= t) continue
      const last = segs[segs.length - 1]
      if (last && r.s - last.e < 1000) last.e = r.e
      else segs.push(r)
    }
    if (!segs.length) { chunk = { start: t, end: t + CHUNK, segs: [] }; destroyHls(); pbState.value = 'norec'; return }
    chunk = { start: Math.min(t, segs[0].s), end: segs[segs.length - 1].e, segs }
    destroyHls()
    if (!Hls.isSupported()) { pbState.value = 'error'; return }
    hls = new Hls({ maxBufferLength: 30, backBufferLength: 30 })
    const dbg = localStorage.getItem('fv-debug') === '1'
    hls.on(Hls.Events.ERROR, (_e, d) => { if (dbg) console.log('[hls]', props.camId, d.type, d.details, d.fatal, d.response?.code || ''); if (d.fatal) pbState.value = 'error' })
    hls.on(Hls.Events.FRAG_LOADED, (_e, d) => { hlsBytes += d.frag?.stats?.loaded || 0 })
    hls.on(Hls.Events.MANIFEST_PARSED, () => { if (dbg) console.log('[hls]', props.camId, 'manifest ok'); syncPlayback(true) })
    hls.loadSource(vodUrl(server.server, props.camId, segs[0].s / 1000, chunk.end / 1000))
    hls.attachMedia(pbVideo.value)
  } catch {
    pbState.value = 'error'
    chunk = { start: t, end: t + 10000, segs: [] } // nouvel essai dans 10 s
  } finally {
    chunkLoading = false
  }
}

function syncPlayback(force = false) {
  if (localStorage.getItem('fv-debug') === '1' && force) console.log('[pb]', props.camId, 'sync', chunk && chunk.segs.length, toOffset(tl.time))
  if (!playback.value || chunkLoading) return
  const t = tl.time, v = pbVideo.value
  if (!chunk || t < chunk.start || t >= chunk.end) { loadChunk(t); return }
  if (!hls || !v) return
  const off = toOffset(t)
  if (off === null) { pbState.value = 'norec'; if (!v.paused) v.pause(); return }
  if (pbState.value !== 'error') pbState.value = 'playing'
  if (force || Math.abs(v.currentTime - off) > 1.5) v.currentTime = off
  v.playbackRate = tl.speed
  if (tl.playing && v.paused) v.play().catch(() => {})
  if (!tl.playing && !v.paused) v.pause()
}

function destroyHls() { if (hls) { hls.destroy(); hls = null } }
function stopPlayback() { destroyHls(); chunk = null; pbState.value = 'idle' }

watch(playback, (p) => (p ? syncPlayback() : stopPlayback()))
watch(() => [tl.time, tl.playing, tl.speed], () => syncPlayback())

/* ---- Statistiques (option) : débit reçu, résolution, images/s ---- */
let lastRtcBytes = 0
let hlsBytes = 0
let lastSample = 0
let statTimer = null
const myStats = computed(() => stats.cams[props.camId])
async function sample() {
  const now = performance.now(), dt = (now - lastSample) / 1000
  lastSample = now
  let bytes = 0, w = 0, h = 0, fps = 0, source
  if (playback.value) {
    source = 'hls'; bytes = hlsBytes; hlsBytes = 0
    w = pbVideo.value?.videoWidth; h = pbVideo.value?.videoHeight
  } else if (showVideo.value && pc) {
    source = 'webrtc'
    let total = 0
    ;(await pc.getStats()).forEach((s) => {
      if (s.type !== 'inbound-rtp') return
      total += s.bytesReceived || 0
      if (s.kind === 'video') { w = s.frameWidth; h = s.frameHeight; fps = s.framesPerSecond }
    })
    bytes = lastRtcBytes ? total - lastRtcBytes : 0
    lastRtcBytes = total
  } else {
    source = 'image'; bytes = stats.takeImageBytes(props.camId); fps = frozen.value ? 0 : 1
    w = imgEl.value?.naturalWidth; h = imgEl.value?.naturalHeight
  }
  if (dt > 0 && dt < 10) stats.report(props.camId, { kbps: (bytes * 8) / 1000 / dt, w, h, fps, source })
}
function startStats() { stopStats(); lastSample = performance.now(); statTimer = setInterval(sample, 2000) }
function stopStats() { clearInterval(statTimer); statTimer = null; stats.forget(props.camId) }
watch(() => ui.showStats, (on) => (on ? startStats() : stopStats()), { immediate: true })

let clock = null
onMounted(() => {
  startSnapshots()
  if (wantVideo.value) startVideo()
  clock = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => { stopSnapshots(); stopVideo(); stopPlayback(); stopStats(); clearInterval(clock) })

const time = computed(() => new Date(playback.value ? tl.time : frozen.value ? lastFrame.value || now.value : now.value).toLocaleTimeString(loc()))
</script>

<template>
  <div ref="root" class="absolute inset-0 bg-[linear-gradient(160deg,#1b2636,#0b121c)]">
    <video v-show="playback" ref="pbVideo" class="absolute inset-0 size-full object-contain" :class="{ 'brightness-50': pbState === 'norec' }" muted playsinline />
    <img v-if="imgSrc && !showVideo && !playback" ref="imgEl" :src="imgSrc" class="absolute inset-0 size-full object-contain" :class="{ 'grayscale brightness-50': frozen || offline }" draggable="false" alt="">
    <video ref="video" class="absolute inset-0 size-full object-contain" :class="{ invisible: !showVideo }" autoplay muted playsinline @playing="onPlaying" />

    <div class="absolute left-1.5 top-1.5 z-[3] flex flex-wrap items-center gap-1">
      <span v-if="playback" class="badge text-warn"><i class="bg-warn" />{{ $t('cell.playback') }}{{ tl.speed !== 1 ? ' ' + tl.speed + 'x' : '' }}</span>
      <span v-else-if="frozen" class="badge"><i class="bg-bad" />{{ $t('cell.interrupted') }}</span>
      <span v-else-if="offline" class="badge"><i class="bg-bad" />{{ $t('cell.offline') }}</span>
      <span v-else-if="showVideo" class="badge" :title="$t('cell.liveTitle')"><i class="bg-ok" />{{ $t('cell.live') }}</span>
      <span v-else class="badge" :title="wantVideo ? $t('cell.noVideoTitle') : $t('cell.snapshotTitle')">
        <i class="bg-warn" />{{ wantVideo && rtc === 'connecting' ? $t('cell.connecting') : $t('cell.snapshot') }}
      </span>
    </div>
    <div v-if="ui.showStats && myStats" class="absolute bottom-8 left-1.5 z-[3] max-w-[calc(100%-12px)] truncate rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/90" :title="$t('stats.cellTitle')">
        {{ fmtRate(myStats.kbps, loc()) }}<template v-if="myStats.w"> · {{ myStats.w }}×{{ myStats.h }}</template><template v-if="myStats.fps"> · {{ $t('stats.fps', { n: Math.round(myStats.fps) }) }}</template> · {{ $t('stats.src.' + myStats.source) }}
    </div>

    <div v-if="playback && pbState !== 'playing'" class="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-1 p-2.5 text-center text-[13px] text-ink-2">
      <span v-if="pbState === 'loading'" class="spin" />
      <template v-else>
        <strong class="text-ink">{{ pbState === 'error' ? $t('cell.playbackError') : $t('cell.noRecording') }}</strong>
        <span>{{ pbState === 'error' ? $t('cell.noVideoFromServer') : $t('cell.at', { time }) }}</span>
      </template>
    </div>
    <div v-else-if="!playback && (frozen || offline || (imgError && !showVideo))" class="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-1 p-2.5 text-center text-[13px] text-ink-2">
      <strong :class="offline || frozen ? 'text-bad' : 'text-ink'">{{ frozen ? $t('cell.interruptedText') : offline ? $t('common.offline') : $t('cell.imageUnavailable') }}</strong>
      <span v-if="frozen && lastFrame">{{ $t('cell.lastFrame', { time }) }}</span>
      <span v-else-if="offline">{{ $t('cell.offlineText') }}</span>
      <span v-else>{{ $t('cell.retrying') }}</span>
    </div>

    <div class="absolute inset-x-0 bottom-0 z-[3] flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 to-transparent px-2.5 py-1.5">
      <span class="truncate text-[13px] font-semibold [text-shadow:0_1px_2px_#000]">{{ cam?.name || camId }}</span>
      <span class="whitespace-nowrap font-mono text-xs" :class="playback ? 'text-warn' : 'text-ink-2'">{{ time }}</span>
    </div>
  </div>
</template>
