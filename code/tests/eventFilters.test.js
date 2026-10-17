import { describe, it, expect } from 'vitest'
import { isPlate, classify, matchFilters, toggleFilter, filterOptions, historyQuery, mergePages, rangePreset, rangeFromDates, fromEvent, emptyFilters, hasFilters } from '../src/renderer/src/stores/eventFilters.js'

const ev = (o = {}) => ({ id: 'x', cam: 'route', s: 1000, objects: ['person'], subLabels: [], zones: [], ...o })

describe('visage ou plaque', () => {
  it('heuristique sur le format', () => {
    for (const p of ['AB-123-CD', 'AB123CD', '1ABC234', 'B 1234 XYZ']) expect(isPlate(p)).toBe(true)
    for (const f of ['Alex', 'Marie-Jo', 'JEAN', 'bob', '1234', 'ab-123-cd']) expect(isPlate(f)).toBe(false)
  })
  it('plaques connues du serveur prioritaires', () => {
    expect(isPlate('Toto', new Set(['Toto']))).toBe(true)
    expect(classify(['Alex', 'AB-123-CD', ''])).toEqual({ faces: ['Alex'], plates: ['AB-123-CD'] })
  })
})

describe('fusion des filtres', () => {
  it('ET entre catégories, OU dans une catégorie', () => {
    const e = ev({ objects: ['car'], subLabels: ['AB-123-CD'], zones: ['portail'] })
    expect(matchFilters(e, emptyFilters())).toBe(true)
    expect(matchFilters(e, { ...emptyFilters(), object: ['car', 'dog'], plate: ['AB-123-CD'] })).toBe(true)
    expect(matchFilters(e, { ...emptyFilters(), object: ['car'], zone: ['allee'] })).toBe(false)
    expect(matchFilters(e, { ...emptyFilters(), face: ['AB-123-CD'] })).toBe(false) // une plaque n'est pas un visage
    expect(matchFilters(e, { ...emptyFilters(), cam: ['devant'] })).toBe(false)
  })
  it('bascule d’une valeur, sans muter', () => {
    const f = emptyFilters()
    const g = toggleFilter(f, 'face', 'Alex')
    expect(g.face).toEqual(['Alex'])
    expect(f.face).toEqual([])
    expect(toggleFilter(g, 'face', 'Alex').face).toEqual([])
    expect(hasFilters(f)).toBe(false)
    expect(hasFilters(g)).toBe(true)
  })
  it('valeurs proposées : événements + serveur, triées, sans doublon', () => {
    const o = filterOptions([ev({ subLabels: ['Alex', 'AB-123-CD'], zones: ['portail'] }), ev({ cam: 'devant', objects: ['car'] })], { subLabels: ['Alex', 'Marie'], plates: ['ZZ-999-ZZ'], labels: ['dog'], zones: ['allee'] })
    expect(o).toEqual({ object: ['car', 'dog', 'person'], face: ['Alex', 'Marie'], plate: ['AB-123-CD', 'ZZ-999-ZZ'], zone: ['allee', 'portail'], cam: ['devant', 'route'] })
  })
})

describe('paramètres de requête', () => {
  it('sans visage ni plaque : /api/review', () => {
    const q = historyQuery({ ...emptyFilters(), object: ['car', 'dog'], cam: ['route'], zone: ['bord de route'] }, { after: 100.7, before: 200.2, limit: 50 })
    expect(q).toEqual({ kind: 'review', paths: ['/api/review?cameras=route&labels=car,dog&zones=bord%20de%20route&after=100&before=201&limit=50'] })
  })
  it('sans plage : ni after ni before', () => {
    expect(historyQuery(emptyFilters()).paths[0]).toBe('/api/review?limit=50')
  })
  it('visage : /api/events?sub_labels ; plaque : aussi recognized_license_plate', () => {
    expect(historyQuery({ ...emptyFilters(), face: ['Alex'] }).paths).toEqual(['/api/events?limit=50&sub_labels=Alex'])
    expect(historyQuery({ ...emptyFilters(), plate: ['AB-1'] }, { after: 5 }).paths).toEqual(['/api/events?after=5&limit=50&sub_labels=AB-1', '/api/events?after=5&limit=50&recognized_license_plate=AB-1'])
  })
})

describe('pages et plages', () => {
  it('fusion sans doublon, triée', () => {
    expect(mergePages([ev({ id: 'a', s: 3 }), ev({ id: 'b', s: 2 })], [ev({ id: 'b', s: 2 }), ev({ id: 'c', s: 1 }), ev({ id: 'd', s: 5 })]).map((e) => e.id)).toEqual(['d', 'a', 'b', 'c'])
  })
  it('raccourcis', () => {
    const now = new Date(2026, 9, 17, 15, 0).getTime()
    expect(rangePreset('7d', now)).toEqual({ after: now / 1000 - 7 * 86400, before: null })
    expect(rangePreset('today', now).after).toBe(new Date(2026, 9, 17).getTime() / 1000)
    expect(rangePreset('', now)).toEqual({ after: null, before: null })
  })
  it('dates saisies : fin de journée incluse', () => {
    const r = rangeFromDates('2026-10-01', '2026-10-02')
    expect(r.after).toBe(new Date(2026, 9, 1).getTime() / 1000)
    expect(r.before).toBe(new Date(2026, 9, 3).getTime() / 1000)
    expect(rangeFromDates('', '')).toEqual({ after: null, before: null })
  })
  it('événement Frigate → élément de liste', () => {
    const e = fromEvent({ id: 'e1', camera: 'route', label: 'car', sub_label: null, zones: ['z'], start_time: 10, end_time: 12, data: { recognized_license_plate: 'AB-123-CD' } }, 't.webp')
    expect(e).toMatchObject({ id: 'e1', cam: 'route', s: 10000, e: 12000, type: 'car', objects: ['car'], subLabels: ['AB-123-CD'], zones: ['z'], thumb: 't.webp', seen: true })
    expect(fromEvent({ id: 'e2', camera: 'c', label: 'person', sub_label: 'bob, john', start_time: 1 }).subLabels).toEqual(['bob', 'john'])
  })
})
