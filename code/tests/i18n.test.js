import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LANGS, resolveLang, langInfo, translate } from '../src/shared/langs.js'

const dir = join(__dirname, '../src/shared/locales')

describe('langs', () => {
  it('resolveLang', () => {
    expect(resolveLang('fr', 'en-US')).toBe('fr')
    expect(resolveLang('xx', 'pt-BR')).toBe('pt')
    expect(resolveLang(null, 'zh_CN')).toBe('zh')
    expect(resolveLang(null, 'de-DE')).toBe('en')
    expect(resolveLang(null, undefined)).toBe('en')
  })
  it('langInfo', () => {
    expect(langInfo('ar').dir).toBe('rtl')
    expect(langInfo('xx').code).toBe('en')
  })
  it('translate', () => {
    const m = { a: { b: 'Bonjour {name}, {x}' }, n: 1 }
    expect(translate(m, 'a.b', { name: 'Léa' })).toBe('Bonjour Léa, {x}')
    expect(translate(m, 'a.z')).toBe(null)
    expect(translate(m, 'n')).toBe(null)
    expect(translate(m, 'a.b.c.d')).toBe(null)
  })
})

describe('locales', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, p + k + '.') : [p + k])).sort()
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

  it('un fichier par langue déclarée', () => {
    expect(files.map((f) => f.replace('.json', '')).sort()).toEqual(LANGS.map((l) => l.code).sort())
  })
  it('mêmes clés que fr.json', () => {
    const ref = keys(JSON.parse(readFileSync(join(dir, 'fr.json'), 'utf8')))
    for (const f of files) {
      const k = keys(JSON.parse(readFileSync(join(dir, f), 'utf8')))
      expect({ f, missing: ref.filter((x) => !k.includes(x)), extra: k.filter((x) => !ref.includes(x)) }).toEqual({ f, missing: [], extra: [] })
    }
  })
})
