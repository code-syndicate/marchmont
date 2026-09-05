import type { Db } from 'mongodb'
import { createAuditRepository, type AuditRepository } from './audit'
import { createEnquiryRepository, type EnquiryRepository } from './enquiries'
import { createOfferRepository, type OfferRepository } from './offers'
import { createPropertyRepository, type PropertyRepository } from './properties'
import { createUserRepository, type UserRepository } from './users'

export type Repositories = {
  readonly audit: AuditRepository
  readonly enquiries: EnquiryRepository
  readonly offers: OfferRepository
  readonly properties: PropertyRepository
  readonly users: UserRepository
}

export function createRepositories(db: Db): Repositories {
  return {
    audit: createAuditRepository(db),
    enquiries: createEnquiryRepository(db),
    offers: createOfferRepository(db),
    properties: createPropertyRepository(db),
    users: createUserRepository(db),
  }
}
