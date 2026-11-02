import { describe, it, expect } from 'vitest'
import { applyOrder, moveId } from '../src/renderer/src/services/camOrder.js'

const cams = ['route', 'devant', 'bureau'].map((id) => ({ id }))

describe('ordre des caméras', () => {
  it('sans ordre enregistré : ordre Frigate', () => expect(applyOrder(cams, null).map((c) => c.id)).toEqual(['route', 'devant', 'bureau']))
  it('ordre enregistré appliqué, nouvelle caméra à la fin', () =>
    expect(applyOrder([...cams, { id: 'neuve' }], ['bureau', 'route', 'devant']).map((c) => c.id)).toEqual(['bureau', 'route', 'devant', 'neuve']))
  it('placer avant / après', () => {
    expect(moveId(['a', 'b', 'c'], 'c', 'a', false)).toEqual(['c', 'a', 'b'])
    expect(moveId(['a', 'b', 'c'], 'a', 'c', true)).toEqual(['b', 'c', 'a'])
  })
  it('cible inconnue : rien ne change', () => expect(moveId(['a', 'b'], 'a', 'x', false)).toEqual(['a', 'b']))
})
