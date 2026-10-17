import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/i18n', () => ({ t: (k) => k }))
import { createPinia, setActivePinia } from 'pinia'
import { useEventsStore } from '@/stores/events'

const srv = { host: 'nvr', port: 8971 }
const raw = (id, sec, extra = {}) => ({ id, camera: 'cam', start_time: sec, end_time: null, severity: 'alert', data: { objects: ['person'] }, ...extra })
const nowS = () => Date.now() / 1000

describe('events.upsert', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('insère trié du plus récent au plus ancien', () => {
    const s = useEventsStore()
    const n = nowS()
    s.upsert(srv, raw('b', n - 200))
    s.upsert(srv, raw('a', n - 100))
    s.upsert(srv, raw('c', n - 300))
    s.upsert(srv, raw('d', n - 150))
    expect(s.items.map((e) => e.id)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('doublon : mise à jour sur place, état « vu » conservé', () => {
    const s = useEventsStore()
    const n = nowS()
    expect(s.upsert(srv, raw('a', n - 10))).not.toBe(null)
    s.items[0].seen = true
    expect(s.upsert(srv, raw('a', n - 10, { end_time: n }))).toBe(null)
    expect(s.items).toHaveLength(1)
    expect(s.items[0].seen).toBe(true)
    expect(s.items[0].e).toBe(n * 1000)
  })

  it('purge au-delà de 2 jours, sauf l’événement ouvert', () => {
    const s = useEventsStore()
    const n = nowS()
    s.upsert(srv, raw('recent', n - 60))
    s.upsert(srv, raw('vieux', n - 3 * 86400))
    expect(s.items.map((e) => e.id)).toEqual(['recent'])
    s.detailId = 'vieux2'
    s.items.push({ id: 'vieux2', s: (n - 3 * 86400) * 1000 })
    s.prune()
    expect(s.items.map((e) => e.id)).toEqual(['recent', 'vieux2'])
  })
})
