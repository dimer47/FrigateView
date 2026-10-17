import { describe, it, expect } from 'vitest'
import { toRect, eventBoxes, boxCaption, pickEvent } from '../src/renderer/src/services/boxes.js'

describe('toRect', () => {
  it('[x, y, w, h] en fractions, borné à l\'image', () => {
    expect(toRect([0.1, 0.2, 0.3, 0.4])).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })
    const r = toRect([0.9, -0.1, 0.3, 0.5])
    expect(r.x).toBe(0.9); expect(r.y).toBe(0); expect(r.w).toBeCloseTo(0.1); expect(r.h).toBeCloseTo(0.4)
  })
  it('valeurs invalides → null', () => {
    for (const b of [null, undefined, [1, 2, 3], [0, 0, 0, 0.5], [0.1, 0.1, 'a', 0.1], [0.1, 0.1, NaN, 0.1], [1.2, 0, 0.1, 0.1]]) expect(toRect(b)).toBe(null)
  })
})

describe('eventBoxes', () => {
  it('objet puis attributs, noms visage et plaque', () => {
    const person = { label: 'person', sub_label: 'Alex', data: { box: [0.1, 0.1, 0.2, 0.5], score: 0.8, attributes: [{ label: 'face', score: 0.9, box: [0.15, 0.12, 0.05, 0.08] }] } }
    const b = eventBoxes(person)
    expect(b).toHaveLength(2)
    expect(b[0]).toMatchObject({ kind: 'object', label: 'person', score: 0.8, name: 'Alex' })
    expect(b[1]).toMatchObject({ kind: 'attribute', label: 'face', name: 'Alex' })
    const car = { label: 'car', sub_label: ['Voiture Alex', 0.9], data: { box: [0.4, 0.5, 0.3, 0.3], top_score: 0.7, recognized_license_plate: 'AB-123-CD', attributes: [{ label: 'license_plate', score: 0.95, box: [0.5, 0.7, 0.08, 0.04] }, { label: 'x', box: null }] } }
    const c = eventBoxes(car)
    expect(c.map((x) => x.name)).toEqual(['Voiture Alex', 'AB-123-CD'])
    expect(c[0].score).toBe(0.7)
  })
  it('sans cadre (événement ancien, sans meilleure image) → liste vide', () => {
    expect(eventBoxes({ label: 'car', data: { box: null } })).toEqual([])
    expect(eventBoxes(null)).toEqual([])
  })
})

describe('boxCaption / pickEvent', () => {
  it('légende', () => {
    expect(boxCaption({ label: 'person', score: 0.874, name: 'Alex' }, (l) => l.toUpperCase())).toBe('PERSON 87 % · Alex')
    expect(boxCaption({ label: 'face', score: null, name: '' })).toBe('face')
  })
  it('objet nommé d\'abord, puis meilleur score', () => {
    expect(pickEvent([{ id: 'a', data: { top_score: 0.9 } }, { id: 'b', sub_label: 'Alex', data: { top_score: 0.6 } }]).id).toBe('b')
    expect(pickEvent([{ id: 'a', data: { top_score: 0.5 } }, { id: 'c', data: { top_score: 0.8 } }]).id).toBe('c')
    expect(pickEvent([])).toBe(null)
  })
})
