import {
  initialState,
  evolve,
  setQualifications,
  recordProofUploaded,
  recordNotificationSent,
} from '../../../src/routes/instructor-qualifications/decider.ts'
import type { InstructorQualificationEvent } from '../../../src/routes/instructor-qualifications/events.ts'

const makeUpsertData = (
  overrides?: Partial<{
    fiExpiry: string
    iriExpiry: string
    criExpiry: string
    sepExpiry: string
    medicalClass1Expiry: string
    medicalClass2Expiry: string
    medicalLaplExpiry: string
  }>,
) => ({
  fiExpiry: overrides?.fiExpiry ?? null,
  iriExpiry: overrides?.iriExpiry ?? null,
  criExpiry: overrides?.criExpiry ?? null,
  sepExpiry: overrides?.sepExpiry ?? null,
  medicalClass1Expiry: overrides?.medicalClass1Expiry ?? null,
  medicalClass2Expiry: overrides?.medicalClass2Expiry ?? null,
  medicalLaplExpiry: overrides?.medicalLaplExpiry ?? null,
})

describe('initialState', () => {
  it('returns all null expiry fields and empty notifications', () => {
    const state = initialState()
    expect(state.memberId).toBeNull()
    expect(state.fiExpiry).toBeNull()
    expect(state.iriExpiry).toBeNull()
    expect(state.criExpiry).toBeNull()
    expect(state.sepExpiry).toBeNull()
    expect(state.medicalClass1Expiry).toBeNull()
    expect(state.medicalClass2Expiry).toBeNull()
    expect(state.medicalLaplExpiry).toBeNull()
    expect(state.sentNotifications).toEqual([])
  })
})

describe('evolve', () => {
  describe('InstructorQualificationSet', () => {
    it('updates expiry fields from event data', () => {
      const state = initialState()
      const event: InstructorQualificationEvent = {
        type: 'InstructorQualificationSet',
        data: {
          memberId: 'MEM001',
          fiExpiry: '2025-12-31',
          iriExpiry: '2026-06-30',
          criExpiry: null,
          sepExpiry: null,
          medicalClass1Expiry: '2025-09-01',
          medicalClass2Expiry: null,
          medicalLaplExpiry: null,
          setBy: 'ADMIN01',
          changedAt: '2025-01-01T10:00:00.000Z',
        },
      }
      const newState = evolve(state, event)
      expect(newState.memberId).toBe('MEM001')
      expect(newState.fiExpiry).toBe('2025-12-31')
      expect(newState.iriExpiry).toBe('2026-06-30')
      expect(newState.criExpiry).toBeNull()
      expect(newState.medicalClass1Expiry).toBe('2025-09-01')
    })

    it('preserves sentNotifications when updating expiry fields', () => {
      let state = initialState()
      // First set up a notification
      const notifEvent: InstructorQualificationEvent = {
        type: 'QualificationExpiryNotificationSent',
        data: {
          memberId: 'MEM001',
          qualificationField: 'fiExpiry',
          notificationType: 'REMINDER',
          expiryDate: '2025-06-01',
        },
      }
      state = evolve(state, notifEvent)
      expect(state.sentNotifications).toHaveLength(1)

      // Now update qualifications — notifications should still be there
      const setEvent: InstructorQualificationEvent = {
        type: 'InstructorQualificationSet',
        data: {
          memberId: 'MEM001',
          fiExpiry: '2026-06-01',
          iriExpiry: null,
          criExpiry: null,
          sepExpiry: null,
          medicalClass1Expiry: null,
          medicalClass2Expiry: null,
          medicalLaplExpiry: null,
          setBy: 'MEM001',
          changedAt: '2025-06-01T09:00:00.000Z',
        },
      }
      state = evolve(state, setEvent)
      expect(state.sentNotifications).toHaveLength(1)
      expect(state.fiExpiry).toBe('2026-06-01')
    })
  })

  describe('QualificationProofUploaded', () => {
    it('does not change state', () => {
      const state = initialState()
      const event: InstructorQualificationEvent = {
        type: 'QualificationProofUploaded',
        data: {
          memberId: 'MEM001',
          proofFileId: 42,
          fileName: 'license.pdf',
          documentCategory: 'LICENSE',
          uploadedBy: 'MEM001',
        },
      }
      const newState = evolve(state, event)
      expect(newState).toEqual(state)
    })
  })

  describe('QualificationExpiryNotificationSent', () => {
    it('appends the notification key to sentNotifications', () => {
      const state = initialState()
      const event: InstructorQualificationEvent = {
        type: 'QualificationExpiryNotificationSent',
        data: {
          memberId: 'MEM001',
          qualificationField: 'fiExpiry',
          notificationType: 'REMINDER',
          expiryDate: '2025-06-01',
        },
      }
      const newState = evolve(state, event)
      expect(newState.sentNotifications).toEqual(['fiExpiry:REMINDER:2025-06-01'])
    })

    it('does not duplicate the notification key if already present', () => {
      let state = initialState()
      const event: InstructorQualificationEvent = {
        type: 'QualificationExpiryNotificationSent',
        data: {
          memberId: 'MEM001',
          qualificationField: 'medicalClass1Expiry',
          notificationType: 'EXPIRED',
          expiryDate: '2025-03-15',
        },
      }
      state = evolve(state, event)
      state = evolve(state, event) // apply same event twice
      expect(state.sentNotifications).toHaveLength(1)
    })

    it('accumulates multiple distinct notifications', () => {
      let state = initialState()
      const events: InstructorQualificationEvent[] = [
        {
          type: 'QualificationExpiryNotificationSent',
          data: {
            memberId: 'MEM001',
            qualificationField: 'fiExpiry',
            notificationType: 'REMINDER',
            expiryDate: '2025-06-01',
          },
        },
        {
          type: 'QualificationExpiryNotificationSent',
          data: {
            memberId: 'MEM001',
            qualificationField: 'fiExpiry',
            notificationType: 'EXPIRED',
            expiryDate: '2025-06-01',
          },
        },
        {
          type: 'QualificationExpiryNotificationSent',
          data: {
            memberId: 'MEM001',
            qualificationField: 'iriExpiry',
            notificationType: 'REMINDER',
            expiryDate: '2025-12-01',
          },
        },
      ]
      state = events.reduce(evolve, state)
      expect(state.sentNotifications).toHaveLength(3)
    })
  })
})

describe('setQualifications', () => {
  it('creates an InstructorQualificationSet event with correct data', () => {
    const data = makeUpsertData({ fiExpiry: '2026-01-01', medicalClass1Expiry: '2025-06-30' })
    const event = setQualifications('MEM001', data, 'ADMIN01')
    expect(event.type).toBe('InstructorQualificationSet')
    expect(event.data.memberId).toBe('MEM001')
    expect(event.data.fiExpiry).toBe('2026-01-01')
    expect(event.data.medicalClass1Expiry).toBe('2025-06-30')
    expect(event.data.iriExpiry).toBeNull()
    expect(event.data.setBy).toBe('ADMIN01')
  })

  it('maps undefined values to null', () => {
    const event = setQualifications('MEM001', makeUpsertData(), 'MEM001')
    expect(event.data.fiExpiry).toBeNull()
    expect(event.data.iriExpiry).toBeNull()
    expect(event.data.criExpiry).toBeNull()
    expect(event.data.sepExpiry).toBeNull()
    expect(event.data.medicalClass1Expiry).toBeNull()
    expect(event.data.medicalClass2Expiry).toBeNull()
    expect(event.data.medicalLaplExpiry).toBeNull()
  })
})

describe('recordProofUploaded', () => {
  it('creates a QualificationProofUploaded event', () => {
    const event = recordProofUploaded('MEM001', 99, 'license.pdf', 'LICENSE', 'MEM001')
    expect(event.type).toBe('QualificationProofUploaded')
    expect(event.data.memberId).toBe('MEM001')
    expect(event.data.proofFileId).toBe(99)
    expect(event.data.fileName).toBe('license.pdf')
    expect(event.data.documentCategory).toBe('LICENSE')
    expect(event.data.uploadedBy).toBe('MEM001')
  })
})

describe('recordNotificationSent', () => {
  it('returns an event when the notification has not been sent yet', () => {
    const state = initialState()
    const event = recordNotificationSent('MEM001', 'fiExpiry', 'REMINDER', '2025-06-01', state)
    expect(event).not.toBeNull()
    expect(event!.type).toBe('QualificationExpiryNotificationSent')
    expect(event!.data.memberId).toBe('MEM001')
    expect(event!.data.qualificationField).toBe('fiExpiry')
    expect(event!.data.notificationType).toBe('REMINDER')
    expect(event!.data.expiryDate).toBe('2025-06-01')
  })

  it('returns null when the notification was already sent (idempotency)', () => {
    let state = initialState()
    // Apply the notification to state first
    const firstEvent: InstructorQualificationEvent = {
      type: 'QualificationExpiryNotificationSent',
      data: {
        memberId: 'MEM001',
        qualificationField: 'fiExpiry',
        notificationType: 'REMINDER',
        expiryDate: '2025-06-01',
      },
    }
    state = evolve(state, firstEvent)
    const result = recordNotificationSent('MEM001', 'fiExpiry', 'REMINDER', '2025-06-01', state)
    expect(result).toBeNull()
  })

  it('returns an event for a different notification type on the same field', () => {
    let state = initialState()
    const reminderEvent: InstructorQualificationEvent = {
      type: 'QualificationExpiryNotificationSent',
      data: {
        memberId: 'MEM001',
        qualificationField: 'fiExpiry',
        notificationType: 'REMINDER',
        expiryDate: '2025-06-01',
      },
    }
    state = evolve(state, reminderEvent)

    // EXPIRED is a different key
    const result = recordNotificationSent('MEM001', 'fiExpiry', 'EXPIRED', '2025-06-01', state)
    expect(result).not.toBeNull()
    expect(result!.data.notificationType).toBe('EXPIRED')
  })

  it('returns an event for the same field and type but different expiry date (renewal)', () => {
    let state = initialState()
    const oldEvent: InstructorQualificationEvent = {
      type: 'QualificationExpiryNotificationSent',
      data: {
        memberId: 'MEM001',
        qualificationField: 'fiExpiry',
        notificationType: 'REMINDER',
        expiryDate: '2025-06-01',
      },
    }
    state = evolve(state, oldEvent)

    // Renewed — different expiry date means a new notification is appropriate
    const result = recordNotificationSent('MEM001', 'fiExpiry', 'REMINDER', '2026-06-01', state)
    expect(result).not.toBeNull()
    expect(result!.data.expiryDate).toBe('2026-06-01')
  })
})
