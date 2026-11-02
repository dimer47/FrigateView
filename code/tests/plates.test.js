import { describe, it, expect } from 'vitest'
import { lprEnabled, knownPlates, matchKnown, aggregatePlates, filterPlates, ANY_PLATE, canEditKnown, hotReloadKnown, validPlateName, namePlate } from '@/services/plates'

const ev = (id, plate, t, camera = 'route', sub = null) => ({ id, camera, start_time: t, sub_label: sub, data: { recognized_license_plate: plate } })

describe('lprEnabled', () => {
  it('global, par caméra, ou absent', () => {
    expect(lprEnabled({ lpr: { enabled: true } })).toBe(true)
    expect(lprEnabled({ lpr: { enabled: false }, cameras: { a: { lpr: { enabled: true } } } })).toBe(true)
    expect(lprEnabled({})).toBe(false)
    expect(lprEnabled(null)).toBe(false)
  })
})

describe('knownPlates / matchKnown', () => {
  const known = knownPlates({ lpr: { known_plates: { Zoé: ['AB-1\\d\\d-CD'], alex: ['XY-777-QA', null], bad: ['('] } } })
  it('trie par nom et ignore les valeurs nulles', () => {
    expect(known.map((k) => k.name)).toEqual(['alex', 'bad', 'Zoé'])
    expect(known[0].plates).toEqual(['XY-777-QA'])
  })
  it('regex ancrée comme Frigate ; regex invalide sans planter', () => {
    expect(matchKnown('AB-123-CD', known)).toBe('Zoé')
    expect(matchKnown('XAB-123-CD', known)).toBe(null)
    expect(matchKnown('XY-777-QA', known)).toBe('alex')
    expect(matchKnown('(', known)).toBe('bad')
    expect(knownPlates({ lpr: {} })).toEqual([])
  })
})

describe('aggregatePlates', () => {
  const known = [{ name: 'Alex', plates: ['XY-777-QA'] }, { name: 'Livreur', plates: ['ZZ-.*'] }]
  const list = aggregatePlates([
    ev('1', 'XY-777-QA', 100), ev('2', 'XY-777-QA', 300, 'devant'), ev('3', 'AB-123-CD', 200),
    ev('4', null, 400), ev('5', 'ZZ-001-ZZ', 50, 'route', 'Livreur'), { id: '6', start_time: 500 }
  ], known)
  it('regroupe, compte, trie par dernière vue', () => {
    expect(list.map((p) => p.plate)).toEqual(['XY-777-QA', 'AB-123-CD', 'ZZ-001-ZZ'])
    expect(list[0]).toMatchObject({ count: 2, cams: ['route', 'devant'], last: 300000, name: 'Alex' })
    expect(list[0].lastEvent.id).toBe('2')
    expect(list[0].events.map((e) => e.id)).toEqual(['2', '1'])
    expect(list[1].name).toBe(null)
    expect(list[2].name).toBe('Livreur')
  })
  it('filtre par plaque (sans tirets, casse ignorée), nom, caméra', () => {
    expect(filterPlates(list, 'xy777').map((p) => p.plate)).toEqual(['XY-777-QA'])
    expect(filterPlates(list, 'livr').map((p) => p.plate)).toEqual(['ZZ-001-ZZ'])
    expect(filterPlates(list, 'Devant', (c) => c.toUpperCase()).map((p) => p.plate)).toEqual(['XY-777-QA'])
    expect(filterPlates(list, '  ')).toBe(list)
  })
  it('requête « plaque présente » = regex', () => expect(ANY_PLATE).toBe('^.+'))
})

describe('nommage des plaques', () => {
  const known = [{ name: 'Marie', plates: ['AB-123-CD', 'EF-456-GH'] }, { name: 'Paul', plates: ['IJ-789-KL'] }]
  it('versions', () => {
    expect(canEditKnown('0.16.2')).toBe(false)
    expect(canEditKnown('0.17.0-abc')).toBe(true)
    expect(hotReloadKnown('0.17.2')).toBe(false)
    expect(hotReloadKnown('0.18.2-xyz')).toBe(true)
    expect(canEditKnown('')).toBe(false)
  })
  it('nom valide', () => {
    expect(validPlateName(' Marie ')).toBe(true)
    expect(validPlateName('')).toBe(false)
    expect(validPlateName('a.b')).toBe(false)
    expect(validPlateName('x'.repeat(51))).toBe(false)
  })
  it('ajout, déplacement, retrait', () => {
    expect(namePlate(known, 'ZZ-000-ZZ', 'Paul').map).toEqual({ Marie: ['AB-123-CD', 'EF-456-GH'], Paul: ['IJ-789-KL', 'ZZ-000-ZZ'] })
    expect(namePlate(known, 'IJ-789-KL', 'Marie')).toEqual({ map: { Marie: ['AB-123-CD', 'EF-456-GH', 'IJ-789-KL'] }, emptied: ['Paul'] })
    expect(namePlate(known, 'AB-123-CD', '')).toEqual({ map: { Marie: ['EF-456-GH'], Paul: ['IJ-789-KL'] }, emptied: [] })
    expect(namePlate(known, 'IJ-789-KL', 'Paul').emptied).toEqual([])
  })
})
