import 'dotenv/config'
import { marked } from 'marked'
import { escapeHtml, sanitizeUrl } from '@mik-ng/shared'
import { emailButton, emailTemplate } from './emailTemplate.ts'

export type LoginVars = {
  href: string
  code: number
}

export const loginEmailTitle = (lang: string | undefined): string =>
  lang == 'fi' ? 'Kirjaudu MIK sivustolle' : 'Confirm your login to MIK Intranet'

export const loginEmailBodyHtml = (lang: string | undefined, vars: LoginVars): string =>
  lang == 'fi' ? loginEmailBodyHtmlFi(vars) : loginEmailBodyHtmlEn(vars)

export const loginEmailPlainText = (lang: string | undefined, vars: LoginVars): string =>
  marked.parse(lang == 'fi' ? loginEmailPlainTextFi(vars) : loginEmailPlainTextEn(vars), {
    async: false,
  })

const loginEmailBodyHtmlFi = ({ href, code }: LoginVars): string =>
  emailTemplate(
    'Kirjautumisen vahvistus',
    `
      <p>Hei,</p>

      <p>
        Olet kirjautumassa <strong>MIK-verkkosivustolle</strong>. Vahvista kirjautumisesi napsauttamalla alla olevaa painiketta:
      </p>

      <div style="text-align: center; margin: 24px 0;">
        ${emailButton(href, 'Vahvista kirjautuminen')}
      </div>

      <p>
        Jos painike ei toimi, kopioi ja liitä seuraava linkki selaimeesi:
      </p>
      <p style="word-break: break-all"><a href="${sanitizeUrl(href)}">${escapeHtml(href)}</a></p>

      <p>Vahvistuskoodisi on:</p>
      <p style="font-size: 1.25em; font-weight: bold; color: #003366;">${code}</p>
      `,
    'Jos et pyytänyt tätä sähköpostia, voit huoletta sivuuttaa sen.',
  )

const loginEmailBodyHtmlEn = ({ href, code }: LoginVars): string =>
  emailTemplate(
    'Login Confirmation',
    `

      <p>Hello,</p>

      <p>
        You are attempting to log in to the <strong>MIK website</strong>. Please confirm your login by clicking the button below:
      </p>

      <div style="text-align: center; margin: 24px 0;">
        ${emailButton(href, 'Confirm Login')}
      </div>

      <p>
        If the button above doesn't work, please copy and paste the following link into your browser:
      </p>
      <p style="word-break: break-all;"><a href="${sanitizeUrl(href)}">${escapeHtml(href)}</a></p>

      <p>Your verification code is:</p>
      <p style="font-size: 1.25em; font-weight: bold; color: #003366;">${code}</p>

      `,
    'If you didn’t request this email, you can safely ignore it.',
  )

const loginEmailPlainTextEn = ({ href, code }: LoginVars): string => `
MIK Login Confirmation

You are logging in to the MIK website.

Please confirm your login by clicking the link below:
${href}

If the link doesn't work, copy and paste it into your browser.

Your verification code is: ${code}

If you didn’t request this login, you can safely ignore this message.
`

const loginEmailPlainTextFi = ({ href, code }: LoginVars): string =>
  `
Hei,

Olet kirjautumassa MIK-verkkosivustolle. Vahvista kirjautumisesi napsauttamalla alla olevaa linkkiä:

${href}

Jos linkki ei toimi, kopioi ja liitä se selaimeesi.

Vahvistuskoodisi on: ${code}

Jos et pyytänyt tätä sähköpostia, voit huoletta sivuuttaa sen.
`.trim()
