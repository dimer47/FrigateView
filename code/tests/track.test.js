import { describe, it, expect } from 'vitest'
import { pathPoints, pathString, trackSteps } from '../src/renderer/src/services/track.js'

describe('parcours', () => {
  it('points du trajet, triés et bornés', () => {
    const ev = { data: { path_data: [[[0.5, 0.5], 12], [[0.2, 1.2], 10], ['bad', 1], [[NaN, 0], 3]] } }
    expect(pathPoints(ev)).toEqual([{ x: 0.2, y: 1, t: 10000 }, { x: 0.5, y: 0.5, t: 12000 }])
    expect(pathString(pathPoints(ev))).toBe('0.2,1 0.5,0.5')
  })
  it('sans trajet', () => { expect(pathPoints({})).toEqual([]); expect(pathPoints(null)).toEqual([]) })
  it('étapes triées, doublons retirés', () => {
    const tl = [
      { class_type: 'gone', timestamp: 30, data: {} },
      { class_type: 'visible', timestamp: 10, data: { zones: [] } },
      { class_type: 'entered_zone', timestamp: 12, data: { zones: ['chemin'] } },
      { class_type: 'entered_zone', timestamp: 13, data: { zones: ['chemin'] } },
      { class_type: 'attribute', timestamp: 14, data: { attribute: 'face' } }
    ]
    expect(trackSteps(tl).map((s) => s.kind)).toEqual(['visible', 'entered_zone', 'attribute', 'gone'])
    expect(trackSteps(tl)[1]).toMatchObject({ t: 12000, zones: ['chemin'] })
  })
  it('réponse invalide', () => expect(trackSteps({ error: 1 })).toEqual([]))
})
