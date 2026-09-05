import type { Db } from 'mongodb'
import { createAttemptRepository, type AttemptRepository } from './attempts'
import { createAuditRepository, type AuditRepository } from './audit'
import { createCredentialRepository, type CredentialRepository } from './credentials'
import { createEnquiryRepository, type EnquiryRepository } from './enquiries'
import { createOfferRepository, type OfferRepository } from './offers'
import { createPropertyRepository, type PropertyRepository } from './properties'
import { createSessionRepository, type SessionRepository } from './sessions'
import { createStaffRepository, type StaffRepository } from './staff'
import { createThreadRepository, type ThreadRepository } from './threads'
import { createViewingRepository, type ViewingRepository } from './viewings'
import { createUserRepository, type UserRepository } from './users'

export type Repositories = {
  readonly attempts: AttemptRepository
  readonly audit: AuditRepository
  readonly credentials: CredentialRepository
  readonly enquiries: EnquiryRepository
  readonly offers: OfferRepository
  readonly properties: PropertyRepository
  readonly sessions: SessionRepository
  readonly staff: StaffRepository
  readonly threads: ThreadRepository
  readonly viewings: ViewingRepository
  readonly users: UserRepository
}

export function createRepositories(db: Db): Repositories {
  return {
    attempts: createAttemptRepository(db),
    audit: createAuditRepository(db),
    credentials: createCredentialRepository(db),
    enquiries: createEnquiryRepository(db),
    offers: createOfferRepository(db),
    properties: createPropertyRepository(db),
    sessions: createSessionRepository(db),
    staff: createStaffRepository(db),
    threads: createThreadRepository(db),
    viewings: createViewingRepository(db),
    users: createUserRepository(db),
  }
}
