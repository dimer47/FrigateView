<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import Hls from 'hls.js'
import { snapshotUrl, getRecordings, vodUrl } from '@/services/frigate'
import { connectWebRTC } from '@/services/webrtc'
import { useTimelineStore } from '@/stores/timeline'
import { loc } from '@/i18n'
import { useStatsStore, fmtRate, serverCamera } from '@/stores/stats'
import { t } from '@/i18n'
import { useMediaStore } from '@/stores/media'

const props = defineProps({ camId: { type: String, required: true }, zoomable: { type: Boolean, default: false } })
const server = useServerStore()
const ui = useUiStore()
const tl = useTimelineStore()
const playback = computed(() => tl.isPlayback(props.camId))
const stats = useStatsStore()
const imgEl = ref(null)
const media = useMediaStore()
const muted = computed(() => media.audioCam !== props.camId)

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
let snapImg = null // image en cours de chargement : une seule à la fois (lien lent = pas d'empilement)
function loadSnapshot() {
  if (snapImg || frozen.value || showVideo.value || playback.value || !server.server) return
  const cam = props.camId
  const url = snapshotUrl(server.server, cam, snapHeight())
  const img = (snapImg = new Image())
  const done = (ok) => {
    if (snapImg !== img) return // annulée (arrêt ou changement de caméra)
    snapImg = null
    if (cam !== props.camId) return
    if (ok) { imgSrc.value = url; imgError.value = false; lastFrame.value = Date.now() } else imgError.value = true
  }
  img.onload = () => done(true)
  img.onerror = () => done(false)
  img.src = url
}
function startSnapshots() { stopSnapshots(); loadSnapshot(); snapTimer = setInterval(loadSnapshot, 1000) }
function stopSnapshots() {
  clearInterval(snapTimer); snapTimer = null
  if (snapImg) { snapImg.onload = snapImg.onerror = null; snapImg.src = ''; snapImg = null }
}

/* ---- Vidéo WebRTC ---- */
let pc = null
let retryTimer = null
let rtcGen = 0 // jeton : toute connexion d'une génération dépassée est fermée à son arrivée
async function startVideo() {
  stopVideo()
  if (!wantVideo.value || !video.value) return
  const gen = rtcGen
  rtc.value = 'connecting'
  lastRtcBytes = 0
  try {
    const p = await connectWebRTC(server.server, props.camId, video.value, () => {
      if (gen !== rtcGen) return
      rtc.value = 'failed'
      scheduleRetry()
    })
    if (gen !== rtcGen) { p.onconnectionstatechange = null; p.close(); return } // arrêtée ou relancée entre-temps
    pc = p
  } catch {
    if (gen !== rtcGen) return
    rtc.value = 'failed'
    scheduleRetry()
  }
}
function scheduleRetry() { clearTimeout(retryTimer); retryTimer = setTimeout(() => wantVideo.value && startVideo(), 15000) }
function stopVideo() {
  rtcGen++
  clearTimeout(retryTimer)
  if (pc) { pc.onconnectionstatechange = null; pc.close(); pc = null }
  if (video.value) video.value.srcObject = null
  rtc.value = 'off'
}
function onPlaying() {
  rtc.value = 'playing'
  lastFrame.value = Date.now()
  media.hasAudio[props.camId] = !!video.value?.srcObject?.getAudioTracks().length
}

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

let chunkGen = 0 // jeton : relecture arrêtée ou caméra changée pendant la requête → résultat ignoré
async function loadChunk(t) {
  const cam = props.camId, gen = ++chunkGen
  chunkLoading = true
  pbState.value = 'loading'
  try {
    const recs = await getRecordings(server.server, cam, t / 1000 - 15, (t + CHUNK) / 1000)
    if (gen !== chunkGen || cam !== props.camId || !playback.value) return
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
    hls.loadSource(vodUrl(server.server, cam, segs[0].s / 1000, chunk.end / 1000))
    hls.attachMedia(pbVideo.value)
  } catch {
    if (gen !== chunkGen) return
    pbState.value = 'error'
    chunk = { start: t, end: t + 10000, segs: [] } // nouvel essai dans 10 s
  } finally {
    if (gen === chunkGen) chunkLoading = false
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
function stopPlayback() { chunkGen++; chunkLoading = false; destroyHls(); chunk = null; pbState.value = 'idle' }

watch(playback, (p) => (p ? syncPlayback() : stopPlayback()))
watch(() => [tl.time, tl.playing, tl.speed], () => syncPlayback())

/* ---- Statistiques (option) : débit reçu, résolution, images/s ---- */
let lastRtcBytes = 0
let hlsBytes = 0
let lastSample = 0
let statTimer = null
const myStats = computed(() => stats.cams[props.camId])
// Ligne de statistiques de la case, selon les éléments cochés dans les réglages
const statLine = computed(() => {
  const f = ui.statFields.camera, s = myStats.value, sv = serverCamera(server.stats, props.camId), parts = []
  if (s) {
    if (f.rate) parts.push(fmtRate(s.kbps, loc()))
    if (f.res && s.w) parts.push(`${s.w}×${s.h}`)
    if (f.fps && s.fps) parts.push(t('stats.fps', { n: Math.round(s.fps) }))
    if (f.source) parts.push(t('stats.src.' + s.source))
  }
  if (sv) {
    if (f.srvFps && sv.fps != null) parts.push(`Frigate ${t('stats.fpsOf', { n: sv.fps.toLocaleString(loc()), total: sv.expected ?? '?' })}`)
    if (f.srvQuality && sv.quality) parts.push(t('stats.quality.' + sv.quality) !== 'stats.quality.' + sv.quality ? t('stats.quality.' + sv.quality) : sv.quality)
    if (f.srvReconnects && sv.reconnects != null) parts.push(`↻ ${sv.reconnects}`)
    if (f.srvCamCpu) parts.push(`CPU ${sv.cpu.toLocaleString(loc(), { maximumFractionDigits: 1 })} %`)
  }
  return parts.join(' · ')
})
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

// Image affichée, pour la capture
let unregister = () => {}
const frameGetter = () => ({ el: playback.value ? pbVideo.value : showVideo.value ? video.value : null, time: playback.value ? tl.time : Date.now() })
watch(() => props.camId, (id) => { unregister(); unregister = media.registerFrame(id, frameGetter) }, { immediate: true })

let clock = null
onMounted(() => {
  startSnapshots()
  if (wantVideo.value) startVideo()
  clock = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => { unregister(); stopSnapshots(); stopVideo(); stopPlayback(); stopStats(); clearInterval(clock) })

const time = computed(() => new Date(playback.value ? tl.time : frozen.value ? lastFrame.value || now.value : now.value).toLocaleTimeString(loc()))
// Image entière, rognée ou étirée (réglage commun) ; en relecture aussi
const fitStyle = computed(() => ({ objectFit: ui.fit }))

/* ---- Zoom numérique (caméra agrandie) : molette = zoom sous la souris, glisser = se déplacer ---- */
const MAX_ZOOM = 8
const zoom = ref({ z: 1, x: 0, y: 0 }) // transform : translate(x, y) scale(z), origine en haut à gauche
const zoomed = computed(() => zoom.value.z > 1.001)
const zoomStyle = computed(() => ({ transform: `translate(${zoom.value.x}px, ${zoom.value.y}px) scale(${zoom.value.z})`, transformOrigin: '0 0' }))
const size = () => ({ w: root.value?.clientWidth || 1, h: root.value?.clientHeight || 1 })
function setZoom(z, cx, cy) {
  const { w, h } = size(), o = zoom.value
  z = Math.min(Math.max(z, 1), MAX_ZOOM)
  cx ??= w / 2; cy ??= h / 2
  // Le point sous (cx, cy) reste fixe
  let x = cx - ((cx - o.x) / o.z) * z, y = cy - ((cy - o.y) / o.z) * z
  x = Math.min(0, Math.max(w - w * z, x)); y = Math.min(0, Math.max(h - h * z, y))
  zoom.value = { z, x, y }
}
const resetZoom = () => (zoom.value = { z: 1, x: 0, y: 0 })
function onWheel(e) {
  if (!props.zoomable) return
  e.preventDefault()
  const r = root.value.getBoundingClientRect()
  setZoom(zoom.value.z * Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top)
}
let pan = null
const panning = ref(false)
function onPanDown(e) {
  if (!props.zoomable || !zoomed.value || e.button !== 0) return
  e.stopPropagation()
  pan = { px: e.clientX, py: e.clientY, x: zoom.value.x, y: zoom.value.y }
  panning.value = true
  e.currentTarget.setPointerCapture(e.pointerId)
}
function onPanMove(e) {
  if (!pan) return
  const { w, h } = size(), z = zoom.value.z
  zoom.value = { z, x: Math.min(0, Math.max(w - w * z, pan.x + e.clientX - pan.px)), y: Math.min(0, Math.max(h - h * z, pan.y + e.clientY - pan.py)) }
}
const onPanUp = () => { pan = null; panning.value = false }
watch(() => [props.zoomable, props.camId], resetZoom)

// Mini-carte : image en cours réduite + cadre de la zone affichée ; clic ou glisser = déplacer la zone
const mini = ref(null)
let miniTimer = null
function drawMini() {
  const c = mini.value, src = playback.value ? pbVideo.value : showVideo.value ? video.value : imgEl.value
  if (!c || !src) return
  const sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight
  if (!sw || !sh) return
  const ctx = c.getContext('2d'), W = c.width, H = c.height
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
  // Même cadrage que la case
  let dw = W, dh = H
  if (ui.fit !== 'fill') { const k = ui.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh); dw = sw * k; dh = sh * k }
  try { ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh) } catch { /* image pas encore prête */ }
}
watch(zoomed, (on) => {
  clearInterval(miniTimer)
  if (on) { miniTimer = setInterval(drawMini, 400); requestAnimationFrame(drawMini) }
})
const miniRect = computed(() => {
  const { w, h } = size(), { z, x, y } = zoom.value
  return { left: (-x / (w * z)) * 100 + '%', top: (-y / (h * z)) * 100 + '%', width: 100 / z + '%', height: 100 / z + '%' }
})
let miniDrag = false
function miniMove(e) {
  const r = mini.value.getBoundingClientRect(), { w, h } = size(), z = zoom.value.z
  // Centre la zone sur le point visé de la mini-carte
  const cx = ((e.clientX - r.left) / r.width) * w, cy = ((e.clientY - r.top) / r.height) * h
  zoom.value = { z, x: Math.min(0, Math.max(w - w * z, w / 2 - cx * z)), y: Math.min(0, Math.max(h - h * z, h / 2 - cy * z)) }
}
function miniDown(e) { e.stopPropagation(); miniDrag = true; e.currentTarget.setPointerCapture(e.pointerId); miniMove(e) }
function miniMoveDrag(e) { if (miniDrag) miniMove(e) }
const miniUp = () => (miniDrag = false)
onBeforeUnmount(() => clearInterval(miniTimer))
</script>

<template>
  <div ref="root" class="absolute inset-0 overflow-hidden bg-[linear-gradient(160deg,#1b2636,#0b121c)]" @wheel="onWheel">
   <div class="absolute inset-0" :class="{ 'cursor-grab': zoomed && !panning, 'cursor-grabbing': panning }" :style="zoomStyle" @pointerdown="onPanDown" @pointermove="onPanMove" @pointerup="onPanUp" @pointercancel="onPanUp" @dblclick="zoomed && ($event.stopPropagation(), resetZoom())">
    <video v-show="playback" ref="pbVideo" class="absolute inset-0 size-full" :style="fitStyle" :class="{ 'brightness-50': pbState === 'norec' }" :muted="muted" playsinline />
    <img v-if="imgSrc && !showVideo && !playback" ref="imgEl" :src="imgSrc" class="absolute inset-0 size-full" :style="fitStyle" :class="{ 'grayscale brightness-50': frozen || offline }" draggable="false" alt="">
    <video ref="video" class="absolute inset-0 size-full" :style="fitStyle" :class="{ invisible: !showVideo }" autoplay :muted="muted" playsinline @playing="onPlaying" />
   </div>

    <!-- Zoom : niveau, réinitialisation et mini-carte -->
    <div v-if="zoomable && zoomed" class="absolute bottom-9 left-2 z-[5] flex flex-col gap-1.5" @dblclick.stop @click.stop>
      <div class="relative w-44 cursor-crosshair overflow-hidden rounded border border-white/30 bg-black/70 shadow-lg" :style="{ aspectRatio: size().w + ' / ' + size().h }"
        @pointerdown="miniDown" @pointermove="miniMoveDrag" @pointerup="miniUp" @pointercancel="miniUp" :title="$t('zoom.miniHint')">
        <canvas ref="mini" width="176" :height="Math.round(176 * size().h / size().w)" class="size-full" />
        <div class="pointer-events-none absolute border-2 border-accent bg-accent/15" :style="miniRect" />
      </div>
      <div class="flex items-center gap-1">
        <button class="flex size-[26px] items-center justify-center rounded-[5px] bg-black/65 text-white hover:bg-accent" :title="$t('zoom.out')" @click="setZoom(zoom.z / 1.5)">−</button>
        <span class="min-w-11 rounded bg-black/65 px-1.5 py-0.5 text-center font-mono text-[11px]">{{ zoom.z.toFixed(1) }}×</span>
        <button class="flex size-[26px] items-center justify-center rounded-[5px] bg-black/65 text-white hover:bg-accent" :title="$t('zoom.in')" @click="setZoom(zoom.z * 1.5)">+</button>
        <button class="rounded-[5px] bg-black/65 px-2 py-1 text-[11px] text-white hover:bg-accent" :title="$t('zoom.resetHint')" @click="resetZoom">{{ $t('zoom.reset') }}</button>
      </div>
    </div>

    <div class="absolute left-1.5 top-1.5 z-[3] flex flex-wrap items-center gap-1">
      <span v-if="playback" class="badge text-warn"><i class="bg-warn" />{{ $t('cell.playback') }}{{ tl.speed !== 1 ? ' ' + tl.speed + 'x' : '' }}</span>
      <span v-else-if="frozen" class="badge"><i class="bg-bad" />{{ $t('cell.interrupted') }}</span>
      <span v-else-if="offline" class="badge"><i class="bg-bad" />{{ $t('cell.offline') }}</span>
      <span v-else-if="showVideo" class="badge" :title="$t('cell.liveTitle')"><i class="bg-ok" />{{ $t('cell.live') }}</span>
      <span v-else class="badge" :title="wantVideo ? $t('cell.noVideoTitle') : $t('cell.snapshotTitle')">
        <i class="bg-warn" />{{ wantVideo && rtc === 'connecting' ? $t('cell.connecting') : $t('cell.snapshot') }}
      </span>
    </div>
    <div v-if="ui.showStats && statLine" class="absolute bottom-8 left-1.5 z-[3] max-w-[calc(100%-12px)] truncate rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/90" :title="$t('stats.cellTitle')">
        {{ statLine }}
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
