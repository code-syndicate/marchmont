export type ViewerState = 'anonymous' | 'pending' | 'approved'

export type Viewer = {
  readonly state: ViewerState
}

export const ANONYMOUS: Viewer = { state: 'anonymous' }

/**
 * Gate 1. An unregistered or unreviewed visitor browses the portfolio and sees
 * the photography, the area, the aspect and the district. The exact address,
 * the full gallery, the floor plans and the documents wait for a staff decision.
 */
export function isApproved(viewer: Viewer): boolean {
  return viewer.state === 'approved'
}

/**
 * The precise figure is released with the rest of gate 1 in the spec. It stays
 * open until accounts exist, because until a registration can actually be
 * approved there is no route from a band back to the number, and a price no
 * visitor can ever reach is worse than no gate at all.
 */
export const PRICE_REQUIRES_APPROVAL = false

export function canSeeExactAddress(viewer: Viewer): boolean {
  return isApproved(viewer)
}

export function canSeeFullGallery(viewer: Viewer): boolean {
  return isApproved(viewer)
}

export function canSeeExactPrice(viewer: Viewer): boolean {
  return !PRICE_REQUIRES_APPROVAL || isApproved(viewer)
}

/** How many photographs a viewer who has not been approved is shown. */
export const PUBLIC_GALLERY_LIMIT = 3

/**
 * The address as much of it as the viewer may have. A district and a city are
 * enough to judge a building; the street and number are what approval releases.
 */
export function addressFor(
  viewer: Viewer,
  address: { formatted: string; locality: string; region?: string },
): string {
  if (canSeeExactAddress(viewer)) return address.formatted
  return address.region ? `${address.region}, ${address.locality}` : address.locality
}
