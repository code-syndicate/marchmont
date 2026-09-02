import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Config } from './config'

export type AssetHasher = {
  cssHref(): string
}

export function createAssetHasher(config: Config, file = 'app.css'): AssetHasher {
  const path = new URL(`../public/${file}`, import.meta.url).pathname

  const compute = (): string => {
    try {
      return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8)
    } catch {
      return '00000000'
    }
  }

  // Bun's watcher does not restart on public/ edits, so a hash cached in
  // development would pin the browser to a stale stylesheet.
  if (config.nodeEnv === 'development') {
    return { cssHref: () => `/${file}?v=${compute()}` }
  }

  const cached = compute()
  return { cssHref: () => `/${file}?v=${cached}` }
}
