import { describe, expect, test } from 'bun:test'
import { blur, createMapProvider, createSandboxMapProvider, renderSandboxMap } from '../../src/providers/maps'

const brooklyn = [-73.9905, 40.7033] as const
const label = 'Water Street Mill, New York'

describe('blur', () => {
  test('rounds a coordinate to about a kilometre', () => {
    expect(blur(brooklyn)).toEqual([-73.99, 40.7])
  })

  test('moves the point, so an exact building cannot be read back off it', () => {
    expect(blur(brooklyn)).not.toEqual(brooklyn)
  })
})

for (const [name, provider] of [
  ['the tile provider', createMapProvider()],
  ['the sandbox provider', createSandboxMapProvider()],
] as const) {
  describe(name, () => {
    test('never puts the exact coordinate in a URL for an unapproved viewer', () => {
      const view = provider.render(brooklyn, { label, precise: false })
      expect(view.src).not.toContain('73.9905')
      expect(view.src).not.toContain('40.7033')
    })

    test('describes what is shown, and says so differently when it is only a district', () => {
      const vague = provider.render(brooklyn, { label, precise: false })
      const exact = provider.render(brooklyn, { label, precise: true })
      expect(vague.alt).toContain('district')
      expect(exact.alt).toContain('location')
      expect(vague.src).not.toBe(exact.src)
    })

    test('reserves fixed dimensions, so the page does not reflow', () => {
      const view = provider.render(brooklyn, { label, precise: true })
      expect(view.width).toBeGreaterThan(0)
      expect(view.height).toBeGreaterThan(0)
    })
  })
}

describe('the sandbox map', () => {
  const sandbox = createSandboxMapProvider()

  test('needs no external origin', () => {
    expect(sandbox.host).toBe("'self'")
  })

  test('every URL it emits is one it can draw', () => {
    for (const precise of [true, false]) {
      for (const at of [brooklyn, [4.4092, 51.232], [103.841, 1.273], [-0.0748, 51.529]] as const) {
        const view = sandbox.render(at, { label, precise })
        expect(renderSandboxMap(view.src.slice('/maps/'.length))).not.toBeNull()
      }
    }
  })

  test('draws a wide marker for a district and a tight one for an exact address', () => {
    const vague = renderSandboxMap(sandbox.render(brooklyn, { label, precise: false }).src.slice(6))!
    const exact = renderSandboxMap(sandbox.render(brooklyn, { label, precise: true }).src.slice(6))!
    expect(vague.body).toContain('r="46"')
    expect(exact.body).toContain('r="10"')
  })

  test('two different places do not draw the same picture', () => {
    const a = renderSandboxMap(sandbox.render(brooklyn, { label, precise: true }).src.slice(6))!
    const b = renderSandboxMap(sandbox.render([4.4092, 51.232], { label, precise: true }).src.slice(6))!
    expect(a.body).not.toBe(b.body)
  })

  test('refuses anything it did not issue', () => {
    for (const file of ['', '../../etc/passwd', '1,2.svg', '999.0000,0.0000,exact.svg', '0.0000,0.0000,vague.svg']) {
      expect(renderSandboxMap(file)).toBeNull()
    }
  })
})
