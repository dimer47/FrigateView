<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useServerStore } from '@/stores/server'
import { useUiStore } from '@/stores/ui'
import { snapshotUrl } from '@/services/frigate'
import { connectWebRTC } from '@/services/webrtc'

const props = defineProps({ camId: { type: String, required: true } })
const server = useServerStore()
const ui = useUiStore()

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
const wantVideo = computed(() => ui.liveMode === 'webrtc' && !frozen.value && !offline.value)
const showVideo = computed(() => wantVideo.value && rtc.value === 'playing')

/* ---- Images fixes (mode Images, ou en attendant / à défaut de la vidéo) ---- */
let snapTimer = null
function snapHeight() {
  const h = (root.value?.clientHeight || 360) * (window.devicePixelRatio || 1)
  return Math.max(180, Math.min(1080, Math.round(h / 60) * 60)) // paliers de 60 px pour profiter du cache
}
function loadSnapshot() {
  if (frozen.value || showVideo.value || !server.server) return
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
watch(() => props.camId, () => { imgSrc.value = ''; startSnapshots(); if (wantVideo.value) startVideo() })

let clock = null
onMounted(() => {
  startSnapshots()
  if (wantVideo.value) startVideo()
  clock = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => { stopSnapshots(); stopVideo(); clearInterval(clock) })

const time = computed(() => new Date(frozen.value ? lastFrame.value || now.value : now.value).toLocaleTimeString('fr-FR'))
</script>

<template>
  <div ref="root" class="absolute inset-0 bg-[linear-gradient(160deg,#1b2636,#0b121c)]">
    <img v-if="imgSrc && !showVideo" :src="imgSrc" class="absolute inset-0 size-full object-contain" :class="{ 'grayscale brightness-50': frozen || offline }" draggable="false" alt="">
    <video ref="video" class="absolute inset-0 size-full object-contain" :class="{ invisible: !showVideo }" autoplay muted playsinline @playing="onPlaying" />

    <div class="absolute left-1.5 top-1.5 z-[3] flex gap-1">
      <span v-if="frozen" class="badge"><i class="bg-bad" />FLUX INTERROMPU</span>
      <span v-else-if="offline" class="badge"><i class="bg-bad" />HORS LIGNE</span>
      <span v-else-if="showVideo" class="badge" title="Vidéo en direct (WebRTC)"><i class="bg-ok" />LIVE</span>
      <span v-else class="badge" :title="wantVideo ? 'Vidéo indisponible : images rafraîchies chaque seconde' : 'Images rafraîchies chaque seconde'">
        <i class="bg-warn" />{{ wantVideo && rtc === 'connecting' ? 'CONNEXION…' : 'IMAGE 1/s' }}
      </span>
    </div>

    <div v-if="frozen || offline || (imgError && !showVideo)" class="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-1 p-2.5 text-center text-[13px] text-ink-2">
      <strong :class="offline || frozen ? 'text-bad' : 'text-ink'">{{ frozen ? 'Flux interrompu' : offline ? 'Hors ligne' : 'Image indisponible' }}</strong>
      <span v-if="frozen && lastFrame">Dernière image à {{ time }}</span>
      <span v-else-if="offline">La caméra n'envoie plus d'images à Frigate</span>
      <span v-else>Nouvel essai chaque seconde</span>
    </div>

    <div class="absolute inset-x-0 bottom-0 z-[3] flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 to-transparent px-2.5 py-1.5">
      <span class="truncate text-[13px] font-semibold [text-shadow:0_1px_2px_#000]">{{ cam?.name || camId }}</span>
      <span class="whitespace-nowrap font-mono text-xs text-ink-2">{{ time }}</span>
    </div>
  </div>
</template>
