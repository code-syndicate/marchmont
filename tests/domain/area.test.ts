import { describe, expect, test } from 'bun:test'
import { areaFromM2, areaFromFt2, formatArea, unitForLocale } from '../../src/domain/area'
import { InvalidAreaError } from '../../src/domain/errors'

describe('areaFromM2', () => {
  test('stores hundredths of a square metre', () => {
    expect(areaFromM2('1240').hundredthsM2).toBe(124000n)
    expect(areaFromM2('1240.55').hundredthsM2).toBe(124055n)
  })

  test('rejects more than two decimal places', () => {
    expect(() => areaFromM2('1.005')).toThrow(InvalidAreaError)
  })

  test('rejects a negative area', () => {
    expect(() => areaFromM2('-1')).toThrow(InvalidAreaError)
  })

  test('rejects anything that is not a decimal', () => {
    for (const bad of ['', 'abc', '1,240', '1e3']) {
      expect(() => areaFromM2(bad)).toThrow(InvalidAreaError)
    }
  })
})

describe('areaFromFt2', () => {
  test('converts using the exact ratio, rounding half up', () => {
    expect(areaFromFt2('1000').hundredthsM2).toBe(9290n)
  })

  test('round-trips a large commercial floor plate within a hundredth', () => {
    const area = areaFromFt2('58000')
    expect(formatArea(area, 'ft2', 'en-US')).toBe('58,000 sq ft')
  })
})

describe('formatArea', () => {
  test('formats square metres with locale grouping and no decimals', () => {
    expect(formatArea(areaFromM2('1240.55'), 'm2', 'en-GB')).toBe('1,241 sq m')
  })

  test('formats square feet', () => {
    expect(formatArea(areaFromM2('1000'), 'ft2', 'en-US')).toBe('10,764 sq ft')
  })

  test('never contains an em dash or en dash', () => {
    expect(formatArea(areaFromM2('1000'), 'm2', 'en-GB')).not.toMatch(/[–—]/)
  })
})

describe('unitForLocale', () => {
  test('uses square feet for the US and UK', () => {
    expect(unitForLocale('en-US')).toBe('ft2')
    expect(unitForLocale('en-GB')).toBe('ft2')
  })

  test('uses square metres everywhere else', () => {
    for (const locale of ['de-DE', 'fr-FR', 'en-NG', 'ja-JP', 'pt-BR']) {
      expect(unitForLocale(locale)).toBe('m2')
    }
  })

  test('falls back to square metres for an unrecognised locale', () => {
    expect(unitForLocale('')).toBe('m2')
  })
})
