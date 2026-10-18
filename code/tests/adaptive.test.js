import { describe, it, expect } from 'vitest'
import { CFG, metrics, isBad, isExcellent, initState, step, trialDone, budgetOk, readReport } from '../src/renderer/src/services/adaptive.js'

const good = { loss: 0, drop: 0, fps: 15, jitterMs: 50, freezes: 0, freezeMs: 0, kbpsAvail: null, stalled: false }
const bad = { ...good, loss: 0.1 }
const run = (s, ms, opts = {}, m = good) => { let a = []; for (let t = s.t; t <= s.t + ms; t += CFG.sampleMs) { const r = step(s.st, { now: t, m, lastTry: -1e9, ...opts }); s.st = r.state; a.push(r.action) } s.t += ms + CFG.sampleMs; return a }

describe('mesures', () => {
  it('metrics : pertes, images perdues, gigue, gel', () => {
    const a = { packetsReceived: 100, packetsLost: 0, framesDecoded: 100, framesDropped: 0, jitterBufferDelay: 1, jitterBufferEmittedCount: 10, freezeCount: 0 }
    const b = { packetsReceived: 190, packetsLost: 10, framesDecoded: 130, framesDropped: 0, jitterBufferDelay: 2, jitterBufferEmittedCount: 20, freezeCount: 1, fps: 15 }
    const m = metrics(a, b)
    expect(m.loss).toBeCloseTo(0.1)
    expect(m.jitterMs).toBeCloseTo(100)
    expect(m.freezes).toBe(1)
    expect(isBad(m)).toBe(true)
    expect(metrics(null, b)).toBe(null)
  })
  it('flux figé = dégradé ; excellent', () => {
    expect(isBad({ ...good, stalled: true })).toBe(true)
    expect(isBad(good)).toBe(false)
    expect(isExcellent(good)).toBe(true)
    expect(isExcellent({ ...good, kbpsAvail: 3000 })).toBe(false)
  })
  it('readReport', () => {
    const r = new Map([['a', { type: 'inbound-rtp', kind: 'video', packetsReceived: 5, framesDecoded: 3 }], ['b', { type: 'candidate-pair', nominated: true, availableIncomingBitrate: 9e6 }]])
    expect(readReport(r, 1)).toMatchObject({ t: 1, packetsReceived: 5, framesDecoded: 3, availableIncomingBitrate: 9e6 })
  })
})

describe('décisions', () => {
  it('démarrage en SD, essai HD après lecture stable', () => {
    const s = { st: initState(0), t: 0 }
    expect(s.st.level).toBe('low')
    expect(step(s.st, { now: 1500, m: good }).action).toBe('none')
    expect(run(s, CFG.firstTryMs + CFG.sampleMs)).toContain('tryHigh')
    expect(s.st.trying).toBe(true)
    s.st = trialDone(s.st, true, s.t)
    expect(s.st.level).toBe('high')
  })
  it('caméra agrandie : essai plus tôt', () => {
    expect(step(initState(0), { now: CFG.firstTryFocusedMs, m: good, focused: true }).action).toBe('tryHigh')
  })
  it('descente après 2 mesures dégradées seulement (hystérésis)', () => {
    let s = { ...initState(0), level: 'high', highSince: 0 }
    let r = step(s, { now: 1000, m: bad }); expect(r.action).toBe('none')
    r = step(r.state, { now: 2500, m: good }); expect(r.action).toBe('none') // une mesure isolée ne suffit pas
    r = step(r.state, { now: 4000, m: bad }); r = step(r.state, { now: 5500, m: bad })
    expect(r.action).toBe('down')
    expect(r.state.level).toBe('low')
  })
  it('backoff exponentiel après chaque échec', () => {
    let s = trialDone({ ...initState(0), trying: true }, false, 0)
    expect(s.nextTry).toBe(CFG.backoffBase)
    s = trialDone({ ...s, trying: true }, false, 0)
    expect(s.nextTry).toBe(CFG.backoffBase * 2)
    for (let i = 0; i < 20; i++) s = trialDone({ ...s, trying: true }, false, 0)
    expect(s.nextTry).toBe(CFG.backoffMax)
    // pas de nouvel essai avant l'échéance, même stable
    expect(step({ ...s, goodSince: -1e9 }, { now: CFG.backoffMax - 1, m: good }).action).toBe('none')
    expect(step({ ...s, goodSince: -1e9 }, { now: CFG.backoffMax, m: good }).action).toBe('tryHigh')
  })
  it('après un échec : période stable plus longue', () => {
    const s = { ...initState(0), failures: 1, nextTry: 0 }
    expect(step(s, { now: CFG.firstTryMs + 100, m: good }).action).toBe('none')
    expect(step(s, { now: CFG.stableMs, m: good }).action).toBe('tryHigh')
  })
  it('essai en cours : aucune autre décision', () => {
    expect(step({ ...initState(0), trying: true }, { now: 1e6, m: good }).action).toBe('none')
  })
})

describe('budget mosaïque', () => {
  it('une case à la fois, échelonnée', () => {
    expect(budgetOk({ tiles: 4, now: 10000, lastTry: 8000 })).toBe(false)
    expect(budgetOk({ tiles: 4, now: 10000, lastTry: 10000 - CFG.staggerMs })).toBe(true)
  })
  it('grande mosaïque : SD sauf débit excellent', () => {
    expect(budgetOk({ tiles: 9, now: 1e6 })).toBe(false)
    expect(budgetOk({ tiles: 9, now: 1e6, excellent: true })).toBe(true)
  })
  it('caméra agrandie toujours prioritaire', () => {
    expect(budgetOk({ focused: true, tiles: 16, now: 1, lastTry: 1 })).toBe(true)
  })
  it('step respecte le budget', () => {
    expect(step(initState(0), { now: 1e5, m: { ...good, kbpsAvail: 1000 }, tiles: 9 }).action).toBe('none')
  })
})
