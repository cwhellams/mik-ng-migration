import type { Event } from '@event-driven-io/emmett'

export type InstructorQualificationSet = Event<
  'InstructorQualificationSet',
  {
    memberId: string
    fiExpiry: string | null
    iriExpiry: string | null
    criExpiry: string | null
    sepExpiry: string | null
    medicalClass1Expiry: string | null
    medicalClass2Expiry: string | null
    medicalLaplExpiry: string | null
    setBy: string
    changedAt: string
  }
>

export type QualificationProofUploaded = Event<
  'QualificationProofUploaded',
  {
    memberId: string
    proofFileId: number
    fileName: string
    documentCategory: 'LICENSE' | 'MEDICAL'
    uploadedBy: string
  }
>

export type QualificationExpiryNotificationSent = Event<
  'QualificationExpiryNotificationSent',
  {
    memberId: string
    qualificationField: string
    notificationType: 'REMINDER' | 'EXPIRED'
    expiryDate: string
  }
>

export type InstructorQualificationEvent =
  InstructorQualificationSet | QualificationProofUploaded | QualificationExpiryNotificationSent

export const instructorQualificationStreamId = (memberId: string): string =>
  `instructor-qualification:${memberId}`
