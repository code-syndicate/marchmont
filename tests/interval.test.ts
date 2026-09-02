import { describe, expect, test } from 'bun:test'
import { startInterval } from '../src/interval'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('startInterval', () => {
  test('runs repeatedly', async () => {
    let runs = 0
    const job = startInterval({ name: 'counter', everyMs: 10, run: async () => { runs += 1 } })
    await wait(60)
    job.stop()
    expect(runs).toBeGreaterThanOrEqual(3)
  })

  test('never overlaps with itself when a run outlasts the interval', async () => {
    let active = 0
    let maxActive = 0
    const job = startInterval({
      name: 'slow',
      everyMs: 5,
      run: async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await wait(30)
        active -= 1
      },
    })
    await wait(120)
    job.stop()
    expect(maxActive).toBe(1)
  })

  test('survives a throwing run and reports it', async () => {
    const errors: unknown[] = []
    let runs = 0
    const job = startInterval({
      name: 'flaky',
      everyMs: 10,
      run: async () => { runs += 1; throw new Error('boom') },
      onError: (error) => errors.push(error),
    })
    await wait(60)
    job.stop()
    expect(runs).toBeGreaterThanOrEqual(3)
    expect(errors.length).toBeGreaterThanOrEqual(3)
  })

  test('stop prevents any further run', async () => {
    let runs = 0
    const job = startInterval({ name: 'stoppable', everyMs: 5, run: async () => { runs += 1 } })
    await wait(30)
    job.stop()
    const afterStop = runs
    await wait(40)
    expect(runs).toBe(afterStop)
  })
})
