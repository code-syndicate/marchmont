export type RateLimiter = {
  /** True when the caller is within its allowance. Consumes one attempt. */
  take(key: string, now?: number): boolean
}

/**
 * A fixed window over an in-process map. Enough to stop a public form being
 * flooded from one address; it is per instance, so it does not survive a
 * restart and does not coordinate across replicas. A shared store is the
 * answer if this ever runs on more than one.
 */
export function createRateLimiter(options: { limit: number; windowMs: number }): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>()

  return {
    take(key, now = Date.now()) {
      // Bounded sweep, so an attacker cycling keys cannot grow the map forever.
      if (windows.size > 10_000) {
        for (const [existing, window] of windows) if (window.resetAt <= now) windows.delete(existing)
      }

      const window = windows.get(key)
      if (!window || window.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + options.windowMs })
        return true
      }
      if (window.count >= options.limit) return false
      window.count += 1
      return true
    },
  }
}
