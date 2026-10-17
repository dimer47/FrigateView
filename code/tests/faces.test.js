import { describe, it, expect, vi } from 'vitest'
vi.mock('@/i18n', () => ({ t: (k) => k }))
import { parseFaces, parseTrainFile, imageTime, faceImageUrl, validName, folderName, faceRecognitionEnabled, rangeSelect } from '@/services/faces'

describe('parseTrainFile', () => {
  it('découpe id événement, horodatage, nom, score (format de FaceLibrary.tsx)', () => {
    expect(parseTrainFile('1700000000.123-abc123-1700000005.5-Alex-0.87.webp')).toEqual({ file: '1700000000.123-abc123-1700000005.5-Alex-0.87.webp', eventId: '1700000000.123-abc123', ts: 1700000005500, name: 'Alex', score: 0.87 })
  })
  it('unknown → nom null ; fichier inattendu sans planter', () => {
    expect(parseTrainFile('1-a-1700000000-unknown-0.4.webp').name).toBe(null)
    expect(parseTrainFile('bizarre.png')).toMatchObject({ eventId: null, ts: null, name: null, score: null })
  })
})

describe('parseFaces', () => {
  it('sépare train, trie les personnes et les images (récentes d’abord)', () => {
    const f = parseFaces({ marie: ['marie-1700000000.webp', 'marie-1800000000.webp'], Alex: [], train: ['1-a-1600000000-unknown-0.5.webp', '1-b-1700000000-Alex-0.9.webp'], bad: 'x' })
    expect(f.people.map((p) => p.name)).toEqual(['Alex', 'bad', 'marie'])
    expect(f.people[2].images).toEqual(['marie-1800000000.webp', 'marie-1700000000.webp'])
    expect(f.people[1].images).toEqual([])
    expect(f.train.map((x) => x.score)).toEqual([0.9, 0.5])
  })
  it('réponse vide ou invalide', () => {
    expect(parseFaces({})).toEqual({ people: [], train: [] })
    expect(parseFaces(null)).toEqual({ people: [], train: [] })
    expect(parseFaces([])).toEqual({ people: [], train: [] })
  })
})

describe('utilitaires', () => {
  it('imageTime', () => {
    expect(imageTime('Alex-1700000000.25.webp')).toBe(1700000000250)
    expect(imageTime('photo.jpg')).toBe(null)
  })
  it('faceImageUrl encode nom et fichier', () => {
    expect(faceImageUrl({ host: 'nvr', port: 8971 }, 'Jean Paul', 'a b.webp')).toBe('https://nvr:8971/clips/faces/Jean%20Paul/a%20b.webp')
    expect(faceImageUrl({ host: 'nvr', port: 5000, mode: 'local' }, 'train', 'x.webp')).toBe('http://nvr:5000/clips/faces/train/x.webp')
  })
  it('validName / folderName', () => {
    expect(validName('Jean-Paul O\'Neil')).toBe(true)
    expect(validName('Élodie_2')).toBe(true)
    for (const n of ['', '   ', 'a/b', '../x', 'train', 'x'.repeat(51)]) expect(validName(n)).toBe(false)
    expect(folderName(' Jean Paul ')).toBe('Jean_Paul')
  })
  it('faceRecognitionEnabled', () => {
    expect(faceRecognitionEnabled({ face_recognition: { enabled: true } })).toBe(true)
    expect(faceRecognitionEnabled({ face_recognition: { enabled: false } })).toBe(false)
    expect(faceRecognitionEnabled({})).toBe(false)
  })
  it('rangeSelect', () => {
    const l = ['a', 'b', 'c', 'd']
    expect([...rangeSelect(l, new Set(), 'd', 'b')].sort()).toEqual(['b', 'c', 'd'])
    expect([...rangeSelect(l, new Set(['a']), 'z', 'c')].sort()).toEqual(['a', 'c'])
  })
})
