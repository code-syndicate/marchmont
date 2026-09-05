import { type CurrencyCode, isKnownCurrency, minorUnitExponent } from './currency'
import { CurrencyMismatchError, InvalidAmountError, UnknownCurrencyError } from './errors'

export type Money = {
  readonly amount: bigint
  readonly currency: CurrencyCode
}

const DECIMAL = /^-?\d+(\.\d+)?$/

export function money(amount: bigint, currency: string): Money {
  if (!isKnownCurrency(currency)) throw new UnknownCurrencyError(currency)
  return { amount, currency }
}

export function parseMoney(decimal: string, currency: string): Money {
  const exponent = minorUnitExponent(currency)
  if (!DECIMAL.test(decimal)) {
    throw new InvalidAmountError(`"${decimal}" is not a plain decimal amount`)
  }

  const negative = decimal.startsWith('-')
  const unsigned = negative ? decimal.slice(1) : decimal
  const [whole = '0', fraction = ''] = unsigned.split('.')

  if (fraction.length > exponent) {
    throw new InvalidAmountError(
      `${currency} has ${exponent} decimal place(s); "${decimal}" has ${fraction.length}`,
    )
  }

  const minor = BigInt(whole + fraction.padEnd(exponent, '0'))
  return { amount: negative ? -minor : minor, currency }
}

export function toDecimalString(value: Money): string {
  const exponent = minorUnitExponent(value.currency)
  const negative = value.amount < 0n
  const digits = (negative ? -value.amount : value.amount).toString().padStart(exponent + 1, '0')
  const whole = digits.slice(0, digits.length - exponent)
  const fraction = exponent === 0 ? '' : `.${digits.slice(digits.length - exponent)}`
  return `${negative ? '-' : ''}${whole}${fraction}`
}

export function formatMoney(value: Money, locale: string): string {
  const exponent = minorUnitExponent(value.currency)
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  })
  // Intl.NumberFormat accepts a decimal string and preserves it exactly.
  // Passing a number here would round above 2^53.
  return formatter.format(toDecimalString(value) as unknown as number)
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency)
}

export function addMoney(a: Money, b: Money): Money {
  sameCurrency(a, b)
  return { amount: a.amount + b.amount, currency: a.currency }
}

export function subtractMoney(a: Money, b: Money): Money {
  sameCurrency(a, b)
  return { amount: a.amount - b.amount, currency: a.currency }
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  sameCurrency(a, b)
  return a.amount === b.amount ? 0 : a.amount > b.amount ? 1 : -1
}

/**
 * Property convention: a guide price or a rent is written without a fraction
 * when there is no fraction to write. 11,250,000 rather than 11,250,000.00.
 */
export function formatMoneyShort(value: Money, locale: string): string {
  const exponent = minorUnitExponent(value.currency)
  if (exponent === 0) return formatMoney(value, locale)
  const unit = 10n ** BigInt(exponent)
  if (value.amount % unit !== 0n) return formatMoney(value, locale)
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  return formatter.format(toDecimalString(value) as unknown as number)
}

/**
 * An indicative band around an amount, for a viewer who has not been approved.
 * Integer arithmetic throughout: the step is a power of ten chosen from the
 * magnitude, and the amount is floored and raised by one step. Two significant
 * figures is wide enough not to be the figure and narrow enough to be useful.
 */
export function priceBand(value: Money): { from: Money; to: Money } {
  const magnitude = value.amount < 0n ? -value.amount : value.amount

  let digits = 0n
  for (let rest = magnitude; rest >= 10n; rest /= 10n) digits += 1n

  let step = 1n
  for (let i = 0n; i < digits - 1n; i += 1n) step *= 10n
  if (step < 1n) step = 1n

  const from = (magnitude / step) * step
  return {
    from: money(from, value.currency),
    to: money(from + step, value.currency),
  }
}
