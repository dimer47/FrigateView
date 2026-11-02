import { describe, it, expect } from 'vitest'
import { recordingsDisk, cameraUsage, logLevel, sizeParts } from '@/services/serverAdmin'

describe('serverAdmin', () => {
  const disk = recordingsDisk({ service: { storage: { '/media/frigate/recordings': { total: 1000, used: 250, free: 750 } } } })
  it('disque', () => {
    expect(disk).toEqual({ total: 1000, used: 250, free: 750, pct: 25 })
    expect(recordingsDisk({})).toBe(null)
  })
  it('usage par caméra et jours restants', () => {
    const u = cameraUsage({ a: { usage: 10, bandwidth: 2, usage_percent: 1 }, b: { usage: 50, bandwidth: 1 } }, disk)
    expect(u.rows.map((r) => r.cam)).toEqual(['b', 'a'])
    expect(u.rows[0].pct).toBe(5)
    expect(u.perHour).toBe(3)
    expect(u.daysLeft).toBeCloseTo(750 / 3 / 24)
    expect(cameraUsage({}, null).daysLeft).toBe(null)
  })
  it('niveau des lignes', () => {
    expect(logLevel('2026 frigate.app  ERROR   : boom')).toBe('error')
    expect(logLevel('12:00:00 WRN [rtsp] x')).toBe('warning')
    expect(logLevel('x INFO : ok')).toBe('info')
    expect(logLevel('rien')).toBe(null)
  })
  it('tailles', () => {
    expect(sizeParts(500)[0]).toBe('srv.mb')
    expect(sizeParts(2048)).toEqual(['srv.gb', 2, 1])
    expect(sizeParts(3 * 1024 * 1024)[0]).toBe('srv.tb')
  })
})
