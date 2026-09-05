# Slice 5: enquiries, viewings, and the full back office

Status: built. Slice 7's back office was pulled forward into this slice.

## What this covers

Spec section 6, item 5 in full, plus item 7's staff tooling: offer authoring
with the state machine, buildings, people, queues, takedowns, user management
and the audit trail.

## Decisions

### Threads and the contact form are different things

The public contact form takes a message from anyone, with no account. A thread
is against one offer and needs an account, because there has to be somebody to
reply to. Both are surfaced in the back office rather than merged.

Contact form enquiries were write only before this slice: recorded since the
blocker pass and readable by nobody. They now appear on the dashboard and under
enquiries, with the honest note that there is no thread to reply into.

### Contact details are released when both sides have written

Not on approval, which would only restate gate 1. A one sided thread does not
hand over a way to reach someone who has not chosen to reply. Until staff
answer, staff see `a••••@•••••••.com` and a phone masked to its last three
digits; the reply releases both sides at once.

Phone is optional and validated loosely on purpose. There is no single correct
shape across nine markets, and rejecting a real number is worse than storing one
we cannot dial.

### Any signed in registrant can enquire, including a pending one

Asking a question is how somebody decides whether to pursue a building, so
making it wait on approval inverts the funnel. A declined account keeps its
history and cannot start anything new.

### Viewing times are instants, shown in the building's timezone

The registrant offers up to three; staff confirm one or offer alternatives.
Showing a time in the viewer's own zone would tell them when to arrive
somewhere they are not, so both sides see the building's local time. That
needed an IANA zone on the property, which is now stored and seeded for all
nine, rather than derived from a country code, which is wrong for several of
the markets in scope.

### Offer status became a real state machine

The spec called for one and there wasn't one. `src/domain/offer-status.ts`
names every transition. A draft cannot go straight live without review. A lease
is never sold and a sale is never let. Sold and let are terminal: a building
that sells again is a new offer with its own trail, not the old one reopened. A
withdrawn offer returns to draft rather than straight back to live.

Every move is conditional on the current status in the driver, so two reviewers
acting at once cannot both record a decision.

### Response times are internal

First staff reply per thread, and the median, on the dashboard. Nothing is
published: the site already promises two working days, and a published median
is a number the product would then have to keep true.

### Staff accounts still cannot be created from the site

The team page says so and gives the console command. A defect in a public form
must not be able to mint a reviewer.

## Two defects found while building

**Enquiry ordering was passing by luck.** `recent()` claimed most recent first
and sorted by `receivedAt` then `_id`. The id is a UUID, which carries no time,
so two enquiries in the same millisecond came back in whatever order the driver
chose. An ObjectId `seq` field now breaks the tie in insertion order, which is
what the audit repository already did.

**Pug mislexes a collection whose name starts with "of".** `each row in offers`
raises MALFORMED_EACH_OF_LVAL, because pug's each-of pattern matches the space
before `offers`. The list is passed to that template under another name, with a
comment saying why.

## Verified

- Authored an offer through the back office, moved it draft to pending review
  to live, watched it appear on the public site, and had a lease refuse a move
  to sold.
- Opened a thread as a registrant, confirmed the masked contact, replied as
  staff, confirmed both sides released together.
- Requested a viewing with two times, confirmed one as staff, and read the
  confirmation back on the registrant's page in the building's zone.
- Every act above appears in the audit trail with the right actor.
- Zero axe violations and no horizontal overflow across twelve pages at 360
  through 1440.
