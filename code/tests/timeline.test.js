import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/i18n', () => ({ t: (k) => k }))
import { createPinia, setActivePinia } from 'pinia'
import { mergeRanges, reviewType, useTimelineStore, HOUR, DAY } from '@/stores/timeline'

describe('mergeRanges', () => {
  it('fusionne si trou ≤ 2 s, coupe sinon', () => {
    expect(mergeRanges([{ s: 0, e: 10e3 }, { s: 12e3, e: 20e3 }, { s: 23e3, e: 30e3 }])).toEqual([{ s: 0, e: 20e3 }, { s: 23e3, e: 30e3 }])
  })
  it('chevauchement et inclusion', () => {
    expect(mergeRanges([{ s: 0, e: 10e3 }, { s: 5e3, e: 8e3 }])).toEqual([{ s: 0, e: 10e3 }])
  })
  it('liste vide, sans muter l’entrée', () => {
    expect(mergeRanges([])).toEqual([])
    const a = [{ s: 0, e: 1 }, { s: 1, e: 2 }]
    mergeRanges(a)
    expect(a[0]).toEqual({ s: 0, e: 1 })
  })
})

describe('reviewType', () => {
  it('priorité personne > véhicule > animal', () => {
    expect(reviewType({ data: { objects: ['car', 'person'] } })).toBe('person')
    expect(reviewType({ data: { objects: ['face'] } })).toBe('person')
    expect(reviewType({ data: { objects: ['dog', 'car'] } })).toBe('car')
    expect(reviewType({ data: { objects: ['cat'] } })).toBe('animal')
    expect(reviewType({})).toBe('other')
  })
})

describe('store timeline', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('seek borné à la rétention et retour au direct', () => {
    const s = useTimelineStore()
    const now = Date.now()
    s.seek(now - 10 * DAY)
    expect(s.live).toBe(false)
    expect(s.time).toBeGreaterThanOrEqual(now - 2 * DAY)
    s.seek(now + 1000)
    expect(s.live).toBe(true)
  })

  it('zoom borné entre 5 min et 2 jours', () => {
    const s = useTimelineStore()
    s.zoom(1e-6)
    expect(s.view.end - s.view.start).toBe(5 * 60e3)
    s.zoom(1e6)
    expect(s.view.end - s.view.start).toBe(2 * DAY)
  })

  it('pruneChunks retire les heures trop anciennes', () => {
    const s = useTimelineStore()
    const now = Date.now(), h = Math.floor(now / HOUR)
    s.chunks = { 'a:b:1': {}, [`cam:${h}`]: {}, [`cam:${h - 60}`]: {} }
    s.pruneChunks(now)
    expect(Object.keys(s.chunks)).toEqual([`cam:${h}`])
  })

  it('rangesFor dédoublonne les revues et hasRecording', () => {
    const s = useTimelineStore()
    const h = Math.floor(s.view.start / HOUR)
    const r = { id: 'r1', s: h * HOUR, e: h * HOUR + 1 }
    s.chunks[`cam:${h}`] = { rec: [{ s: h * HOUR, e: h * HOUR + 1000 }], motion: [], reviews: [r] }
    s.chunks[`cam:${h + 1}`] = { rec: [], motion: [], reviews: [r] }
    expect(s.rangesFor('cam').reviews).toHaveLength(1)
    expect(s.hasRecording('cam', h * HOUR + 500)).toBe(true)
    expect(s.hasRecording('cam', h * HOUR + 1500)).toBe(false)
    expect(s.hasRecording('autre', h * HOUR)).toBe(null)
  })
})
