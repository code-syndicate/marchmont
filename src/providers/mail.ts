/**
 * Mail. Nothing in the product composes a message inline: a route names a
 * template and passes it values, so the wording of anything a registrant
 * receives lives in one file and can be read without tracing a code path.
 */

export type MailTemplate = 'verify_email' | 'password_reset' | 'registration_approved' | 'registration_declined'

export type Letter = {
  readonly to: string
  readonly template: MailTemplate
  readonly subject: string
  readonly lines: readonly string[]
  /** The single action the message exists to offer, if it has one. */
  readonly action?: { readonly label: string; readonly url: string }
}

export type MailProvider = {
  send(letter: Letter): Promise<void>
}

export type SandboxMailProvider = MailProvider & {
  /** Everything sent so far, oldest first. */
  readonly outbox: readonly Letter[]
  lastTo(email: string): Letter | undefined
  clear(): void
}

/**
 * Records instead of sending. This is what runs in development and in tests, so
 * a test reads the link out of the message the product actually composed rather
 * than rebuilding it and asserting against its own guess.
 */
export function createSandboxMailProvider(): SandboxMailProvider {
  const outbox: Letter[] = []
  return {
    outbox,
    async send(letter) {
      outbox.push(letter)
    },
    lastTo(email) {
      return [...outbox].reverse().find((letter) => letter.to === email)
    },
    clear() {
      outbox.length = 0
    },
  }
}

/**
 * Writes each message to the log rather than dropping it. An operator running
 * without a mail vendor can still read a verification link out of the service
 * log and finish an account, which is a legitimate way to run a small site.
 */
export function createLogMailProvider(write: (line: string) => void = console.log): MailProvider {
  return {
    async send(letter) {
      write(`mail to=${letter.to} template=${letter.template} subject=${JSON.stringify(letter.subject)}`)
      for (const line of letter.lines) write(`  ${line}`)
      if (letter.action) write(`  ${letter.action.label}: ${letter.action.url}`)
    },
  }
}
