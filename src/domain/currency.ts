import { UnknownCurrencyError } from './errors'

const EXPONENTS: Readonly<Record<string, number>> = {
  AED: 2, AUD: 2, BHD: 3, BRL: 2, CAD: 2, CHF: 2, CNY: 2, DKK: 2, EUR: 2,
  GBP: 2, GHS: 2, HKD: 2, IDR: 2, ILS: 2, INR: 2, JOD: 3, JPY: 0, KES: 2,
  KRW: 0, KWD: 3, MAD: 2, MXN: 2, MYR: 2, NGN: 2, NOK: 2, NZD: 2, OMR: 3,
  PLN: 2, QAR: 2, RON: 2, SAR: 2, SEK: 2, SGD: 2, THB: 2, TND: 3, TRY: 2,
  USD: 2, VND: 0, ZAR: 2,
}

export type CurrencyCode = string

export function isKnownCurrency(code: string): boolean {
  return Object.hasOwn(EXPONENTS, code)
}

export function minorUnitExponent(code: string): number {
  const exponent = EXPONENTS[code]
  if (exponent === undefined) throw new UnknownCurrencyError(code)
  return exponent
}

export function knownCurrencies(): readonly string[] {
  return Object.keys(EXPONENTS)
}
