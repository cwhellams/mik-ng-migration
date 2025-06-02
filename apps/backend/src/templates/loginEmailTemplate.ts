import 'dotenv/config'
import { marked } from 'marked'

export type LoginVars = {
  href: string
  code: number
}

const mik_logo_url =
  process.env.MIK_LOGO_URL ?? 'https://walrus-app-sa62h.ondigitalocean.app/mik-logo-blue.png'

export const loginEmailTitle = (lang: string | undefined): string =>
  lang == 'fi' ? 'Kirjaudu MIK sivustolle' : 'Confirm your login to MIK Intranet'

export const loginEmailBodyHtml = (lang: string | undefined, vars: LoginVars): string =>
  lang == 'fi' ? loginEmailBodyHtmlFi(vars) : loginEmailBodyHtmlEn(vars)

export const loginEmailPlainText = (lang: string | undefined, vars: LoginVars): string =>
  marked.parse(lang == 'fi' ? loginEmailPlainTextFi(vars) : loginEmailPlainTextEn(vars), {
    async: false,
  })

const loginEmailBodyHtmlFi = ({ href, code }: LoginVars): string => `
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; padding: 40px;">
    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); padding: 40px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${mik_logo_url}" alt="MIK Logo" style="max-width: 120px;" />
      </div>

      <h2 style="text-align: center; color: #003366;">Kirjautumisen vahvistus</h2>

      <p style="color: #333333;">Hei,</p>

      <p style="color: #333333;">
        Olet kirjautumassa <strong>MIK-verkkosivustolle</strong>. Vahvista kirjautumisesi napsauttamalla alla olevaa painiketta:
      </p>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${href}" style="
          background-color: #003366;
          color: #ffffff;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 6px;
          display: inline-block;
          font-weight: bold;
        ">Vahvista kirjautuminen</a>
      </div>

      <p style="color: #333333;">
        Jos painike ei toimi, kopioi ja liitä seuraava linkki selaimeesi:
      </p>
      <p style="word-break: break-all; color: #333333;"><a href="${href}">${href}</a></p>

      <p style="color: #333333;">Vahvistuskoodisi on:</p>
      <p style="font-size: 1.25em; font-weight: bold; color: #003366;">${code}</p>

      <hr style="margin-top: 32px; border: none; border-top: 1px solid #dddddd;" />

      <p style="font-size: 0.9em; color: #666666;">
        Jos et pyytänyt tätä sähköpostia, voit huoletta sivuuttaa sen.
      </p>
    </div>
  </div>
`

const loginEmailBodyHtmlEn = ({ href, code }: LoginVars): string => `
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; padding: 40px;">
    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); padding: 40px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${mik_logo_url}" alt="MIK Logo" style="max-width: 120px;" />
      </div>

      <h2 style="text-align: center; color: #003366;">Login Confirmation</h2>

      <p style="color: #333333;">Hello,</p>

      <p style="color: #333333;">
        You are attempting to log in to the <strong>MIK website</strong>. Please confirm your login by clicking the button below:
      </p>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${href}" style="
          background-color: #003366;
          color: #ffffff;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 6px;
          display: inline-block;
          font-weight: bold;
        ">Confirm Login</a>
      </div>

      <p style="color: #333333;">
        If the button above doesn't work, please copy and paste the following link into your browser:
      </p>
      <p style="word-break: break-all; color: #333333;"><a href="${href}">${href}</a></p>

      <p style="color: #333333;">Your verification code is:</p>
      <p style="font-size: 1.25em; font-weight: bold; color: #003366;">${code}</p>

      <hr style="margin-top: 32px; border: none; border-top: 1px solid #dddddd;" />

      <p style="font-size: 0.9em; color: #666666;">
        If you didn’t request this email, you can safely ignore it.
      </p>
    </div>
  </div>
`

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
