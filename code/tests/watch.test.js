import { describe, it, expect } from 'vitest'
import { parseTrackUpdate, matchWatch, watchConf, hasWatch, createGate, toggleIn, normPlate } from '../src/renderer/src/services/watch'

const face = (name, id = 'a') => ({ type: 'face', id, camera: 'devant', name, score: 0.9, timestamp: 1000 })
const lpr = (plate, name = null, id = 'b') => ({ type: 'lpr', id, camera: 'route', name, plate, score: 0.9, timestamp: 1000 })
const conf = (o = {}) => watchConf({ watchFaces: [], watchPlates: [], ...o })

describe('parseTrackUpdate', () => {
  it('lit un message face ou lpr (chaîne JSON ou objet)', () => {
    expect(parseTrackUpdate(JSON.stringify(face('Alex')))).toEqual({ kind: 'face', id: 'a', cam: 'devant', s: 1e6, name: 'Alex', plate: null })
    expect(parseTrackUpdate(lpr('AB-123-CD', 'Voiture Alex'))).toMatchObject({ kind: 'plate', plate: 'AB-123-CD', name: 'Voiture Alex' })
  })
  it('ignore les autres types, les messages sans id et le JSON invalide', () => {
    expect(parseTrackUpdate({ type: 'description', id: 'x' })).toBeNull()
    expect(parseTrackUpdate({ type: 'face', name: 'Alex' })).toBeNull()
    expect(parseTrackUpdate('{oops')).toBeNull()
  })
})

describe('matchWatch', () => {
  it('visage connu coché', () => {
    expect(matchWatch(parseTrackUpdate(face('Alex')), conf({ watchFaces: ['Alex'] }))).toMatchObject({ key: 'face:Alex', label: 'Alex' })
    expect(matchWatch(parseTrackUpdate(face('Marie')), conf({ watchFaces: ['Alex'] }))).toBeNull()
  })
  it('visage inconnu seulement si l’option est active', () => {
    expect(matchWatch(parseTrackUpdate(face('unknown')), conf({ watchFaces: ['Alex'] }))).toBeNull()
    expect(matchWatch(parseTrackUpdate(face('unknown')), conf({ watchUnknownFace: true }))).toMatchObject({ unknown: true })
    expect(matchWatch(parseTrackUpdate(face('Alex')), conf({ watchUnknownFace: true }))).toBeNull()
  })
  it('plaque par nom connu ou plaque brute (casse, espaces, tirets ignorés)', () => {
    expect(matchWatch(parseTrackUpdate(lpr('AB-123-CD', 'Voiture Alex')), conf({ watchPlates: ['Voiture Alex'] }))).toMatchObject({ key: 'plate:Voiture Alex' })
    expect(matchWatch(parseTrackUpdate(lpr('ab 123 cd')), conf({ watchPlates: ['AB-123-CD'] }))).toMatchObject({ key: 'plate:AB123CD' })
    expect(matchWatch(parseTrackUpdate(lpr('ZZ-001-ZZ')), conf({ watchPlates: ['AB-123-CD'] }))).toBeNull()
    expect(matchWatch(parseTrackUpdate(face('AB-123-CD')), conf({ watchPlates: ['AB-123-CD'] }))).toBeNull()
  })
  it('hasWatch', () => {
    expect(hasWatch(conf())).toBe(false)
    expect(hasWatch(conf({ watchUnknownFace: true }))).toBe(true)
  })
})

describe('createGate', () => {
  it('une seule notification par objet suivi', () => {
    const g = createGate()
    expect(g.allow('a', 'face:Alex', 0)).toBe(true)
    expect(g.allow('a', 'face:Alex', 100e3)).toBe(false)
    expect(g.seen('a')).toBe(true)
  })
  it('même cible : silence pendant perTarget, puis de nouveau', () => {
    const g = createGate({ perTarget: 60e3 })
    expect(g.allow('a', 'k', 0)).toBe(true)
    expect(g.allow('b', 'k', 30e3)).toBe(false)
    expect(g.allow('c', 'k', 61e3)).toBe(true)
    expect(g.allow('d', 'other', 61e3)).toBe(true)
  })
  it('plafond global par minute', () => {
    const g = createGate({ perMinute: 2 })
    expect(g.allow('a', 'k1', 0)).toBe(true)
    expect(g.allow('b', 'k2', 1)).toBe(true)
    expect(g.allow('c', 'k3', 2)).toBe(false)
    expect(g.seen('c')).toBe(false) // pas consommé : peut passer plus tard
    expect(g.allow('c', 'k3', 61e3)).toBe(true)
  })
  it('mémoire bornée', () => {
    const g = createGate({ perTarget: 0, perMinute: 1e9, memory: 3 })
    for (const id of ['a', 'b', 'c', 'd']) g.allow(id, id, 0)
    expect(g.seen('a')).toBe(false)
    expect(g.seen('d')).toBe(true)
  })
})

it('toggleIn et normPlate', () => {
  expect(toggleIn(['a'], 'b')).toEqual(['a', 'b'])
  expect(toggleIn(['a', 'b'], 'a')).toEqual(['b'])
  expect(normPlate(' ab-12 3_cd ')).toBe('AB123CD')
})
