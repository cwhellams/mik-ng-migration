import 'dotenv/config'
import { marked } from 'marked'
import { emailButton, emailTemplate } from './emailTemplate.ts'

export type RegisterVars = {
  firstName: string
  href: string
  code: number
}

export const registerEmailTitle = (lang: string | undefined): string =>
  lang == 'fi' ? 'Tervetuloa Malmin ilmailukerhoon' : 'Welcome to Malmin Ilmailukerho'

export const registerEmailBodyHtml = (lang: string | undefined, vars: RegisterVars): string =>
  lang == 'fi' ? registerEmailBodyHtmlFi(vars) : registerEmailBodyHtmlEn(vars)

export const registerEmailBody = (lang: string | undefined, vars: RegisterVars): string =>
  marked.parse(lang == 'fi' ? registerEmailBodyFi(vars) : registerEmailBodyEn(vars), {
    async: false,
  })

const registerEmailBodyFi = ({ firstName, href }: RegisterVars): string => `
  Hei ${firstName},
    
  kiitos hakemuksestasi Malmin Ilmailukerho ry:n jäseneksi. 
  Käsittelemme hakemuksesi pian ja olemme sinuun yhteydessä.

  Sillä välin, voit vahvistaa sähköpostiosoitteesi klikkaamalla alla olevaa linkkiä:

  [Vahvista sähköpostiosoite](${href})
    
  Vaihtoehtoisesti voit myös kopioida alla olevan linkin suoraan webbiselaimeesi:

  ${href}
  `

const registerEmailBodyEn = ({ firstName, href }: RegisterVars): string => `
  Hello ${firstName},
    
  thank you for applying as a member of Malmin Ilmailukerho ry. 
  We will review your application as soon as possible and get back to you.

  In the meantime, you can confirm your email address by clicking the link below:

  [Confirm email](${href})

  Alternatively you can also copy and paste the link into your browser:

  ${href}`

const registerEmailBodyHtmlEn = ({ firstName, href }: RegisterVars): string =>
  emailTemplate(
    'Registration Confirmation',
    `

      <p>Hello ${firstName},</p>

      <p>
        Thank you for applying to become a member of Malmin Ilmailukerho ry. We will review your application as soon as possible and get back to you.
        In the meantime, you can confirm your email address by clicking the link below:
      </p>

      <div style="text-align: center; margin: 24px 0;">
        ${emailButton(href, 'Confirm Email Address')}
      </div>

      <p>
        If the button above doesn't work, please copy and paste the following link into your browser:
      </p>
      <p style="word-break: break-all; color: #333333;"><a href="${href}">${href}</a></p>`,

    'If you didn’t request this email, you can safely ignore it.',
  )

const registerEmailBodyHtmlFi = ({ firstName, href }: RegisterVars): string =>
  emailTemplate(
    'Hakemuksen vahvistus',
    `
      <p>Hei ${firstName},</p>

      <p>
        kiitos hakemuksestasi Malmin Ilmailukerho ry:n jäseneksi. Käsittelemme hakemuksesi pian ja olemme sinuun yhteydessä.
        Sillä välin, voit vahvistaa sähköpostiosoitteesi klikkaamalla alla olevaa linkkiä:
      </p>

      <div style="text-align: center; margin: 24px 0;">
        ${emailButton(href, 'Vahvista sähköpostiosoite')}
      </div>

      <p>
        Vaihtoehtoisesti voit myös kopioida alla olevan linkin suoraan webbiselaimeesi:
      </p>
      <p style="word-break: break-all;"><a href="${href}">${href}</a></p>`,
    'Jos et pyytänyt tätä sähköpostia, voit huoletta sivuuttaa sen.',
  )
