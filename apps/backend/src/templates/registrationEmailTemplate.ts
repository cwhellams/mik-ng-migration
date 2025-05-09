import 'dotenv/config'
import { marked } from 'marked'

const mik_logo_url =
  process.env.MIK_LOGO_URL ?? 'https://mik-intranet-846xw.ondigitalocean.app/mik-logo-blue.png'

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

const registerEmailBodyHtmlEn = ({ firstName, href }: RegisterVars): string => `
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; padding: 40px;">
    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); padding: 40px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${mik_logo_url}" alt="MIK Logo" style="max-width: 120px;" />
      </div>


      <h2 style="text-align: center; color: #003366;">Registration Confirmation</h2>

      <p style="color: #333333;">Hello ${firstName},</p>

      <p style="color: #333333;">
        Thank you for applying to become a member of Malmin Ilmailukerho ry. We will review your application as soon as possible and get back to you.
        In the meantime, you can confirm your email address by clicking the link below:
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
        ">Confirm Email Address</a>
      </div>

      <p style="color: #333333;">
        If the button above doesn't work, please copy and paste the following link into your browser:
      </p>
      <p style="word-break: break-all; color: #333333;"><a href="${href}">${href}</a></p>

      <hr style="margin-top: 32px; border: none; border-top: 1px solid #dddddd;" />

      <p style="font-size: 0.9em; color: #666666;">
        If you didn’t request this email, you can safely ignore it.
      </p>
    </div>
  </div>
`

const registerEmailBodyHtmlFi = ({ firstName, href }: RegisterVars): string => `
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; padding: 40px;">
    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); padding: 40px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${mik_logo_url}" alt="MIK Logo" style="max-width: 120px;" />
      </div>


      <h2 style="text-align: center; color: #003366;">Registration Confirmation</h2>

      <p style="color: #333333;">Hei ${firstName},</p>

      <p style="color: #333333;">
        kiitos hakemuksestasi Malmin Ilmailukerho ry:n jäseneksi. Käsittelemme hakemuksesi pian ja olemme sinuun yhteydessä.
        Sillä välin, voit vahvistaa sähköpostiosoitteesi klikkaamalla alla olevaa linkkiä:
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
        ">Vahvista sähköpostiosoite</a>
      </div>

      <p style="color: #333333;">
        Vaihtoehtoisesti voit myös kopioida alla olevan linkin suoraan webbiselaimeesi:
      </p>
      <p style="word-break: break-all; color: #333333;"><a href="${href}">${href}</a></p>

      <hr style="margin-top: 32px; border: none; border-top: 1px solid #dddddd;" />

      <p style="font-size: 0.9em; color: #666666;">
        If you didn’t request this email, you can safely ignore it.
      </p>
    </div>
  </div>
`
