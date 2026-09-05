import type { OfferStatus, OfferType } from '../db/repositories/offers'

/**
 * Offer status is a state machine, not a flag. Every transition is named, and
 * anything not named here cannot happen: a takedown is not the same act as a
 * sale, and the trail has to be able to tell them apart later.
 */
const TRANSITIONS: Record<OfferStatus, readonly OfferStatus[]> = {
  draft: ['pending_review', 'withdrawn'],
  pending_review: ['live', 'draft', 'withdrawn'],
  live: ['under_offer', 'let_agreed', 'sold', 'let', 'withdrawn', 'expired'],
  under_offer: ['sold', 'live', 'withdrawn'],
  let_agreed: ['let', 'live', 'withdrawn'],
  // Terminal. A building that sells again is a new offer with its own trail,
  // not the old one reopened.
  sold: [],
  let: [],
  withdrawn: ['draft'],
  expired: ['draft'],
}

export const OFFER_STATUSES = Object.keys(TRANSITIONS) as OfferStatus[]

/** Statuses that put an offer in front of the public. */
export const PUBLIC_STATUSES: readonly OfferStatus[] = ['live']

export const STATUS_LABEL: Record<OfferStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  live: 'Live',
  under_offer: 'Under offer',
  let_agreed: 'Let agreed',
  sold: 'Sold',
  let: 'Let',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
}

/** The words used on the public site. Staff read the same language. */
export const TYPE_LABEL: Record<OfferType, string> = {
  sale: 'For sale',
  long_lease: 'To let',
  corporate_let: 'Corporate let',
}

export const ACCOUNT_LABEL: Record<string, string> = {
  pending: 'Awaiting review',
  approved: 'Approved',
  declined: 'Not taken forward',
}

/** Which transitions make sense for a tenure type. A sale is never let agreed. */
const BY_TYPE: Record<OfferType, readonly OfferStatus[]> = {
  sale: ['under_offer', 'sold'],
  long_lease: ['let_agreed', 'let'],
  corporate_let: ['let_agreed', 'let'],
}

export function canTransition(from: OfferStatus, to: OfferStatus, type: OfferType): boolean {
  if (!TRANSITIONS[from]?.includes(to)) return false
  const typed: readonly OfferStatus[] = ['under_offer', 'sold', 'let_agreed', 'let']
  if (typed.includes(to) && !BY_TYPE[type].includes(to)) return false
  return true
}

export function nextStatuses(from: OfferStatus, type: OfferType): OfferStatus[] {
  return (TRANSITIONS[from] ?? []).filter((to) => canTransition(from, to, type))
}

export class IllegalTransition extends Error {
  constructor(readonly from: OfferStatus, readonly to: OfferStatus) {
    super(`An offer cannot go from ${from} to ${to}.`)
    this.name = 'IllegalTransition'
  }
}
