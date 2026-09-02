import { describe, expect, test } from 'bun:test'

const css = await Bun.file(new URL('../../public/app.css', import.meta.url)).text()

function readToken(name: string): [number, number, number] {
  const match = css.match(new RegExp(`--${name}:\\s*hsl\\(\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\s*\\)`))
  if (!match) throw new Error(`token --${name} is not defined as hsl(h s% l%) in public/app.css`)
  return [Number(match[1]), Number(match[2]) / 100, Number(match[3]) / 100]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = l - c / 2
  return [r! + m, g! + m, b! + m]
}

function luminance(name: string): number {
  const linear = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = hslToRgb(...readToken(name)).map(linear) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('palette', () => {
  const textPairs: [string, string][] = [
    ['text', 'ground'], ['text', 'surface-1'], ['text', 'surface-2'],
    ['text-muted', 'ground'], ['text-muted', 'surface-1'], ['text-muted', 'surface-2'],
    ['text-faint', 'ground'], ['text-faint', 'surface-2'],
    ['accent-text', 'ground'], ['accent-text', 'surface-2'],
    ['accent-on', 'accent'],
  ]

  for (const [foreground, background] of textPairs) {
    test(`--${foreground} on --${background} meets AA for body text`, () => {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
    })
  }

  test('--danger on --ground meets AA for large text and icons', () => {
    expect(contrast('danger', 'ground')).toBeGreaterThanOrEqual(3)
  })

  test('--line is visible against --ground without becoming a border', () => {
    const ratio = contrast('line', 'ground')
    expect(ratio).toBeGreaterThanOrEqual(1.2)
    expect(ratio).toBeLessThan(3)
  })

  test('--accent is dark enough to carry --accent-on as a fill', () => {
    expect(contrast('accent-on', 'accent')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('stylesheet discipline', () => {
  test('defines a single spacing unit', () => {
    expect(css).toMatch(/--u:\s*4px/)
  })

  test('uses zero border radius throughout', () => {
    const radii = css.match(/border-radius:\s*([^;]+);/g) ?? []
    for (const rule of radii) expect(rule).toMatch(/border-radius:\s*0;/)
  })

  test('contains no em dash or en dash', () => {
    expect(css).not.toMatch(/[\u2013\u2014]/)
  })
})
