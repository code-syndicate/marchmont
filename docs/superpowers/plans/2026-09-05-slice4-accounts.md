# Slice 4: accounts, review, and closing gate 1

Status: built.

## What this slice covers

Spec section 6, item 4: registration, email verification, sessions, password
reset, optional opt-in two factor, and the staff registration queue. Gate 1
closes with it, because approval is now something a registrant can actually
reach.

## Decisions

### Verifying an address and being approved are separate

Registering creates the account, hashes a password with argon2id and sends a
verification link. Confirming the address proves the address is real; staff
approval opens gate 1. Neither implies the other, and the verification message
says so in as many words, because a confirmation email that reads like an
approval is how people end up waiting for something that already happened.

Registrants created before this slice have no password. The duplicate path
already answers identically whether or not an address is known, so those rows
stay as they are and can be sent a reset link. No migration.

### Sessions are rows, not signed cookies

The cookie carries an opaque 32 byte id and nothing else. Slice 7 needs staff
to revoke a session, and gate 2 moves money, so a session has to be killable by
deleting one row. A password reset closes every session for that user, because
whoever asked for the reset may not be whoever is holding the old one.

Mongo reaps expired rows on its own schedule rather than promptly, so every
read also checks the expiry. The TTL index is housekeeping, not the rule.

### Staff are a separate collection

A registrant and a reviewer are different kinds of account. Collapsing them
into a role flag means a defect in the public registration form could mint a
reviewer. Staff sign in at their own route, a staff session is not a registrant
session and cannot read `/account`, and a registrant session cannot read
`/staff`. There is no public route that creates a staff account:
`bun run add-staff` does it, reading the password from stdin so it does not
reach the shell history.

### Two factor is opt in, and enrolment is not trust

TOTP over the SHA-1 HMAC every authenticator app implements, checked against
the RFC 6238 vectors. No dependency.

It is off at account creation. Enrolment only takes effect once a code from the
app has been shown to work, so a mistyped secret cannot lock someone out. The
step a code matched is recorded, so a code cannot be replayed inside its own
window, which also means the code used to enrol cannot then be used to sign in.

A session with two factor on is not authenticated by the password alone: it
reaches the code step and nothing else until a code is presented. Freshness is
then required again before changing how you sign in.

Recovery codes are single use and stored hashed. They are shown once, and the
page says that is the only time.

### Only failed sign ins are counted

The first version counted every attempt against both the address and the source
address. That would have locked out everyone behind a shared office connection
after ten ordinary sign ins. Failures are counted, not attempts; the per-address
limit is low and the per-source limit is high; a success clears the address
counter but never the source counter, since clearing that would let anyone with
one working account reset the limit for everybody sharing their connection.

The count lives in the database rather than in the process. The in-memory
limiter still covers the public contact and registration forms, where losing
the count on restart does not matter much.

### Tokens are stored hashed

Verification and reset links, and recovery codes, are hashed at rest. Reading
the database does not hand over a live account. Spending a link is the same
write as reading it, so a link cannot be followed twice.

### Gate 1 closed

`PRICE_REQUIRES_APPROVAL` is now true and `res.locals.viewer` resolves from the
session, which is what the seam in slice 3 was for. An unapproved viewer gets a
price band at two significant figures, computed with integer arithmetic on
minor units, that always brackets the real figure. An approved one gets the
figure, the exact address, the full gallery and the precise map pin.

A registrant whose account is pending is an unapproved viewer. So is one who
has entered a password but not yet a two factor code.

### Routes split

`src/app.ts` was 582 lines before this slice and would have carried public
pages, auth, account and back office. The spec's architecture names
`src/routes/` as thin Express files, so route groups moved there first, with no
behaviour change, and the slice was built on top of that.

## Not in this slice

Changing your own email address, and staff being able to revoke a session from
the back office. Both belong with the rest of the staff tooling in slice 7.

## Verified

- Registered, verified, signed in, enrolled two factor, signed out, signed back
  in through the code step, and read the resulting audit trail out of the
  database.
- A registrant session refused by `/staff`, a staff session refused by
  `/account`.
- Approved through the queue as staff, then confirmed the same registrant's
  session moved from a band and a district to the figure and the street.
- Password stored as argon2id, recovery codes stored hashed, spent links gone
  from the database.
- Zero axe violations and no horizontal overflow across the nine new pages at
  360 through 1440.
