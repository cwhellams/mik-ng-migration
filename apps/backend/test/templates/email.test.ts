import { BookingStatus, BookingType, type Booking } from '../../src/routes/bookings/models.ts'
import { MIKLang } from '../../src/routes/members/models.ts'
import { OccurrenceStatus, type Occurrence } from '../../src/routes/occurrences/models.ts'
import { renderEmail } from '../../src/templates/renderEmail.ts'
import { bookingEmailVars } from '../../src/templates/bookingEmailHelpers.ts'
import { occurrenceEmailVars } from '../../src/templates/occurrenceEmailHelpers.ts'

// These suites snapshot the rendered HTML of every markdown-backed email. The
// test names are deliberately unchanged from when each template had its own
// `*EmailTemplate.ts` wrapper: the existing snapshots are what proves the move
// to the registry (#1115 §5) did not alter a single byte of any email.

describe('Login Email template tests', () => {
  const loginVars = {
    code: 12345,
    href: 'https://example.com',
    firstName: 'Tester1',
  }

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('loginEmailBodyHtml for lang: %s', (lang) => {
    const result = renderEmail('login', lang, loginVars).html
    expect(result).toMatchSnapshot()
  })
})

describe('Register Email template tests', () => {
  const registerVars = {
    code: 12345,
    href: 'https://example.com',
    firstName: 'Tester1',
  }

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('registerEmailBodyHtml', (lang) => {
    const result = renderEmail('registration-submit', lang, registerVars).html
    expect(result).toMatchSnapshot()
  })
})

describe('Register approved template tests', () => {
  const welcomeVars = {
    firstName: 'Tester1',
  }

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('membershipApprovedEmailBodyHtml', (lang) => {
    const result = renderEmail('registration-approved', lang, welcomeVars).html
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
    const result = renderEmail(
      'booking-cancelled',
      lang,
      bookingEmailVars(cancelledBooking, { firstName: 'Tester' }),
    ).html
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
    const result = renderEmail(
      'booking-confirmed',
      lang,
      bookingEmailVars(confirmedBooking, { firstName: 'Tester' }),
    ).html
    expect(result).toMatchSnapshot()
  })

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('bookingUpdatedEmailBodyHtml', (lang) => {
    const result = renderEmail(
      'booking-updated',
      lang,
      bookingEmailVars(confirmedBooking, { firstName: 'Tester' }),
    ).html
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
    const result = renderEmail(
      'booking-reminder',
      lang,
      bookingEmailVars(upcomingBooking, { firstName: 'Tester' }),
    ).html
    expect(result).toMatchSnapshot()
  })
})
describe('Overdue invoice template tests', () => {
  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('overdueInvoiceEmailBodyHtml', (lang) => {
    const result = renderEmail('overdue-invoice', lang, {
      firstName: 'Tester1',
      invoiceId: 'INV-12345',
      amount: 100.0,
      dueDate: '2024-06-30',
    }).html
    expect(result).toMatchSnapshot()
  })
})

describe('Reservation suspended template tests', () => {
  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('reservationSuspendedEmailBodyHtml', (lang) => {
    const result = renderEmail('reservation-suspended', lang, {
      firstName: 'Tester1',
      invoiceCount: 2,
      totalAmount: 150.0,
      cancelledBookingsCount: 3,
    }).html
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
    attachments: [],
  } as unknown as Occurrence

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])(
    'occurrenceNotificationEmailBodyHtml for lang: %s',
    (lang) => {
      const result = renderEmail(
        'occurrence-notification',
        lang,
        occurrenceEmailVars(occurrence),
      ).html
      expect(result).toMatchSnapshot()
    },
  )

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])(
    'occurrenceNotificationEmailBodyHtml with deadline for lang: %s',
    (lang) => {
      const result = renderEmail(
        'occurrence-notification',
        lang,
        occurrenceEmailVars({ ...occurrence, deadLine: '2025-12-04T10:31:00.000Z' }),
      ).html
      expect(result).toMatchSnapshot()
    },
  )

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])(
    'occurrenceNotificationEmailBodyHtml anonymized for lang: %s',
    (lang) => {
      const result = renderEmail(
        'occurrence-notification',
        lang,
        occurrenceEmailVars({
          ...occurrence,
          status: OccurrenceStatus.ANONYMIZED,
          deadLine: '2025-12-04T10:31:00.000Z',
        }),
      ).html
      expect(result).toMatchSnapshot()
    },
  )
})

describe('New member notification template tests', () => {
  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('newMemberEmailBodyHtml for lang: %s', (lang) => {
    const result = renderEmail('new-member', lang, {
      firstName: 'Tester1',
      href: 'http://localhost:5173/club/members',
    }).html
    expect(result).toMatchSnapshot()
  })
})

describe('Email change verify template tests', () => {
  const emailChangeVars = {
    firstName: 'Tester1',
    newEmail: 'new@example.com',
    href: 'https://example.com/profile/email-change/verify?token=abc123',
  }

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])(
    'emailChangeVerifyBodyHtml for lang: %s',
    (lang) => {
      const result = renderEmail('email-change-verify', lang, emailChangeVars).html
      expect(result).toMatchSnapshot()
    },
  )

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])('emailChangeVerifySubject for lang: %s', (lang) => {
    const result = renderEmail('email-change-verify', lang, emailChangeVars).subject
    expect(result).toMatchSnapshot()
  })
})

describe('Expense claim email template tests', () => {
  const expenseVars = {
    memberName: 'Tester1',
    claimTitle: 'Fuel receipt',
    claimUrl: 'https://example.com/expenses/123',
  }

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])(
    'expenseApprovedEmailTemplate for lang: %s',
    (lang) => {
      const result = renderEmail('expense-approved', lang, expenseVars)
      expect(result).toMatchSnapshot()
    },
  )

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])(
    'expenseRejectedEmailTemplate for lang: %s',
    (lang) => {
      const result = renderEmail('expense-rejected', lang, {
        ...expenseVars,
        rejectionReason: 'Missing receipt',
      })
      expect(result).toMatchSnapshot()
    },
  )

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])(
    'expenseRequestInfoEmailTemplate for lang: %s',
    (lang) => {
      const result = renderEmail('expense-request-info', lang, {
        ...expenseVars,
        adminMessage: 'Please attach the original receipt',
      })
      expect(result).toMatchSnapshot()
    },
  )

  it.each([MIKLang.FI, MIKLang.EN, MIKLang.SV])(
    'expenseSetToDraftEmailTemplate for lang: %s',
    (lang) => {
      const result = renderEmail('expense-set-to-draft', lang, expenseVars)
      expect(result).toMatchSnapshot()
    },
  )
})

describe('Responsive email wrapper', () => {
  // Explicit (non-snapshot) assertions so a future refactor can't silently
  // drop the mobile viewport fix without a snapshot update masking it.
  const html = renderEmail('expense-approved', MIKLang.EN, {
    memberName: 'Tester1',
    claimTitle: 'Fuel receipt',
    claimUrl: 'https://example.com/expenses/123',
  }).html

  it('includes a viewport meta tag', () => {
    expect(html).toMatch(/meta[^>]+name="viewport"[^>]*>/)
  })

  it('includes a mobile media query', () => {
    expect(html).toMatch(/@media only screen and \(max-width: 600px\)/)
  })
})
