import type { Repositories } from '../db/repositories'
import type { Thread } from '../db/repositories/threads'
import type { Viewing } from '../db/repositories/viewings'
import type { MailProvider } from '../providers/mail'
import {
  MAX_PROPOSED_TIMES,
  bothEngaged,
  canMoveViewing,
  contactFor,
  hoursBetween,
  median,
  type Contact,
  type ViewingStatus,
} from '../domain/threads'

export type Enquiries = {
  openThread(input: { offerSlug: string; offerName: string; registrant: { id: string; name: string }; subject: string; body: string }): Promise<Thread>
  reply(input: { threadId: string; from: 'registrant' | 'staff'; authorId: string; authorName: string; body: string }): Promise<Thread | null>
  closeThread(threadId: string, staffId: string): Promise<void>
  reopenThread(threadId: string, staffId: string): Promise<void>
  contactOn(thread: Thread, contact: Contact): { email: string; phone?: string; released: boolean }
  requestViewing(input: { offerSlug: string; offerName: string; registrantId: string; times: readonly Date[]; note?: string; threadId?: string }): Promise<Viewing | null>
  decideViewing(input: { viewingId: string; to: ViewingStatus; staffId: string; confirmedTime?: Date; times?: readonly Date[]; staffNote?: string }): Promise<Viewing | null>
  withdrawViewing(viewingId: string, registrantId: string): Promise<Viewing | null>
  responseTimes(): Promise<{ medianHours: number | null; awaiting: number; oldestWaitingHours: number | null }>
}

export function createEnquiries(deps: { repositories: Repositories; mail: MailProvider; publicUrl: string }): Enquiries {
  const { repositories, mail, publicUrl } = deps
  const { threads, viewings, users, audit } = repositories

  const url = (path: string): string => new URL(path, publicUrl).toString()

  const tellRegistrant = async (registrantId: string, subject: string, lines: string[], path: string): Promise<void> => {
    const registrant = await users.byId(registrantId)
    if (!registrant) return
    await mail.send({
      to: registrant.email,
      template: 'verify_email',
      subject,
      lines: [`${registrant.name},`, ...lines],
      action: { label: 'Open it', url: url(path) },
    })
  }

  return {
    async openThread({ offerSlug, offerName, registrant, subject, body }) {
      const thread = await threads.open({
        offerSlug,
        offerName,
        registrantId: registrant.id,
        subject,
        message: { from: 'registrant', authorId: registrant.id, authorName: registrant.name, body },
      })
      await audit.append({
        actor: `registrant:${registrant.id}`,
        action: 'enquiry.thread_opened',
        subject: `thread:${thread.id}`,
        detail: { offer: offerSlug },
      })
      return thread
    },

    async reply({ threadId, from, authorId, authorName, body }) {
      const thread = await threads.addMessage(threadId, { from, authorId, authorName, body })
      if (!thread) return null

      await audit.append({
        actor: `${from}:${authorId}`,
        action: 'enquiry.replied',
        subject: `thread:${threadId}`,
        detail: { from },
      })

      // Only the registrant is written to. Staff read the back office.
      if (from === 'staff') {
        await tellRegistrant(
          thread.registrantId,
          `Marchmont has replied about ${thread.offerName}`,
          ['There is a reply waiting on your enquiry.'],
          `/account/enquiries/${thread.id}`,
        )
      }
      return thread
    },

    async closeThread(threadId, staffId) {
      await threads.close(threadId, staffId)
      await audit.append({ actor: `staff:${staffId}`, action: 'enquiry.closed', subject: `thread:${threadId}` })
    },

    async reopenThread(threadId, staffId) {
      await threads.reopen(threadId)
      await audit.append({ actor: `staff:${staffId}`, action: 'enquiry.reopened', subject: `thread:${threadId}` })
    },

    contactOn: (thread, contact) => contactFor(thread, contact),

    async requestViewing({ offerSlug, offerName, registrantId, times, note, threadId }) {
      const proposed = [...times].filter((time) => time.getTime() > Date.now()).slice(0, MAX_PROPOSED_TIMES)
      if (proposed.length === 0) return null

      const viewing = await viewings.request({
        offerSlug,
        offerName,
        registrantId,
        proposedTimes: proposed,
        ...(note ? { note } : {}),
        ...(threadId ? { threadId } : {}),
      })
      await audit.append({
        actor: `registrant:${registrantId}`,
        action: 'viewing.requested',
        subject: `viewing:${viewing.id}`,
        detail: { offer: offerSlug, times: proposed.length },
      })
      return viewing
    },

    async decideViewing({ viewingId, to, staffId, confirmedTime, times, staffNote }) {
      const current = await viewings.byId(viewingId)
      if (!current || !canMoveViewing(current.status, to)) return null

      const patch: Partial<Viewing> = {
        decidedBy: staffId,
        ...(confirmedTime ? { confirmedTime } : {}),
        ...(times ? { proposedTimes: times } : {}),
        ...(staffNote ? { staffNote } : {}),
      }

      const moved = await viewings.move(viewingId, current.status, to, patch)
      if (!moved) return null

      await audit.append({
        actor: `staff:${staffId}`,
        action: `viewing.${to}`,
        subject: `viewing:${viewingId}`,
        detail: { offer: moved.offerSlug, from: current.status },
      })

      await tellRegistrant(
        moved.registrantId,
        to === 'confirmed' ? `Your viewing of ${moved.offerName} is confirmed` : `About your viewing of ${moved.offerName}`,
        to === 'confirmed'
          ? ['A time has been confirmed. The details are on your account.']
          : to === 'proposed'
            ? ['Alternative times have been offered for your viewing.']
            : ['Your viewing request was not taken forward.'],
        '/account/enquiries',
      )
      return moved
    },

    async withdrawViewing(viewingId, registrantId) {
      const current = await viewings.byId(viewingId)
      if (!current || current.registrantId !== registrantId || !canMoveViewing(current.status, 'withdrawn')) return null

      const moved = await viewings.move(viewingId, current.status, 'withdrawn', {})
      if (moved) {
        await audit.append({
          actor: `registrant:${registrantId}`,
          action: 'viewing.withdrawn',
          subject: `viewing:${viewingId}`,
        })
      }
      return moved
    },

    async responseTimes() {
      const open = await threads.all({ limit: 500 })
      const replied = open.filter((thread) => thread.firstStaffReplyAt)
      const hours = replied.map((thread) => hoursBetween(thread.openedAt, thread.firstStaffReplyAt!))

      const waiting = open.filter((thread) => !thread.closedAt && !bothEngaged(thread) && thread.lastMessageFrom === 'registrant')
      const waits = waiting.map((thread) => hoursBetween(thread.lastMessageAt, new Date()))

      return {
        medianHours: median(hours),
        awaiting: waiting.length,
        oldestWaitingHours: waits.length ? Math.max(...waits) : null,
      }
    },
  }
}
