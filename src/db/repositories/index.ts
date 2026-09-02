import type { Db } from 'mongodb'
import { createAuditRepository, type AuditRepository } from './audit'
import { createOfferRepository, type OfferRepository } from './offers'
import { createPropertyRepository, type PropertyRepository } from './properties'

export type Repositories = {
  readonly audit: AuditRepository
  readonly offers: OfferRepository
  readonly properties: PropertyRepository
}

export function createRepositories(db: Db): Repositories {
  return {
    audit: createAuditRepository(db),
    offers: createOfferRepository(db),
    properties: createPropertyRepository(db),
  }
}
