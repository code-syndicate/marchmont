/**
 * Locator maps. The static provider names an external tile host, which is then
 * the only thing added to img-src, exactly as the photography provider works.
 * The sandbox draws its own and needs no network. Neither loads client script,
 * so the policy keeps script-src at 'self'.
 */

export type Coordinates = readonly [number, number]

export type MapView = {
  readonly src: string
  readonly alt: string
  readonly width: number
  readonly height: number
}

export type MapProvider = {
  readonly host: string
  /**
   * `precise` is false for a viewer who has not been approved, and the provider
   * must then not resolve the exact building. Gate 1 releases the address, and
   * a pin on a rooftop would hand it over regardless of what the page prints.
   */
  render(at: Coordinates, options: { label: string; precise: boolean }): MapView
}

const WIDTH = 960
const HEIGHT = 540

/** Rounds a coordinate to roughly a kilometre, so a district is shown and a building is not. */
export function blur(at: Coordinates): Coordinates {
  return [Math.round(at[0] * 100) / 100, Math.round(at[1] * 100) / 100]
}

const TILE_HOST = 'https://tile.openstreetmap.org'

export function createMapProvider(): MapProvider {
  return {
    host: TILE_HOST,
    render(at, { label, precise }) {
      const [longitude, latitude] = precise ? at : blur(at)
      const zoom = precise ? 16 : 13
      return {
        src: `${TILE_HOST}/${zoom}/${tileX(longitude, zoom)}/${tileY(latitude, zoom)}.png`,
        alt: precise ? `Map showing the location of ${label}` : `Map showing the district around ${label}`,
        width: WIDTH,
        height: HEIGHT,
      }
    },
  }
}

function tileX(longitude: number, zoom: number): number {
  return Math.floor(((longitude + 180) / 360) * 2 ** zoom)
}

function tileY(latitude: number, zoom: number): number {
  const radians = (latitude * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** zoom)
}

export const SANDBOX_MAP_PATH = '/maps'

/**
 * Four decimal places, built by integer arithmetic. A coordinate is genuinely a
 * float, but toFixed is banned across the source so the money guard has no
 * exceptions to argue about.
 */
function fixed4(value: number): string {
  const scaled = Math.round(value * 10000)
  const sign = scaled < 0 ? '-' : ''
  const magnitude = Math.abs(scaled)
  return `${sign}${Math.trunc(magnitude / 10000)}.${String(magnitude % 10000).padStart(4, '0')}`
}

export function createSandboxMapProvider(): MapProvider {
  return {
    host: "'self'",
    render(at, { label, precise }) {
      const [longitude, latitude] = precise ? at : blur(at)
      return {
        src: `${SANDBOX_MAP_PATH}/${fixed4(longitude)},${fixed4(latitude)},${precise ? 'exact' : 'district'}.svg`,
        alt: precise ? `Map showing the location of ${label}` : `Map showing the district around ${label}`,
        width: WIDTH,
        height: HEIGHT,
      }
    },
  }
}

const SANDBOX_PATTERN = /^(-?\d{1,3}\.\d{1,6}),(-?\d{1,2}\.\d{1,6}),(exact|district)\.svg$/

export type SandboxMap = { body: string }

/**
 * A schematic rather than a photograph of the world: a graticule placed from the
 * coordinates so neighbouring buildings do not draw the same picture, and a
 * marker whose size says how precisely the place is being given away.
 */
export function renderSandboxMap(file: string): SandboxMap | null {
  const match = SANDBOX_PATTERN.exec(file)
  if (!match) return null

  const [, rawLongitude, rawLatitude, precision] = match as unknown as [string, string, string, string]
  const longitude = Number(rawLongitude)
  const latitude = Number(rawLatitude)
  if (longitude < -180 || longitude > 180 || latitude < -85 || latitude > 85) return null

  const precise = precision === 'exact'
  const offsetX = ((longitude + 180) / 360) * 60
  const offsetY = ((90 - latitude) / 180) * 60
  const radius = precise ? 10 : 46

  const lines: string[] = []
  for (let x = (offsetX % 60) - 60; x < WIDTH + 60; x += 60) {
    const at = Math.round(x)
    lines.push(`<line x1="${at}" y1="0" x2="${at}" y2="${HEIGHT}"/>`)
  }
  for (let y = (offsetY % 60) - 60; y < HEIGHT + 60; y += 60) {
    const at = Math.round(y)
    lines.push(`<line x1="0" y1="${at}" x2="${WIDTH}" y2="${at}"/>`)
  }

  const body =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" ` +
    `viewBox="0 0 ${WIDTH} ${HEIGHT}" role="presentation">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="hsl(36 24% 93%)"/>` +
    `<g stroke="hsl(30 13% 84%)" stroke-width="1">${lines.join('')}</g>` +
    `<circle cx="${WIDTH / 2}" cy="${HEIGHT / 2}" r="${radius}" fill="hsl(2 56% 34%)" ` +
    `fill-opacity="${precise ? '1' : '0.18'}" stroke="hsl(2 56% 34%)" stroke-width="2"/>` +
    `</svg>`

  return { body }
}
