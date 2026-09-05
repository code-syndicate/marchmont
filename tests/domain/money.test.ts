import { describe, expect, test } from 'bun:test'
import { addMoney, compareMoney, formatMoney, formatMoneyShort, money, parseMoney, priceBand, subtractMoney, toDecimalString } from '../../src/domain/money'
import { CurrencyMismatchError, UnknownCurrencyError, InvalidAmountError } from '../../src/domain/errors'

describe('money', () => {
  test('holds minor units as a bigint', () => {
    const value = money(45_000_000_50n, 'NGN')
    expect(value.amount).toBe(45_000_000_50n)
    expect(value.currency).toBe('NGN')
  })

  test('rejects an unknown currency', () => {
    expect(() => money(1n, 'XYZ')).toThrow(UnknownCurrencyError)
  })
})

describe('parseMoney', () => {
  test('parses a two-decimal currency', () => {
    expect(parseMoney('1234.56', 'GBP').amount).toBe(123456n)
  })

  test('parses a zero-decimal currency', () => {
    expect(parseMoney('1234', 'JPY').amount).toBe(1234n)
  })

  test('pads a short fraction', () => {
    expect(parseMoney('10.5', 'GBP').amount).toBe(1050n)
  })

  test('accepts a bare integer', () => {
    expect(parseMoney('10', 'GBP').amount).toBe(1000n)
  })

  test('parses a negative amount', () => {
    expect(parseMoney('-0.01', 'GBP').amount).toBe(-1n)
  })

  test('survives a value far above what a double can hold', () => {
    expect(parseMoney('90071992547409.93', 'GBP').amount).toBe(9007199254740993n)
  })

  test('rejects more precision than the currency has', () => {
    expect(() => parseMoney('1.005', 'GBP')).toThrow(InvalidAmountError)
    expect(() => parseMoney('1.5', 'JPY')).toThrow(InvalidAmountError)
  })

  test('rejects anything that is not a decimal', () => {
    for (const bad of ['', '1,234.00', '1.2.3', 'abc', '1e5', ' 1.00']) {
      expect(() => parseMoney(bad, 'GBP')).toThrow(InvalidAmountError)
    }
  })
})

describe('toDecimalString', () => {
  test('round-trips through parseMoney', () => {
    for (const [input, currency] of [['1234.56', 'GBP'], ['0.01', 'EUR'], ['-0.01', 'EUR'], ['1234', 'JPY']] as const) {
      expect(toDecimalString(parseMoney(input, currency))).toBe(input)
    }
  })

  test('pads the fraction back out', () => {
    expect(toDecimalString(money(5n, 'GBP'))).toBe('0.05')
    expect(toDecimalString(money(-5n, 'GBP'))).toBe('-0.05')
  })
})

describe('formatMoney', () => {
  test('formats in the viewer locale without losing precision', () => {
    expect(formatMoney(parseMoney('12345678901234567.89', 'GBP'), 'en-GB'))
      .toBe('£12,345,678,901,234,567.89')
  })

  test('respects locale conventions', () => {
    expect(formatMoney(parseMoney('1234567.89', 'EUR'), 'de-DE')).toContain('1.234.567,89')
  })

  test('omits decimals for a zero-decimal currency', () => {
    expect(formatMoney(parseMoney('1234567', 'JPY'), 'ja-JP')).not.toContain('.')
  })
})

describe('formatMoneyShort', () => {
  test('drops the fraction when there is none to show', () => {
    expect(formatMoneyShort(parseMoney('11250000.00', 'GBP'), 'en-GB')).toBe('£11,250,000')
  })

  test('keeps the fraction when the amount has one', () => {
    expect(formatMoneyShort(parseMoney('1234.56', 'GBP'), 'en-GB')).toBe('£1,234.56')
  })

  test('leaves a zero-decimal currency alone', () => {
    expect(formatMoneyShort(parseMoney('1234567', 'JPY'), 'ja-JP')).not.toContain('.')
  })

  test('stays exact above 2^53', () => {
    expect(formatMoneyShort(parseMoney('12345678901234567.00', 'GBP'), 'en-GB'))
      .toBe('£12,345,678,901,234,567')
  })
})

describe('arithmetic', () => {
  test('adds and subtracts within one currency', () => {
    const a = parseMoney('10.00', 'GBP')
    const b = parseMoney('2.50', 'GBP')
    expect(toDecimalString(addMoney(a, b))).toBe('12.50')
    expect(toDecimalString(subtractMoney(a, b))).toBe('7.50')
  })

  test('refuses to mix currencies', () => {
    const gbp = parseMoney('10.00', 'GBP')
    const eur = parseMoney('10.00', 'EUR')
    expect(() => addMoney(gbp, eur)).toThrow(CurrencyMismatchError)
    expect(() => subtractMoney(gbp, eur)).toThrow(CurrencyMismatchError)
    expect(() => compareMoney(gbp, eur)).toThrow(CurrencyMismatchError)
  })

  test('compares', () => {
    const a = parseMoney('10.00', 'GBP')
    const b = parseMoney('2.50', 'GBP')
    expect(compareMoney(a, b)).toBe(1)
    expect(compareMoney(b, a)).toBe(-1)
    expect(compareMoney(a, a)).toBe(0)
  })
})

describe('priceBand', () => {
  test('brackets the amount at two significant figures', () => {
    expect(priceBand(money(1_640_000n, 'EUR'))).toEqual({
      from: money(1_600_000n, 'EUR'),
      to: money(1_700_000n, 'EUR'),
    })
  })

  test('always contains the amount it describes', () => {
    for (const amount of [1n, 99n, 100n, 12_345n, 980_000n, 2_750_000n, 125_000_000n, 9_007_199_254_740_993n]) {
      const band = priceBand(money(amount, 'GBP'))
      expect(band.from.amount).toBeLessThanOrEqual(amount)
      expect(band.to.amount).toBeGreaterThanOrEqual(amount)
    }
  })

  test('keeps precision above what a double holds', () => {
    // The input is above 2^53, where a double would already have lost the
    // last digit before the band was computed.
    const band = priceBand(money(9_007_199_254_740_993n, 'USD'))
    expect(band.from.amount).toBe(9_000_000_000_000_000n)
    expect(band.to.amount).toBe(9_100_000_000_000_000n)
  })

  test('carries the currency through, because a band is still money', () => {
    expect(priceBand(money(500_00n, 'NGN')).from.currency).toBe('NGN')
  })

  test('never returns a band that is not wider than a point', () => {
    for (const amount of [0n, 1n, 7n]) {
      const band = priceBand(money(amount, 'GBP'))
      expect(band.to.amount).toBeGreaterThan(band.from.amount)
    }
  })
})
