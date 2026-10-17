// Flux direct WebRTC via go2rtc (intégré à Frigate).
// Échange SDP en HTTP (sans « trickle ICE ») : on attend la fin de la collecte ICE avant d'envoyer l'offre.

let workingEndpoint = null // mémorise l'URL qui a répondu, pour ne pas retester à chaque caméra

import { baseUrl, isInternal } from './frigate'

// 1er essai : via Frigate (authentifié sur le port 8971). Les deux suivants ne servent
// qu'en accès interne, si l'API go2rtc est exposée directement.
function endpoints(server, cam) {
  const src = encodeURIComponent(cam)
  const viaFrigate = `${baseUrl(server)}/api/go2rtc/webrtc?src=${src}`
  if (!isInternal(server)) return [viaFrigate] // avec compte : jamais de contournement de l'authentification
  return [viaFrigate, `http://${server.host}:1984/api/webrtc?src=${src}`, `http://${server.host}:8555/api/webrtc?src=${src}`]
}

function waitIce(pc, ms = 2000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => { pc.removeEventListener('icegatheringstatechange', check); resolve() }
    const check = () => pc.iceGatheringState === 'complete' && done()
    pc.addEventListener('icegatheringstatechange', check)
    setTimeout(done, ms)
  })
}

/**
 * Ouvre le flux d'une caméra dans un élément <video>.
 * @returns {Promise<RTCPeerConnection>} — rejette si aucun point d'accès ne répond.
 */
export async function connectWebRTC(server, cam, video, onFail) {
  const pc = new RTCPeerConnection({ iceServers: [] })
  pc.addTransceiver('video', { direction: 'recvonly' })
  pc.addTransceiver('audio', { direction: 'recvonly' })
  pc.ontrack = (e) => { if (video.srcObject !== e.streams[0]) video.srcObject = e.streams[0] }
  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) onFail?.(pc.connectionState)
  }

  await pc.setLocalDescription(await pc.createOffer())
  await waitIce(pc)

  const list = workingEndpoint ? [workingEndpoint(server, cam)] : endpoints(server, cam)
  for (const url of list) {
    const r = await window.native.http({ url, method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: pc.localDescription.sdp, timeout: 5000 })
    if (r.ok && r.text.startsWith('v=')) {
      await pc.setRemoteDescription({ type: 'answer', sdp: r.text })
      if (!workingEndpoint) {
        const i = endpoints(server, cam).indexOf(url)
        workingEndpoint = (s, c) => endpoints(s, c)[i]
      }
      return pc
    }
  }
  pc.close()
  throw new Error('WebRTC indisponible')
}

export function resetWebRTCEndpoint() { workingEndpoint = null }
