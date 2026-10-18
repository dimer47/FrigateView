// Flux adaptatif HD / SD (mode Auto, caméras avec sous-flux).
// Logique pure et testable : séries de statistiques WebRTC en entrée, décision en sortie.
// Démarrage en SD (image rapide), essai HD après une lecture stable, redescente en SD
// si la qualité se dégrade de façon soutenue, remontée retardée (backoff exponentiel).

export const CFG = {
  sampleMs: 1500, // période de mesure
  badSamples: 3, // mesures dégradées consécutives avant redescente (~4,5 s)
  firstTryMs: 4000, // lecture SD stable avant le premier essai HD
  firstTryFocusedMs: 1500, // caméra agrandie : essai HD presque immédiat
  stableMs: 20000, // lecture stable exigée avant une nouvelle remontée après un échec
  trialTimeoutMs: 8000,
  settleMs: 6000, // juste après la bascule HD : à-coups normaux (image clé, tampon), non comptés
  freezeShare: 0.8, // gel > 80 % de l'intervalle = dégradé (les flux 4K arrivent par à-coups : « gels » courts normaux)
  minFps: 2, // images réellement décodées par seconde en dessous desquelles le flux est jugé bloqué
  maxJitterMs: 1000, // la HD doit afficher une image dans ce délai, sinon abandon
  backoffBase: 30000, // délai après le 1er échec, doublé à chaque échec suivant
  backoffMax: 10 * 60000,
  resetAfterMs: 5 * 60000, // HD stable pendant 5 min : compteur d'échecs remis à zéro
  staggerMs: 5000, // une seule case tente la HD à la fois, espacées de 5 s
  bigMosaic: 9 // à partir de 9 cases : HD seulement si le débit est clairement excellent
}

// Statistiques brutes utiles d'un rapport getStats() (inbound-rtp vidéo + paire de candidats retenue)
export function readReport(report, t = Date.now()) {
  const raw = { t }
  report.forEach((s) => {
    if (s.type === 'inbound-rtp' && s.kind === 'video') {
      Object.assign(raw, {
        packetsReceived: s.packetsReceived || 0, packetsLost: s.packetsLost || 0, framesDropped: s.framesDropped || 0,
        framesDecoded: s.framesDecoded || 0, fps: s.framesPerSecond, jitterBufferDelay: s.jitterBufferDelay || 0,
        jitterBufferEmittedCount: s.jitterBufferEmittedCount || 0, freezeCount: s.freezeCount || 0, totalFreezesDuration: s.totalFreezesDuration || 0
      })
    }
    if (s.type === 'candidate-pair' && s.nominated && s.availableIncomingBitrate) raw.availableIncomingBitrate = s.availableIncomingBitrate
  })
  return raw
}

// Indicateurs sur l'intervalle entre deux relevés
export function metrics(prev, cur) {
  if (!prev || !cur) return null
  const d = (k) => Math.max(0, (cur[k] || 0) - (prev[k] || 0))
  const pkts = d('packetsReceived') + d('packetsLost'), frames = d('framesDecoded') + d('framesDropped'), emitted = d('jitterBufferEmittedCount')
  return {
    ms: cur.t && prev.t ? cur.t - prev.t : CFG.sampleMs,
    loss: pkts ? d('packetsLost') / pkts : 0,
    drop: frames ? d('framesDropped') / frames : 0,
    fps: cur.fps ?? null,
    jitterMs: emitted ? (d('jitterBufferDelay') / emitted) * 1000 : 0,
    freezes: d('freezeCount'),
    freezeMs: d('totalFreezesDuration') * 1000,
    kbpsAvail: cur.availableIncomingBitrate ? cur.availableIncomingBitrate / 1000 : null,
    decFps: d('framesDecoded') / (((cur.t && prev.t ? cur.t - prev.t : CFG.sampleMs) || CFG.sampleMs) / 1000),
    stalled: d('framesDecoded') === 0
  }
}

export const isBad = (m) => !!m && (m.stalled || m.loss > 0.03 || m.drop > 0.1 || m.freezeMs > CFG.freezeShare * (m.ms || CFG.sampleMs) || m.jitterMs > CFG.maxJitterMs || (m.decFps != null && m.decFps < CFG.minFps))
export const isExcellent = (m) => !!m && !isBad(m) && !m.freezes && m.loss < 0.005 && m.drop < 0.02 && m.jitterMs < 150

// Raison lisible (clé i18n + valeurs) pour l'info-bulle
export function reason(m) {
  if (!m) return null
  if (m.stalled || m.freezeMs > CFG.freezeShare * (m.ms || CFG.sampleMs)) return { key: 'freeze' }
  if (m.loss > 0.03) return { key: 'loss', pct: Math.round(m.loss * 100) }
  if (m.drop > 0.1) return { key: 'drop', pct: Math.round(m.drop * 100) }
  if (m.jitterMs > CFG.maxJitterMs) return { key: 'jitter', ms: Math.round(m.jitterMs) }
  return { key: 'ok', pct: Math.round(m.loss * 1000) / 10 }
}

export const initState = (now) => ({ level: 'low', trying: false, badStreak: 0, goodSince: now, highSince: null, failures: 0, nextTry: 0, excellent: false })

const backoff = (failures) => Math.min(CFG.backoffMax, CFG.backoffBase * 2 ** Math.max(0, failures - 1))

// Budget de la mosaïque : caméra agrandie prioritaire ; ailleurs une case à la fois, espacées,
// et pas de HD en grande mosaïque sauf débit clairement excellent.
export function budgetOk({ focused = false, tiles = 1, excellent = false, now, lastTry = 0 }) {
  if (focused) return true
  if (tiles >= CFG.bigMosaic && !excellent) return false
  return now - lastTry >= CFG.staggerMs
}

// Une mesure → nouvel état + action : none | tryHigh | down
export function step(s, { now, m, focused = false, tiles = 1, lastTry = 0 }) {
  s = { ...s }
  if (m) {
    const bad = isBad(m)
    s.badStreak = bad ? s.badStreak + 1 : 0
    s.excellent = isExcellent(m)
    if (bad) s.goodSince = now
  }
  if (s.trying) return { state: s, action: 'none' }
  if (s.level === 'high') {
    if (now - s.highSince < CFG.settleMs) { s.badStreak = 0; return { state: s, action: 'none' } }
    if (s.badStreak >= CFG.badSamples) {
      s.failures++
      Object.assign(s, { level: 'low', badStreak: 0, goodSince: now, highSince: null, nextTry: now + backoff(s.failures) })
      return { state: s, action: 'down' }
    }
    if (s.failures && now - s.highSince >= CFG.resetAfterMs) s.failures = 0
    return { state: s, action: 'none' }
  }
  const wait = s.failures ? CFG.stableMs : focused ? CFG.firstTryFocusedMs : CFG.firstTryMs
  if (s.badStreak === 0 && now >= s.nextTry && now - s.goodSince >= wait && budgetOk({ focused, tiles, excellent: s.excellent, now, lastTry })) {
    s.trying = true
    return { state: s, action: 'tryHigh' }
  }
  return { state: s, action: 'none' }
}

// Fin d'un essai HD : réussi (première image affichée) ou abandonné (délai, erreur)
export function trialDone(s, ok, now) {
  s = { ...s, trying: false, badStreak: 0, goodSince: now }
  if (ok) return { ...s, level: 'high', highSince: now }
  s.failures++
  return { ...s, nextTry: now + backoff(s.failures) }
}

// Dernier essai HD lancé, toutes cases confondues (échelonnement)
export const slot = { lastTry: 0 }
