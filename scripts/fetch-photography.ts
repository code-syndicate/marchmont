/**
 * Downloads every photograph the seed references and writes three widths of
 * each into public/photography, so the site serves its own pictures rather than
 * hotlinking a CDN that can drop one at any time.
 *
 *   bun scripts/fetch-photography.ts
 *
 * Resizing is done by Pillow through a short python call. It is a build time
 * step run by hand when the portfolio changes, not something the server does.
 */
import { $ } from 'bun'

const WIDTHS = [800, 1600, 2400]
const OUT = 'public/photography'

const seed = await Bun.file('scripts/seed.ts').text()
const ids = [...new Set([...seed.matchAll(/\{ id: '(photo-[^']+)'/g)].map((m) => m[1]!))]
console.log(`${ids.length} photographs referenced`)

await $`mkdir -p ${OUT}`.quiet()

for (const id of ids) {
  const already = await Bun.file(`${OUT}/${id}-2400.jpg`).exists()
  if (already) { console.log(`  have  ${id}`); continue }

  const response = await fetch(`https://images.unsplash.com/${id}?w=2400&q=82&fm=jpg&fit=max`)
  if (!response.ok) { console.log(`  FAIL  ${id} ${response.status}`); continue }

  const master = `${OUT}/${id}-2400.jpg`
  await Bun.write(master, await response.arrayBuffer())

  for (const width of WIDTHS.filter((w) => w !== 2400)) {
    await $`python3 -c ${`
from PIL import Image
im = Image.open("${master}")
w = ${width}
im.thumbnail((w, 10000), Image.LANCZOS)
im.convert("RGB").save("${OUT}/${id}-${width}.jpg", quality=82, optimize=True, progressive=True)
`}`.quiet()
  }
  console.log(`  saved ${id}`)
}

const files = [...(await Array.fromAsync(new Bun.Glob('*.jpg').scan({ cwd: OUT })))]
let bytes = 0
for (const f of files) bytes += (await Bun.file(`${OUT}/${f}`).arrayBuffer()).byteLength
console.log(`${files.length} files, ${(bytes / 1_048_576).toFixed(1)} MB`)
