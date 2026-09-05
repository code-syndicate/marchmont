import type { Repositories } from '../db/repositories'
import type { Offer, OfferStatus, OfferWrite } from '../db/repositories/offers'
import type { Property } from '../db/repositories/properties'
import { IllegalTransition, canTransition } from '../domain/offer-status'

export type Authoring = {
  createOffer(input: OfferWrite, staffId: string): Promise<Offer>
  updateOffer(id: string, patch: Partial<OfferWrite>, staffId: string): Promise<Offer | null>
  moveOffer(id: string, to: OfferStatus, staffId: string, reason?: string): Promise<Offer>
  createProperty(input: Omit<Property, 'id'>, staffId: string): Promise<Property>
  updateProperty(id: string, patch: Partial<Omit<Property, 'id'>>, staffId: string): Promise<Property | null>
  /** Refuses while any offer still points at the building. */
  deleteProperty(id: string, staffId: string): Promise<{ deleted: boolean; blockedBy: number }>
}

export function createAuthoring(deps: { repositories: Repositories }): Authoring {
  const { offers, properties, audit } = deps.repositories

  return {
    async createOffer(input, staffId) {
      const offer = await offers.create(input)
      await audit.append({
        actor: `staff:${staffId}`,
        action: 'offer.created',
        subject: `offer:${offer.id}`,
        detail: { slug: offer.slug, type: offer.type, status: offer.status },
      })
      return offer
    },

    async updateOffer(id, patch, staffId) {
      const before = await offers.byId(id)
      if (!before) return null

      const after = await offers.update(id, patch)
      if (!after) return null

      // What changed, not the whole document. A trail nobody can read is a
      // trail nobody reads.
      const changed = Object.keys(patch).filter((key) => {
        const from = (before as unknown as Record<string, unknown>)[key]
        const to = (patch as Record<string, unknown>)[key]
        return JSON.stringify(from) !== JSON.stringify(to)
      })

      await audit.append({
        actor: `staff:${staffId}`,
        action: 'offer.updated',
        subject: `offer:${id}`,
        detail: { fields: changed },
      })
      return after
    },

    async moveOffer(id, to, staffId, reason) {
      const offer = await offers.byId(id)
      if (!offer) throw new IllegalTransition('draft', to)
      if (!canTransition(offer.status, to, offer.type)) throw new IllegalTransition(offer.status, to)

      const moved = await offers.moveStatus(id, offer.status, to)
      // Lost the race to another reviewer.
      if (!moved) throw new IllegalTransition(offer.status, to)

      await audit.append({
        actor: `staff:${staffId}`,
        action: `offer.${to}`,
        subject: `offer:${id}`,
        detail: { from: offer.status, to, ...(reason ? { reason } : {}) },
      })
      return moved
    },

    async createProperty(input, staffId) {
      const property = await properties.create(input)
      await audit.append({
        actor: `staff:${staffId}`,
        action: 'property.created',
        subject: `property:${property.id}`,
        detail: { slug: property.slug, name: property.name },
      })
      return property
    },

    async updateProperty(id, patch, staffId) {
      const after = await properties.update(id, patch)
      if (!after) return null
      await audit.append({
        actor: `staff:${staffId}`,
        action: 'property.updated',
        subject: `property:${id}`,
        detail: { fields: Object.keys(patch) },
      })
      return after
    },

    async deleteProperty(id, staffId) {
      const attached = await offers.forProperty(id)
      const everything = (await offers.everything()).filter((offer) => offer.propertyId === id)
      if (everything.length > 0) return { deleted: false, blockedBy: everything.length }
      if (attached.length > 0) return { deleted: false, blockedBy: attached.length }

      await properties.remove(id)
      await audit.append({ actor: `staff:${staffId}`, action: 'property.deleted', subject: `property:${id}` })
      return { deleted: true, blockedBy: 0 }
    },
  }
}
