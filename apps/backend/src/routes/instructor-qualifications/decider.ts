import type {
  InstructorQualificationEvent,
  InstructorQualificationSet,
  QualificationExpiryNotificationSent,
  QualificationProofUploaded,
} from './events.ts'
import type {
  InstructorQualificationUpsert,
  ProofDocumentCategory,
} from '@mik/contracts/instructor-qualifications'

export type InstructorQualificationState = {
  memberId: string | null
  fiExpiry: string | null
  iriExpiry: string | null
  criExpiry: string | null
  sepExpiry: string | null
  medicalClass1Expiry: string | null
  medicalClass2Expiry: string | null
  medicalLaplExpiry: string | null
  /** Deduplication keys encoded as "field:type:expiryDate" */
  sentNotifications: string[]
}

export const initialState = (): InstructorQualificationState => ({
  memberId: null,
  fiExpiry: null,
  iriExpiry: null,
  criExpiry: null,
  sepExpiry: null,
  medicalClass1Expiry: null,
  medicalClass2Expiry: null,
  medicalLaplExpiry: null,
  sentNotifications: [],
})

export const evolve = (
  state: InstructorQualificationState,
  event: InstructorQualificationEvent,
): InstructorQualificationState => {
  switch (event.type) {
    case 'InstructorQualificationSet': {
      const { data } = event
      return {
        ...state,
        memberId: data.memberId,
        fiExpiry: data.fiExpiry,
        iriExpiry: data.iriExpiry,
        criExpiry: data.criExpiry,
        sepExpiry: data.sepExpiry,
        medicalClass1Expiry: data.medicalClass1Expiry,
        medicalClass2Expiry: data.medicalClass2Expiry,
        medicalLaplExpiry: data.medicalLaplExpiry,
      }
    }
    case 'QualificationProofUploaded':
      return state
    case 'QualificationExpiryNotificationSent': {
      const { data } = event
      const key = `${data.qualificationField}:${data.notificationType}:${data.expiryDate}`
      if (state.sentNotifications.includes(key)) return state
      return { ...state, sentNotifications: [...state.sentNotifications, key] }
    }
    default:
      return state
  }
}

export const setQualifications = (
  memberId: string,
  data: InstructorQualificationUpsert,
  setBy: string,
): InstructorQualificationSet => ({
  type: 'InstructorQualificationSet',
  data: {
    memberId,
    fiExpiry: data.fiExpiry ?? null,
    iriExpiry: data.iriExpiry ?? null,
    criExpiry: data.criExpiry ?? null,
    sepExpiry: data.sepExpiry ?? null,
    medicalClass1Expiry: data.medicalClass1Expiry ?? null,
    medicalClass2Expiry: data.medicalClass2Expiry ?? null,
    medicalLaplExpiry: data.medicalLaplExpiry ?? null,
    setBy,
    changedAt: new Date().toISOString(),
  },
})

export const recordProofUploaded = (
  memberId: string,
  proofFileId: number,
  fileName: string,
  documentCategory: ProofDocumentCategory,
  uploadedBy: string,
): QualificationProofUploaded => ({
  type: 'QualificationProofUploaded',
  data: { memberId, proofFileId, fileName, documentCategory, uploadedBy },
})

export const recordNotificationSent = (
  memberId: string,
  qualificationField: string,
  notificationType: 'REMINDER' | 'EXPIRED',
  expiryDate: string,
  state: InstructorQualificationState,
): QualificationExpiryNotificationSent | null => {
  const key = `${qualificationField}:${notificationType}:${expiryDate}`
  if (state.sentNotifications.includes(key)) return null
  return {
    type: 'QualificationExpiryNotificationSent',
    data: { memberId, qualificationField, notificationType, expiryDate },
  }
}
