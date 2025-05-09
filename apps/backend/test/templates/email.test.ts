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
