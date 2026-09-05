export type PasswordProblem = 'too_short' | 'too_long' | 'too_common' | 'contains_email'

export const MINIMUM_LENGTH = 12
// bcrypt-style truncation is not in play with argon2id, but an unbounded input
// is a way to make a login endpoint do arbitrary work.
export const MAXIMUM_LENGTH = 200

/**
 * The worst of the obvious. A real deployment checks a breach corpus; this list
 * is here so the rule exists and has a seam, not because it is sufficient.
 */
const REFUSED = new Set([
  'password', 'password1', 'password123', 'passw0rd', '123456789', '1234567890',
  'qwertyuiop', 'letmein123', 'iloveyou123', 'administrator', 'nashluxury123',
  'welcome1234', 'changeme123', 'trustno1234',
])

export function checkPassword(password: string, email = ''): PasswordProblem | null {
  if (password.length < MINIMUM_LENGTH) return 'too_short'
  if (password.length > MAXIMUM_LENGTH) return 'too_long'

  const lowered = password.toLowerCase()
  if (REFUSED.has(lowered)) return 'too_common'

  const localPart = email.split('@')[0]?.toLowerCase() ?? ''
  if (localPart.length >= 3 && lowered.includes(localPart)) return 'contains_email'

  return null
}

export const PASSWORD_MESSAGE: Record<PasswordProblem, string> = {
  too_short: `Use at least ${MINIMUM_LENGTH} characters.`,
  too_long: `Use at most ${MAXIMUM_LENGTH} characters.`,
  too_common: 'That password is too easy to guess. Choose another.',
  contains_email: 'Do not use your email address in your password.',
}
