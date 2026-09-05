import { describe, expect, test } from 'bun:test'
import { createImageProvider, createSandboxImageProvider, renderSandboxImage } from '../../src/providers/images'

const image = { id: 'photo-1690368358248-6ab7d1921e27', alt: 'Mill interior' }

describe('the unsplash provider', () => {
  test('names the CDN it needs, so the policy can admit exactly that host', () => {
    expect(createImageProvider().host).toBe('https://images.unsplash.com')
  })

  test('renders a sized source set at the shape ratio', () => {
    const rendition = createImageProvider().render(image, 'card', '400px')
    expect(rendition.width).toBe(800)
    expect(rendition.height).toBe(533)
    expect(rendition.src).toContain('https://images.unsplash.com/')
    expect(rendition.srcset.split(', ')).toHaveLength(4)
    expect(rendition.alt).toBe('Mill interior')
  })
})

describe('the sandbox provider', () => {
  const sandbox = createSandboxImageProvider()

  test('needs no external origin', () => {
    expect(sandbox.host).toBe("'self'")
  })

  test('every source it emits resolves to an image this app actually serves', () => {
    for (const shape of ['hero', 'plate', 'card', 'thumb'] as const) {
      const rendition = sandbox.render(image, shape, '100vw')
      const sources = [rendition.src, ...rendition.srcset.split(', ').map((entry) => entry.split(' ')[0]!)]
      for (const source of sources) {
        expect(source.startsWith('/images/')).toBe(true)
        expect(renderSandboxImage(source.slice('/images/'.length))).not.toBeNull()
      }
    }
  })

  test('reserves the exact dimensions the layout expects, so nothing reflows', () => {
    const rendition = sandbox.render(image, 'card', '400px')
    const drawn = renderSandboxImage(rendition.src.slice('/images/'.length))!
    expect([drawn.width, drawn.height]).toEqual([rendition.width, rendition.height])
    expect(drawn.body).toContain(`width="${rendition.width}"`)
  })

  test('draws the same tone for the same building every time', () => {
    const once = renderSandboxImage('photo-abc-800x533.svg')!
    const twice = renderSandboxImage('photo-abc-800x533.svg')!
    expect(once.body).toBe(twice.body)
    expect(renderSandboxImage('photo-xyz-800x533.svg')!.body).not.toBe(once.body)
  })

  test('refuses anything that is not a request it issued', () => {
    for (const file of ['', 'photo.jpg', '../../etc/passwd', 'photo-0x0.svg', 'photo-99999x10.svg', 'photo-8x8.png']) {
      expect(renderSandboxImage(file)).toBeNull()
    }
  })
})
