import { ContactCategory } from '@mik/contracts/contact'
import { TRAINING_EMAIL, MEMBERSHIP_EMAIL, GENERAL_EMAIL } from '../../templates/registry.ts'

export function getContactRecipient(category: ContactCategory): string {
  switch (category) {
    case ContactCategory.TRAINING:
      return process.env.CONTACT_TRAINING_EMAIL ?? TRAINING_EMAIL
    case ContactCategory.MEMBERSHIP:
      return process.env.CONTACT_MEMBERSHIP_EMAIL ?? MEMBERSHIP_EMAIL
    case ContactCategory.OTHER:
    default:
      return process.env.CONTACT_GENERAL_EMAIL ?? GENERAL_EMAIL
  }
}
