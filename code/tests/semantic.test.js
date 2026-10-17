import { describe, it, expect } from 'vitest'
import { semanticEnabled, searchPath, similarPath, confidence, rankResults } from '../src/renderer/src/services/semantic.js'

describe('semantic', () => {
  it('activation lue dans la config', () => {
    expect(semanticEnabled({ semantic_search: { enabled: true } })).toBe(true)
    expect(semanticEnabled({ semantic_search: {} })).toBe(false)
    expect(semanticEnabled(null)).toBe(false)
  })
  it('chemins', () => {
    expect(searchPath({ query: '  voiture rouge ', cameras: ['route', 'devant'], limit: 20 })).toBe('/api/events/search?query=voiture%20rouge&search_type=thumbnail%2Cdescription&cameras=route,devant&limit=20')
    expect(searchPath({ query: 'x', type: 'bad' })).toContain('search_type=thumbnail&')
    expect(searchPath({ query: ' ' })).toBe(null)
    expect(similarPath('123.4-abc')).toBe('/api/events/search?search_type=similarity&event_id=123.4-abc&limit=50')
    expect(similarPath('')).toBe(null)
  })
  it('confiance comme l\'interface web de Frigate', () => {
    expect(confidence(0, false)).toBe(50)
    expect(confidence(-2, false)).toBe(88)
    expect(confidence(0.25, true)).toBe(75)
    expect(confidence(1.5, true)).toBe(0)
    expect(confidence(undefined, true)).toBe(null)
  })
  it('tri et exclusion', () => {
    const r = rankResults([{ id: 'a', search_distance: 0.5 }, { id: 'b', search_distance: 0.1 }, { id: 'src', search_distance: 0 }, { id: 'c' }], { similarity: true, exclude: 'src' })
    expect(r.map((x) => x.ev.id)).toEqual(['b', 'a', 'c'])
    expect(r[0].score).toBe(90)
    expect(rankResults(null)).toEqual([])
  })
})
