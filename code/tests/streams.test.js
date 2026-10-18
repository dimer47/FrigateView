import { describe, it, expect } from 'vitest'
import { streamsOf, pickStream, hasSubStream, cellQuality } from '../src/renderer/src/services/streams.js'

const plain = { id: 'garage' }
const fr = { id: 'garage', streams: { Principal: 'garage', 'Sous-flux': 'garage_sub' } }

describe('streamsOf / hasSubStream', () => {
  it('sans live.streams : un seul flux, le nom de la caméra', () => {
    expect(streamsOf(plain)).toEqual([{ label: 'HD', id: 'garage' }])
    expect(streamsOf({ id: 'x', streams: {} })).toEqual([{ label: 'HD', id: 'x' }])
    expect(hasSubStream(plain)).toBe(false)
  })
  it('avec live.streams', () => {
    expect(streamsOf(fr)).toHaveLength(2)
    expect(hasSubStream(fr)).toBe(true)
  })
})

describe('pickStream', () => {
  it('sans sous-flux : toujours le flux principal', () => {
    expect(pickStream(plain, 'low').id).toBe('garage')
    expect(pickStream(plain, 'high').id).toBe('garage')
  })
  it('sous-flux reconnu par le libellé', () => {
    expect(pickStream(fr, 'low').id).toBe('garage_sub')
    expect(pickStream(fr, 'high').id).toBe('garage')
  })
  it('sous-flux reconnu par l’id, même placé en premier', () => {
    const c = { id: 'a', streams: { One: 'a_low', Two: 'a_main' } }
    expect(pickStream(c, 'low').id).toBe('a_low')
    expect(pickStream(c, 'high').id).toBe('a_main')
  })
  it('noms variés', () => {
    for (const [label, id] of [['SD', 'p2'], ['Basse', 'p2'], ['Mobile', 'p2'], ['x', 'cam_lq'], ['y', 'cam_small']]) {
      const c = { id: 'cam', streams: { Main: 'cam', [label]: id } }
      expect(pickStream(c, 'low').id).toBe(id)
    }
  })
  it('aucun nom reconnu : le dernier est le SD', () => {
    const c = { id: 'c', streams: { A: 'c1', B: 'c2' } }
    expect(pickStream(c, 'low').id).toBe('c2')
    expect(pickStream(c, 'high').id).toBe('c1')
  })
})

describe('cellQuality', () => {
  it('auto : SD dès 4 cases, HD agrandie ou petite mosaïque', () => {
    expect(cellQuality({ tiles: 4 })).toBe('low')
    expect(cellQuality({ tiles: 3 })).toBe('high')
    expect(cellQuality({ tiles: 9, focused: true })).toBe('high')
  })
  it('Allégé : même règle fixe', () => {
    expect(cellQuality({ pref: 'light', tiles: 4 })).toBe('low')
    expect(cellQuality({ pref: 'light', tiles: 2 })).toBe('high')
    expect(cellQuality({ pref: 'light', tiles: 16, focused: true })).toBe('high')
    expect(cellQuality({ pref: 'light', tiles: 16, override: 'high' })).toBe('high')
  })
  it('réglage global et choix de la case', () => {
    expect(cellQuality({ pref: 'high', tiles: 9 })).toBe('high')
    expect(cellQuality({ pref: 'low', focused: true })).toBe('low')
    expect(cellQuality({ pref: 'low', override: 'high' })).toBe('high')
  })
})
