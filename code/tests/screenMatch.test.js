import { describe, it, expect } from 'vitest'
import { remapScreens } from '../src/main/screenMatch.js'

const b = (x, y, width = 1920, height = 1080) => ({ x, y, width, height })

describe('écrans des murs vidéo', () => {
  it('identifiant inchangé : nom et position mémorisés', () => {
    const r = remapScreens({ 5: { enabled: true } }, [{ id: 5, label: 'DELL', bounds: b(0, 0) }])
    expect(r.moved).toEqual([])
    expect(r.conf['5']).toMatchObject({ enabled: true, label: 'DELL', bounds: b(0, 0) })
  })
  it('identifiant changé : retrouvé par nom et position', () => {
    const conf = { 5: { enabled: true, layout: 'L', label: 'DELL', bounds: b(1920, 0) } }
    const r = remapScreens(conf, [{ id: 1, label: 'Mac', bounds: b(0, 0) }, { id: 9, label: 'DELL', bounds: b(1920, 0) }])
    expect(r.moved).toEqual([['5', '9']])
    expect(r.conf['9']).toMatchObject({ layout: 'L' })
    expect(r.conf['5']).toBeUndefined()
  })
  it('deux écrans du même modèle : départagés par la position', () => {
    const conf = { 5: { label: 'DELL', bounds: b(3840, 0) } }
    const r = remapScreens(conf, [{ id: 8, label: 'DELL', bounds: b(1920, 0) }, { id: 9, label: 'DELL', bounds: b(3840, 0) }])
    expect(r.moved).toEqual([['5', '9']])
  })
  it('même modèle, positions changées : ambigu, rien déplacé', () => {
    const conf = { 5: { label: 'DELL', bounds: b(0, 900, 2560, 1440) } }
    const r = remapScreens(conf, [{ id: 8, label: 'DELL', bounds: b(1920, 0) }, { id: 9, label: 'DELL', bounds: b(3840, 0) }])
    expect(r.moved).toEqual([])
    expect(r.conf['5']).toBeDefined()
  })
  it('écran débranché : réglage gardé', () => {
    const r = remapScreens({ 5: { label: 'DELL', bounds: b(0, 0) } }, [{ id: 1, label: 'Mac', bounds: b(0, 0) }])
    expect(r.conf['5']).toBeDefined()
    expect(r.moved).toEqual([])
  })
  it('écran déjà configuré : pas pris par un autre mur', () => {
    const conf = { 9: { label: 'DELL', bounds: b(0, 0) }, 5: { label: 'DELL', bounds: b(0, 0) } }
    const r = remapScreens(conf, [{ id: 9, label: 'DELL', bounds: b(0, 0) }])
    expect(Object.keys(r.conf).sort()).toEqual(['5', '9'])
  })
})
