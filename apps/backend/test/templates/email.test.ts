import { BookingStatus, BookingType, type Booking } from '../../src/routes/bookings/models.ts'
import { MIKLang } from '../../src/routes/members/models.ts'
import { OccurrenceStatus, type Occurrence } from '../../src/routes/occurrences/models.ts'
import { bookingCancelledEmailBodyHtml } from '../../src/templates/bookingCancelledEmailTemplate.ts'
import {
  bookingConfirmedEmailBodyHtml,
  bookingUpdatedEmailBodyHtml,
} from '../../src/templates/bookingConfirmedEmailTemplate.ts'
import { bookingReminderEmailBodyHtml } from '../../src/templates/bookingReminderEmailTemplate.ts'
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
import { newMemberEmailBodyHtml } from '../../src/templates/newMemberEmailTemplate.ts'
import {
  emailChangeVerifyBodyHtml,
  emailChangeVerifySubject,
  type EmailChangeVerifyVars,
} from '../../src/templates/emailChangeVerifyTemplate.ts'

describe('Login Email template tests', () => {
  const loginVars: LoginVars = {
    code: 12345,
    href: 'https://example.com',
    firstName: 'Tester1',
  }

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('loginEmailBodyHtml for lang: %s', (lang) => {
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

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('registerEmailBodyHtml', (lang) => {
    const result = registerEmailBodyHtml(lang, registerVars)
    expect(result).toMatchSnapshot()
  })
})

describe('Register approved template tests', () => {
  const welcomeVars: WelcomeVars = {
    firstName: 'Tester1',
  }

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('membershipApprovedEmailBodyHtml', (lang) => {
    const result = membershipApprovedEmailBodyHtml(lang, welcomeVars)
    expect(result).toMatchSnapshot()
  })
})

describe('Booking cancellation template tests', () => {
  const cancelledBooking: Booking = {
    bookingId: 'test-booking-id',
    memberId: '2',
    member: { firstName: 'Tester', lastName: 'User', phoneNumber: null },
    registration: 'OH-IHQ',
    startTimeEpoch: '1700000000',
    endTimeEpoch: '1700003600',
    startTime: '2023-11-14T22:13:20.000Z',
    endTime: '2023-11-14T23:13:20.000Z',
    type: BookingType.PRIVATE,
    status: BookingStatus.CANCELLED,
    createdAt: '2023-11-14T20:00:00.000Z',
    createdBy: '1',
    updatedAt: '2023-11-14T20:00:00.000Z',
    updatedBy: '1',
    cancelledBy: null,
    calendarSequence: 0,
  }

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('bookingCancellationEmailBodyHtml', (lang) => {
    const result = bookingCancelledEmailBodyHtml(lang, 'Tester', cancelledBooking)
    expect(result).toMatchSnapshot()
  })
})
describe('Booking confirmation template tests', () => {
  const confirmedBooking: Booking = {
    bookingId: 'test-booking-id',
    memberId: '2',
    member: { firstName: 'Tester', lastName: 'User', phoneNumber: null },
    registration: 'OH-IHQ',
    startTimeEpoch: '1700000000',
    endTimeEpoch: '1700003600',
    startTime: '2023-11-14T22:13:20.000Z',
    endTime: '2023-11-14T23:13:20.000Z',
    type: BookingType.PRIVATE,
    status: BookingStatus.CONFIRMED,
    createdAt: '2023-11-14T20:00:00.000Z',
    createdBy: '1',
    updatedAt: '2023-11-14T20:00:00.000Z',
    updatedBy: '1',
    cancelledBy: null,
    calendarSequence: 0,
  }

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('bookingConfirmedEmailBodyHtml', (lang) => {
    const result = bookingConfirmedEmailBodyHtml(lang, 'Tester', confirmedBooking)
    expect(result).toMatchSnapshot()
  })

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('bookingUpdatedEmailBodyHtml', (lang) => {
    const result = bookingUpdatedEmailBodyHtml(lang, 'Tester', confirmedBooking)
    expect(result).toMatchSnapshot()
  })
})
describe('Booking reminder template tests', () => {
  const upcomingBooking: Booking = {
    bookingId: 'test-booking-id',
    memberId: '2',
    member: { firstName: 'Tester', lastName: 'User', phoneNumber: null },
    registration: 'OH-IHQ',
    startTimeEpoch: '1700000000',
    endTimeEpoch: '1700003600',
    startTime: '2023-11-14T22:13:20.000Z',
    endTime: '2023-11-14T23:13:20.000Z',
    type: BookingType.PRIVATE,
    status: BookingStatus.CONFIRMED,
    createdAt: '2023-11-14T20:00:00.000Z',
    createdBy: '1',
    updatedAt: '2023-11-14T20:00:00.000Z',
    updatedBy: '1',
    cancelledBy: null,
    calendarSequence: 0,
  }

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('bookingReminderEmailBodyHtml', (lang) => {
    const result = bookingReminderEmailBodyHtml(lang, 'Tester', upcomingBooking)
    expect(result).toMatchSnapshot()
  })
})
describe('Overdue invoice template tests', () => {
  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('overdueInvoiceEmailBodyHtml', (lang) => {
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
  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('reservationSuspendedEmailBodyHtml', (lang) => {
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

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])(
    'occurrenceNotificationEmailBodyHtml for lang: %s',
    (lang) => {
      const result = occurrenceNotificationEmailBodyHtml(lang, occurrence)
      expect(result).toMatchSnapshot()
    },
  )

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])(
    'occurrenceNotificationEmailBodyHtml with deadline for lang: %s',
    (lang) => {
      const result = occurrenceNotificationEmailBodyHtml(lang, {
        ...occurrence,
        deadLine: '2025-12-04T10:31:00.000Z',
      })
      expect(result).toMatchSnapshot()
    },
  )

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])(
    'occurrenceNotificationEmailBodyHtml anonymized for lang: %s',
    (lang) => {
      const result = occurrenceNotificationEmailBodyHtml(lang, {
        ...occurrence,
        status: OccurrenceStatus.ANONYMIZED,
        deadLine: '2025-12-04T10:31:00.000Z',
      })
      expect(result).toMatchSnapshot()
    },
  )
})

describe('New member notification template tests', () => {
  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('newMemberEmailBodyHtml for lang: %s', (lang) => {
    const result = newMemberEmailBodyHtml(lang, {
      firstName: 'Tester1',
      href: 'http://localhost:5173/club/members',
    })
    expect(result).toMatchSnapshot()
  })
})

describe('Email change verify template tests', () => {
  const emailChangeVars: EmailChangeVerifyVars = {
    firstName: 'Tester1',
    newEmail: 'new@example.com',
    href: 'https://example.com/profile/email-change/verify?token=abc123',
  }

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])(
    'emailChangeVerifyBodyHtml for lang: %s',
    (lang) => {
      const result = emailChangeVerifyBodyHtml(lang, emailChangeVars)
      expect(result).toMatchSnapshot()
    },
  )

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('emailChangeVerifySubject for lang: %s', (lang) => {
    const result = emailChangeVerifySubject(lang)
    expect(result).toMatchSnapshot()
  })
})
