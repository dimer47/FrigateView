import { describe, it, expect } from 'vitest'
import { wantNotify } from '../src/renderer/src/services/notifyRules.js'

const base = { notify: true, notifyTypes: { person: true, car: false } }
const ev = { type: 'person', cam: 'route', severity: 'detection', zones: ['chemin'] }

describe('règles de notification', () => {
  it('type activé', () => expect(wantNotify(ev, base)).toBe(true))
  it('type désactivé, coupé, ne pas déranger', () => {
    expect(wantNotify({ ...ev, type: 'car' }, base)).toBe(false)
    expect(wantNotify(ev, { ...base, notify: false })).toBe(false)
    expect(wantNotify(ev, { ...base, dnd: true })).toBe(false)
  })
  it('alertes seulement', () => {
    expect(wantNotify(ev, { ...base, notifySeverity: 'alert' })).toBe(false)
    expect(wantNotify({ ...ev, severity: 'alert' }, { ...base, notifySeverity: 'alert' })).toBe(true)
  })
  it('caméra exclue', () => expect(wantNotify(ev, { ...base, notifyCamsOff: ['route'] })).toBe(false))
  it('zones requises', () => {
    expect(wantNotify(ev, { ...base, notifyZones: ['chemin'] })).toBe(true)
    expect(wantNotify(ev, { ...base, notifyZones: ['portail'] })).toBe(false)
    expect(wantNotify({ ...ev, zones: [] }, { ...base, notifyZones: ['chemin'] })).toBe(false)
  })
  it('réglages anciens (sans les nouvelles clés)', () => expect(wantNotify(ev, base)).toBe(true))
})
