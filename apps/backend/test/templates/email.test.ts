import {
  BookingStatus,
  BookingType,
  type BookingUpsertRequest,
} from '../../src/routes/bookings/models.ts'
import { MIKLang, type Member } from '../../src/routes/members/models.ts'
import { OccurrenceStatus, type Occurrence } from '../../src/routes/occurrences/models.ts'
import { bookingCancelledEmailBodyHtml } from '../../src/templates/bookingCancelledEmailTemplate.ts'
import { loginEmailBodyHtml, type LoginVars } from '../../src/templates/loginEmailTemplate.ts'
import { occurrenceNotificationEmailBodyHtml } from '../../src/templates/occurrenceNotification.ts'
import { overdueInvoiceEmailBodyHtml } from '../../src/templates/overdueInvoiceEmailTemplate.ts'
import {
  membershipApprovedEmailBodyHtml,
  registerEmailBodyHtml,
  type RegisterVars,
  type WelcomeVars,
} from '../../src/templates/registrationEmailTemplate.ts'
import { reservationSuspendedEmailBodyHtml } from '../../src/templates/reservationSuspendedEmailTemplate.ts'

describe('Login Email template tests', () => {
  const loginVars: LoginVars = {
    code: 12345,
    href: 'https://example.com',
    firstName: 'Tester1',
  }

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('loginEmailBodyHtml for lang: %s', lang => {
    const result = loginEmailBodyHtml(lang, loginVars)
    expect(result).toMatchSnapshot()
  })
})

describe('Register Email template tests', () => {
  const registerVars: RegisterVars = {
    code: 12345,
    href: 'https://example.com',
    firstName: 'Tester1',
  }

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('registerEmailBodyHtml', lang => {
    const result = registerEmailBodyHtml(lang, registerVars)
    expect(result).toMatchSnapshot()
  })
})

describe('Register approved template tests', () => {
  const welcomeVars: WelcomeVars = {
    firstName: 'Tester1',
  }

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('membershipApprovedEmailBodyHtml', lang => {
    const result = membershipApprovedEmailBodyHtml(lang, welcomeVars)
    expect(result).toMatchSnapshot()
  })
})

describe('Booking cancellation template tests', () => {
  const oldBooking: BookingUpsertRequest = {
    memberId: '2',
    registration: 'OH-IHQ',
    startTimeEpoch: '1700000000',
    endTimeEpoch: '1700003600',
    type: BookingType.PRACTICE,
    status: BookingStatus.CONFIRMED,
  }
  const newBooking: BookingUpsertRequest = {
    memberId: '2',
    registration: 'OH-IHQ',
    startTimeEpoch: '1600000000',
    endTimeEpoch: '1800003600',
    type: BookingType.MAINTENANCE,
    status: BookingStatus.CONFIRMED,
  }

  const admin: Member = {
    memberId: '1',
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@example.com',
  } as Member

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('bookingCancellationEmailBodyHtml', lang => {
    const result = bookingCancelledEmailBodyHtml(lang, admin, oldBooking, newBooking)
    expect(result).toMatchSnapshot()
  })
})

describe('Overdue invoice template tests', () => {
  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('overdueInvoiceEmailBodyHtml', lang => {
    const result = overdueInvoiceEmailBodyHtml(lang, {
      firstName: 'Tester1',
      invoiceId: 'INV-12345',
      amount: 100.0,
      dueDate: '2024-06-30',
    })
    expect(result).toMatchSnapshot()
  })
})

describe('Reservation suspended template tests', () => {
  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('reservationSuspendedEmailBodyHtml', lang => {
    const result = reservationSuspendedEmailBodyHtml(lang, {
      firstName: 'Tester1',
      invoiceCount: 2,
      totalAmount: 150.0,
      cancelledBookingsCount: 3,
    })
    expect(result).toMatchSnapshot()
  })
})

describe('Occurrence Email template tests', () => {
  const occurrence = {
    id: 'SMS100001',
    aircraftRegistration: 'OH-STL',
    animalNumber: '100+',
    animalSize: 'S',
    animalSpecies: 'Kiwi',
    arrivalAirport: 'EFNU',
    categories: ['BIRD', 'WILD'],
    departureAirport: 'EFNU',
    description: 'Flock of kiwis hit the propeller on final.',
    headline: 'Kiwistrike at Nummela',
    isDtoReport: false,
    isWeatherRelevant: true,
    linkedReportId: null,
    location: 'EFNU Final approach 22',
    occurrenceDate: '2025-12-01T10:30:00.000Z',
    reportDate: '2025-12-01T10:31:00.000Z',
    status: 'NEW',
  } as Occurrence

  it.each([MIKLang.FI, MIKLang.EN])('occurrenceNotificationEmailBodyHtml for lang: %s', lang => {
    const result = occurrenceNotificationEmailBodyHtml(lang, occurrence)
    expect(result).toMatchSnapshot()
  })

  it.each([MIKLang.FI, MIKLang.EN])(
    'occurrenceNotificationEmailBodyHtml with deadline for lang: %s',
    lang => {
      const result = occurrenceNotificationEmailBodyHtml(lang, {
        ...occurrence,
        deadLine: '2025-12-04T10:31:00.000Z',
      })
      expect(result).toMatchSnapshot()
    },
  )

  it.each([MIKLang.FI, MIKLang.EN])(
    'occurrenceNotificationEmailBodyHtml anonymized for lang: %s',
    lang => {
      const result = occurrenceNotificationEmailBodyHtml(lang, {
        ...occurrence,
        status: OccurrenceStatus.ANONYMIZED,
        deadLine: '2025-12-04T10:31:00.000Z',
      })
      expect(result).toMatchSnapshot()
    },
  )
})
