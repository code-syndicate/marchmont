/**
 * Photography provider. Demo assets are served from the Unsplash CDN, which is
 * why the content security policy names that host for img-src and nothing else.
 * Real photography of real buildings replaces the ids in the seed; when it
 * does, this is the only module that changes and the policy tightens back to
 * 'self'.
 */

export type ImageRef = {
  readonly id: string
  readonly alt: string
}

export type Rendition = {
  readonly src: string
  readonly srcset: string
  readonly sizes: string
  readonly alt: string
  readonly width: number
  readonly height: number
}

export type ImageProvider = {
  readonly host: string
  render(image: ImageRef, shape: Shape, sizes: string): Rendition
}

export type Shape = 'hero' | 'card' | 'plate' | 'thumb'

const SHAPES: Record<Shape, { width: number; ratio: number; widths: number[] }> = {
  hero: { width: 1600, ratio: 16 / 9, widths: [768, 1024, 1440, 1920, 2400] },
  plate: { width: 1280, ratio: 4 / 3, widths: [640, 960, 1280, 1600] },
  card: { width: 800, ratio: 3 / 2, widths: [400, 600, 800, 1200] },
  thumb: { width: 200, ratio: 1, widths: [120, 200, 320] },
}

const HOST = 'https://images.unsplash.com'

function url(id: string, width: number, ratio: number): string {
  const height = Math.round(width / ratio)
  return `${HOST}/${id}?w=${width}&h=${height}&fit=crop&auto=format&q=72`
}

export function createImageProvider(): ImageProvider {
  return {
    host: HOST,
    render(image, shape, sizes) {
      const spec = SHAPES[shape]
      return {
        src: url(image.id, spec.width, spec.ratio),
        srcset: spec.widths.map((w) => `${url(image.id, w, spec.ratio)} ${w}w`).join(', '),
        sizes,
        alt: image.alt,
        width: spec.width,
        height: Math.round(spec.width / spec.ratio),
      }
    },
  }
}

/** Deterministic offline double: no network, stable output, same shape. */
export function createSandboxImageProvider(): ImageProvider {
  return {
    host: "'self'",
    render(image, shape, sizes) {
      const spec = SHAPES[shape]
      const height = Math.round(spec.width / spec.ratio)
      return {
        src: `/images/${image.id}-${spec.width}.jpg`,
        srcset: `/images/${image.id}-${spec.width}.jpg ${spec.width}w`,
        sizes,
        alt: image.alt,
        width: spec.width,
        height,
      }
    },
  }
}
