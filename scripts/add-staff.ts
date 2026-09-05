/**
 * Creates a staff account. There is no public route that can make one, and no
 * seeded default, so the first reviewer is created here by whoever runs the
 * service.
 *
 *   bun scripts/add-staff.ts "Name" name@nashluxuryrealty.house
 *
 * The password is read from stdin rather than the command line, so it does not
 * end up in the shell history or in a process listing.
 */
import { loadConfig } from '../src/config'
import { connect } from '../src/db/client'
import { applySchema } from '../src/db/indexes'
import { checkPassword, PASSWORD_MESSAGE } from '../src/domain/passwords'

const [name, email] = process.argv.slice(2)

if (!name || !email) {
  console.error('Usage: bun scripts/add-staff.ts "Name" name@nashluxuryrealty.house')
  process.exit(1)
}

process.stdout.write('Password: ')
const password = (await new Response(Bun.stdin.stream()).text()).replace(/\r?\n$/, '')

const problem = checkPassword(password, email)
if (problem) {
  console.error(PASSWORD_MESSAGE[problem])
  process.exit(1)
}

const config = loadConfig(process.env)
const database = await connect(config)
await applySchema(database.db)

const normalised = email.trim().toLowerCase()
if (await database.repositories.staff.byEmail(normalised)) {
  console.error(`${normalised} already has a staff account.`)
  await database.close()
  process.exit(1)
}

const member = await database.repositories.staff.add({
  name: name.trim(),
  email: normalised,
  passwordHash: await Bun.password.hash(password, { algorithm: 'argon2id' }),
})

await database.repositories.audit.append({
  actor: 'console',
  action: 'staff.created',
  subject: `staff:${member.id}`,
  detail: { email: normalised },
})

console.log(`Staff account created for ${normalised}. Sign in at /staff/signin.`)
await database.close()
