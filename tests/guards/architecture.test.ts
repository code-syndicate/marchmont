import { describe, expect, test } from 'bun:test'
import { Glob } from 'bun'

const root = new URL('../../', import.meta.url).pathname

async function sourceFiles(pattern: string): Promise<{ path: string; text: string }[]> {
  const glob = new Glob(pattern)
  const files: { path: string; text: string }[] = []
  for await (const path of glob.scan({ cwd: root })) {
    files.push({ path, text: await Bun.file(root + path).text() })
  }
  return files
}

describe('the MongoDB driver stays in the database layer', () => {
  test('nothing outside src/db imports mongodb', async () => {
    const offenders = (await sourceFiles('src/**/*.ts'))
      .filter((file) => !file.path.startsWith('src/db/'))
      .filter((file) => /from ['"]mongodb['"]/.test(file.text))
      .map((file) => file.path)
    expect(offenders).toEqual([])
  })

  test('nothing outside src/db/repositories runs a query', async () => {
    const queryMethods = /\.(find|findOne|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|aggregate|replaceOne|findOneAndUpdate|bulkWrite)\(/
    const offenders = (await sourceFiles('src/**/*.ts'))
      .filter((file) => !file.path.startsWith('src/db/'))
      .filter((file) => queryMethods.test(file.text))
      .map((file) => file.path)
    expect(offenders).toEqual([])
  })
})

describe('the domain layer is pure', () => {
  test('src/domain imports neither express nor mongodb', async () => {
    const offenders = (await sourceFiles('src/domain/**/*.ts'))
      .filter((file) => /from ['"](express|mongodb)['"]/.test(file.text))
      .map((file) => file.path)
    expect(offenders).toEqual([])
  })
})

describe('money never becomes a float', () => {
  test('no parseFloat, toFixed or Long.toNumber in src', async () => {
    const offenders: string[] = []
    for (const file of await sourceFiles('src/**/*.ts')) {
      for (const [index, line] of file.text.split('\n').entries()) {
        if (line.trimStart().startsWith('//')) continue
        if (/\bparseFloat\s*\(|\.toFixed\s*\(|\.toNumber\s*\(/.test(line)) {
          offenders.push(`${file.path}:${index + 1}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('the audit log has no write path but append', () => {
  test('no source file mutates the audit collection', async () => {
    const mutation = /collection[^\n]*['"]audit['"][^\n]*\)\s*\.\s*(updateOne|updateMany|deleteOne|deleteMany|replaceOne|findOneAndUpdate|findOneAndDelete|drop)/
    const offenders = (await sourceFiles('src/**/*.ts'))
      .filter((file) => mutation.test(file.text))
      .map((file) => file.path)
    expect(offenders).toEqual([])
  })
})

describe('the content security policy stays strict', () => {
  test('no inline style attribute, style block or script block in a template', async () => {
    const offenders: string[] = []
    for (const file of await sourceFiles('src/views/**/*.pug')) {
      if (/\bstyle\s*=/.test(file.text)) offenders.push(`${file.path} (style attribute)`)
      if (/^\s*(style|script)\b(?![^\n]*\bsrc=)/m.test(file.text)) {
        offenders.push(`${file.path} (inline block)`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('no Alpine expression that needs eval', async () => {
    const offenders: string[] = []
    for (const file of await sourceFiles('src/views/**/*.pug')) {
      if (/x-data\s*=\s*["']\s*\{/.test(file.text)) offenders.push(`${file.path} (object literal in x-data)`)
      if (/@click\s*=\s*["'][^"']*[()=]/.test(file.text)) offenders.push(`${file.path} (expression in @click)`)
    }
    expect(offenders).toEqual([])
  })
})

describe('interface copy stays plain', () => {
  test('no em dash or en dash in a template or the stylesheet', async () => {
    const offenders: string[] = []
    for (const file of [...(await sourceFiles('src/views/**/*.pug')), ...(await sourceFiles('public/*.css'))]) {
      if (/[–—]/.test(file.text)) offenders.push(file.path)
    }
    expect(offenders).toEqual([])
  })

  test('no internal commentary rendered to a page', async () => {
    const banned = /\b(coming soon|not yet implemented|placeholder|illustrative|lorem ipsum|TODO)\b/i
    const offenders = (await sourceFiles('src/views/**/*.pug'))
      .filter((file) => banned.test(file.text))
      .map((file) => file.path)
    expect(offenders).toEqual([])
  })
})
