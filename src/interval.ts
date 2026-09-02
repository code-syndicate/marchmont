export type IntervalOptions = {
  readonly name: string
  readonly everyMs: number
  run(): Promise<void>
  onError?(error: unknown): void
}

export type IntervalHandle = {
  stop(): void
}

export function startInterval(options: IntervalOptions): IntervalHandle {
  const { name, everyMs, run, onError } = options
  let running = false
  let stopped = false

  const timer = setInterval(async () => {
    if (running || stopped) return
    running = true
    try {
      await run()
    } catch (error) {
      if (onError) onError(error)
      else console.error(`interval "${name}" failed`, error)
    } finally {
      running = false
    }
  }, everyMs)

  // Do not hold the process open on its own account.
  timer.unref?.()

  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}
