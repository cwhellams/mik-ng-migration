import {
  BookingStatus,
  BookingType,
  type BookingUpsertRequest,
} from '../../src/routes/bookings/models.ts'
import type { Member } from '../../src/routes/members/models.ts'
import {
  bookingCancelledEmailBodyHtml,
  bookingCancelledEmailPlainText,
} from '../../src/templates/bookingCancelledEmailTemplate.ts'
import {
  loginEmailBodyHtml,
  loginEmailPlainText,
  type LoginVars,
} from '../../src/templates/loginEmailTemplate.ts'
import {
  registerEmailBody,
  registerEmailBodyHtml,
  type RegisterVars,
} from '../../src/templates/registrationEmailTemplate.ts'

describe('Login Email template tests', () => {
  const loginVars: LoginVars = {
    code: 12345,
    href: 'https://example.com',
  }

  it.each(['fi', 'en'])('loginEmailBodyHtml for lang: %s', lang => {
    const result = loginEmailBodyHtml(lang, loginVars)
    expect(result).toMatchSnapshot()
  })

  it('loginEmailPlainText', () => {
    const result = loginEmailPlainText('en', loginVars)
    expect(result).toMatchSnapshot()
  })
})

describe('Register Email template tests', () => {
  const registerVars: RegisterVars = {
    code: 12345,
    href: 'https://example.com',
    firstName: 'Tester1',
  }

  it.each(['fi', 'en'])('registerEmailBodyHtml', lang => {
    const result = registerEmailBodyHtml(lang, registerVars)
    expect(result).toMatchSnapshot()
  })

  it.each(['fi', 'en'])('registerEmailBody', lang => {
    const result = registerEmailBody(lang, registerVars)
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

  it.each(['fi', 'en'])('bookingCancellationEmailBodyHtml', lang => {
    const result = bookingCancelledEmailBodyHtml(lang, admin, oldBooking, newBooking)
    expect(result).toMatchSnapshot()
  })

  it.each(['fi', 'en'])('bookingCancellationEmailBody', lang => {
    const result = bookingCancelledEmailPlainText(lang, admin, oldBooking, newBooking)
    expect(result).toMatchSnapshot()
  })
})
