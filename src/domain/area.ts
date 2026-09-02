import { InvalidAreaError } from './errors'

export type Area = {
  readonly hundredthsM2: bigint
}

export type AreaUnit = 'm2' | 'ft2'

const DECIMAL = /^\d+(\.\d+)?$/

// 1 square foot is exactly 0.09290304 square metres.
const FT2_NUMERATOR = 9290304n
const FT2_DENOMINATOR = 100000000n

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n)
}

function parseHundredths(decimal: string, label: string): bigint {
  if (!DECIMAL.test(decimal)) {
    throw new InvalidAreaError(`"${decimal}" is not a plain positive decimal ${label}`)
  }
  const [whole = '0', fraction = ''] = decimal.split('.')
  if (fraction.length > 2) {
    throw new InvalidAreaError(`Area is stored to two decimal places; "${decimal}" has ${fraction.length}`)
  }
  return BigInt(whole + fraction.padEnd(2, '0'))
}

export function areaFromM2(decimal: string): Area {
  if (decimal.startsWith('-')) throw new InvalidAreaError('Area cannot be negative')
  return { hundredthsM2: parseHundredths(decimal, 'area in square metres') }
}

export function areaFromFt2(decimal: string): Area {
  if (decimal.startsWith('-')) throw new InvalidAreaError('Area cannot be negative')
  const hundredthsFt2 = parseHundredths(decimal, 'area in square feet')
  return { hundredthsM2: divideRoundHalfUp(hundredthsFt2 * FT2_NUMERATOR, FT2_DENOMINATOR) }
}

export function formatArea(area: Area, unit: AreaUnit, locale: string): string {
  const whole =
    unit === 'm2'
      ? divideRoundHalfUp(area.hundredthsM2, 100n)
      : divideRoundHalfUp(area.hundredthsM2 * FT2_DENOMINATOR, FT2_NUMERATOR * 100n)
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  return `${formatter.format(whole)} ${unit === 'm2' ? 'm2' : 'ft2'}`
}

const IMPERIAL_AREA_REGIONS = new Set(['US', 'GB'])

export function unitForLocale(locale: string): AreaUnit {
  try {
    const region = new Intl.Locale(locale).maximize().region
    return region !== undefined && IMPERIAL_AREA_REGIONS.has(region) ? 'ft2' : 'm2'
  } catch {
    return 'm2'
  }
}
