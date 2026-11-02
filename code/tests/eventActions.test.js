import { describe, it, expect } from 'vitest'
import { plusEnabled, validSubLabel } from '@/services/eventActions'

describe('eventActions', () => {
  it('Frigate+ actif', () => {
    expect(plusEnabled({ plus: { enabled: true } })).toBe(true)
    expect(plusEnabled({ plus: { enabled: false } })).toBe(false)
    expect(plusEnabled({})).toBe(false)
  })
  it('sous-libellé', () => {
    expect(validSubLabel('Marie')).toBe(true)
    expect(validSubLabel('')).toBe(true)
    expect(validSubLabel('x'.repeat(101))).toBe(false)
  })
})
