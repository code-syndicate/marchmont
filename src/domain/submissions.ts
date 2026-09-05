export type Intent = 'sale' | 'long_lease' | 'corporate_let'

export type Registration = {
  readonly name: string
  readonly email: string
  readonly intent: Intent
  readonly market?: string
  readonly requirement?: string
  readonly offer?: string
  readonly phone?: string
}

export type Enquiry = {
  readonly name: string
  readonly email: string
  readonly message: string
}

export type Invalid = { ok: false; errors: Record<string, string> }
export type Valid<T> = { ok: true; value: T }
export type Result<T> = Valid<T> | Invalid

export type Submitted = Record<string, unknown>

const INTENTS: readonly Intent[] = ['sale', 'long_lease', 'corporate_let']

const LIMITS = {
  name: 120,
  email: 254,
  requirement: 2000,
  message: 4000,
} as const

// Deliberately loose. An address is proved by sending to it, not by a regular
// expression, and the strict ones reject valid addresses.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function checkName(value: string, errors: Record<string, string>): void {
  if (!value) errors.name = 'Enter your name.'
  else if (value.length > LIMITS.name) errors.name = `Your name can be at most ${LIMITS.name} characters.`
}

function checkEmail(value: string, errors: Record<string, string>): void {
  if (!value) errors.email = 'Enter your email address.'
  else if (value.length > LIMITS.email || !EMAIL.test(value)) {
    errors.email = 'Enter an email address we can reply to.'
  }
}

export function validateRegistration(input: Submitted): Result<Registration> {
  const errors: Record<string, string> = {}

  const name = text(input.name)
  checkName(name, errors)

  const email = text(input.email).toLowerCase()
  checkEmail(email, errors)

  const rawIntent = text(input.intent)
  const intent = INTENTS.find((candidate) => candidate === rawIntent)
  if (!intent) errors.intent = 'Choose what you are looking for.'

  const rawMarket = text(input.market).toUpperCase()
  if (rawMarket && !/^[A-Z]{2}$/.test(rawMarket)) errors.market = 'Choose a market from the list.'

  const requirement = text(input.requirement)
  if (requirement.length > LIMITS.requirement) {
    errors.requirement = `Your requirement can be at most ${LIMITS.requirement} characters.`
  }

  const offer = text(input.offer)

  // Optional. Kept loose on purpose: there is no single correct shape across
  // the markets in scope, and rejecting a valid number is worse than storing
  // one we cannot dial.
  const phone = text(input.phone).slice(0, 40)
  if (phone && !/^[+()\d\s.-]{6,40}$/.test(phone)) errors.phone = 'Enter a telephone number we can reach you on.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      name,
      email,
      intent: intent!,
      ...(rawMarket ? { market: rawMarket } : {}),
      ...(requirement ? { requirement } : {}),
      ...(offer ? { offer } : {}),
      ...(phone ? { phone } : {}),
    },
  }
}

export function validateEnquiry(input: Submitted): Result<Enquiry> {
  const errors: Record<string, string> = {}

  const name = text(input.name)
  checkName(name, errors)

  const email = text(input.email).toLowerCase()
  checkEmail(email, errors)

  const message = text(input.message)
  if (message.length < 10) errors.message = 'Tell us what you are looking for, in a sentence or two.'
  else if (message.length > LIMITS.message) {
    errors.message = `Your message can be at most ${LIMITS.message} characters.`
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { name, email, message } }
}
