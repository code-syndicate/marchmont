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

export const PHOTOGRAPHY_PATH = '/photography'

/** The widths every photograph in public/photography is stored at. */
const LOCAL_WIDTHS = [800, 1600, 2400]

/**
 * Serves the photographs committed to this repository. This is the one that
 * should run in production: a listing keeps its pictures whether or not anybody
 * else's CDN still has them, and the policy needs no external image origin.
 */
export function createLocalImageProvider(): ImageProvider {
  const url = (id: string, width: number): string => `${PHOTOGRAPHY_PATH}/${id}-${width}.jpg`

  return {
    host: "'self'",
    render(image, shape, sizes) {
      const spec = SHAPES[shape]
      // The stored widths are the real ones; the shape's own list would ask for
      // files that were never written.
      const nearest = LOCAL_WIDTHS.reduce((best, w) =>
        Math.abs(w - spec.width) < Math.abs(best - spec.width) ? w : best, LOCAL_WIDTHS[0]!)
      return {
        src: url(image.id, nearest),
        srcset: LOCAL_WIDTHS.map((w) => `${url(image.id, w)} ${w}w`).join(', '),
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
      const src = sandboxSrc(image.id, spec.width, height)
      return {
        src,
        srcset: spec.widths
          .map((w) => `${sandboxSrc(image.id, w, Math.round(w / spec.ratio))} ${w}w`)
          .join(', '),
        sizes,
        alt: image.alt,
        width: spec.width,
        height,
      }
    },
  }
}

export const SANDBOX_IMAGE_PATH = '/images'

function sandboxSrc(id: string, width: number, height: number): string {
  return `${SANDBOX_IMAGE_PATH}/${encodeURIComponent(id)}-${width}x${height}.svg`
}

const SANDBOX_PATTERN = /^(.+)-(\d{1,5})x(\d{1,5})\.svg$/

export type SandboxImage = { body: string; width: number; height: number }

/**
 * The sandbox draws its own image rather than shipping binary assets, so the
 * offline provider is a real, cacheable image at the exact dimensions the
 * layout reserved and nothing reflows as it loads. The tone is derived from the
 * id, so a building looks the same on every page and across restarts.
 */
export function renderSandboxImage(file: string): SandboxImage | null {
  const match = SANDBOX_PATTERN.exec(file)
  if (!match) return null

  const [, id, rawWidth, rawHeight] = match as unknown as [string, string, string, string]
  const width = Number(rawWidth)
  const height = Number(rawHeight)
  if (width < 1 || height < 1 || width > 4000 || height > 4000) return null

  let hash = 0
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  const hue = hash % 360
  const base = `hsl(${hue} 14% 30%)`
  const lift = `hsl(${(hue + 24) % 360} 16% 52%)`

  const body =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="presentation">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0.7" y2="1">` +
    `<stop offset="0" stop-color="${lift}"/><stop offset="1" stop-color="${base}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#g)"/></svg>`

  return { body, width, height }
}
