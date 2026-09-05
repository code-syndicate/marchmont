import { describe, expect, test } from 'bun:test'
import { createLogMailProvider, createSandboxMailProvider, type Letter } from '../../src/providers/mail'

const letter: Letter = {
  to: 'aoife@example.com',
  template: 'verify_email',
  subject: 'Confirm your email address',
  lines: ['Confirm the address so we can reach you about the portfolio.'],
  action: { label: 'Confirm this address', url: 'https://marchmont.house/verify?token=abc' },
}

describe('the sandbox provider', () => {
  test('records what was sent, so a test reads the real message', async () => {
    const mail = createSandboxMailProvider()
    await mail.send(letter)
    expect(mail.outbox).toHaveLength(1)
    expect(mail.lastTo('aoife@example.com')?.action?.url).toContain('token=abc')
  })

  test('returns the most recent message for an address', async () => {
    const mail = createSandboxMailProvider()
    await mail.send(letter)
    await mail.send({ ...letter, template: 'password_reset', subject: 'Reset your password' })
    expect(mail.lastTo('aoife@example.com')?.template).toBe('password_reset')
  })

  test('knows nothing about an address it has not written to', async () => {
    const mail = createSandboxMailProvider()
    await mail.send(letter)
    expect(mail.lastTo('someone@example.com')).toBeUndefined()
  })

  test('clears', async () => {
    const mail = createSandboxMailProvider()
    await mail.send(letter)
    mail.clear()
    expect(mail.outbox).toHaveLength(0)
  })
})

describe('the log provider', () => {
  test('writes the address, the template and the link', async () => {
    const lines: string[] = []
    await createLogMailProvider((line) => lines.push(line)).send(letter)
    const written = lines.join('\n')
    expect(written).toContain('aoife@example.com')
    expect(written).toContain('verify_email')
    expect(written).toContain('https://marchmont.house/verify?token=abc')
  })
})
