export type Party = 'registrant' | 'staff'

export type ViewingStatus = 'requested' | 'proposed' | 'confirmed' | 'declined' | 'withdrawn'

const VIEWING_TRANSITIONS: Record<ViewingStatus, readonly ViewingStatus[]> = {
  // The registrant proposes times; staff either take one or offer others.
  requested: ['confirmed', 'proposed', 'declined', 'withdrawn'],
  proposed: ['confirmed', 'declined', 'withdrawn'],
  confirmed: ['declined', 'withdrawn'],
  declined: [],
  withdrawn: [],
}

export const VIEWING_LABEL: Record<ViewingStatus, string> = {
  requested: 'Awaiting a reply',
  proposed: 'Alternative times offered',
  confirmed: 'Confirmed',
  declined: 'Not going ahead',
  withdrawn: 'Withdrawn',
}

export function canMoveViewing(from: ViewingStatus, to: ViewingStatus): boolean {
  return VIEWING_TRANSITIONS[from]?.includes(to) ?? false
}

export const MAX_PROPOSED_TIMES = 3

export type ThreadLike = {
  readonly messageCount: number
  readonly registrantMessageCount: number
  readonly staffMessageCount: number
}

/**
 * Contact details are held back until each side has actually said something.
 * Releasing them on approval instead would just restate gate 1; the point of
 * this rule is that a one sided thread does not hand over a way to reach
 * someone who has not yet chosen to reply.
 */
export function bothEngaged(thread: ThreadLike): boolean {
  return thread.registrantMessageCount > 0 && thread.staffMessageCount > 0
}

/**
 * Enough of an address to recognise your own, and not enough to write to
 * someone else's.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return '•••'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const head = local.slice(0, 1)
  const dot = domain.lastIndexOf('.')
  const suffix = dot > 0 ? domain.slice(dot) : ''
  return `${head}${'•'.repeat(Math.max(local.length - 1, 2))}@${'•'.repeat(Math.max(dot > 0 ? dot : domain.length, 2))}${suffix}`
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return '•••'
  return `${'•'.repeat(Math.max(digits.length - 3, 3))}${digits.slice(-3)}`
}

export type Contact = { readonly email: string; readonly phone?: string }

export function contactFor(thread: ThreadLike, contact: Contact): { email: string; phone?: string; released: boolean } {
  if (bothEngaged(thread)) {
    return { email: contact.email, ...(contact.phone ? { phone: contact.phone } : {}), released: true }
  }
  return {
    email: maskEmail(contact.email),
    ...(contact.phone ? { phone: maskPhone(contact.phone) } : {}),
    released: false,
  }
}

/** Working hours, in whole hours, that a reply took. Used for the back office only. */
export function hoursBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 3_600_000))
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2)
}
