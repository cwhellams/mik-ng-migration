import 'dotenv/config'
import { marked } from 'marked'

export type WelcomeVars = {
  firstName: string
}

const mik_logo_url =
  process.env.MIK_LOGO_URL ?? 'https://mik-intranet-846xw.ondigitalocean.app/mik-logo-blue.png'

const mik_rules_url =
  process.env.MIK_RULES_URL ?? 'https://www.mik.fi/malmin-ilmailukerho-ry/saannot/'

export const membershipApprovedEmailSubject = (lang: string | undefined): string =>
  lang == 'fi' ? 'Tervetuloa MIKiin' : 'MIK - your mebership is approved'

export const membershipApprovedEmailBodyHtml = (
  lang: string | undefined,
  vars: WelcomeVars,
): string =>
  lang == 'fi' ? membershipApprovedEmailBodyHtmlFi(vars) : membershipApprovedEmailBodyHtmlEn(vars)

export const membershipApprovedEmailPlainText = (
  lang: string | undefined,
  vars: WelcomeVars,
): string =>
  marked.parse(
    lang == 'fi'
      ? membershipApprovedEmailPlainTextFi(vars)
      : membershipApprovedEmailPlainTextEn(vars),
    {
      async: false,
    },
  )

const membershipApprovedEmailBodyHtmlFi = ({ firstName }: WelcomeVars): string => `
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; padding: 40px;">
    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); padding: 40px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${mik_logo_url}" alt="MIK Logo" style="max-width: 120px;" />
      </div>

      <h2 style="text-align: center; color: #003366;">Membership Approved</h2>

      <p style="color: #333333;">Hello,</p>

      <p style="color: #333333;">
        Hi ${firstName} , Welcome to MIK , your membership has been approved.
      </p>

      <p style="color: #333333;">
        Please familiarize yourself with the club <a href="${mik_rules_url}">rules</a>. If you have any questions feel free to contact a member of the committee.
      </p>

      <p style="color: #333333;">Next steps:</p>
      <ul>
        <li>Pay the membership fee (an automated invoice will be sent to you)</li>
        <li>Contact an instructor or aircraft captain to arrange a check ride</li>
        <li>Join the WhatsApp groups</li>
      </ul>


    </div>
  </div>
`

const membershipApprovedEmailBodyHtmlEn = ({ firstName }: WelcomeVars): string => `
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; padding: 40px;">
    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); padding: 40px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <img src="${mik_logo_url}" alt="MIK Logo" style="max-width: 120px;" />
      </div>

      <h2 style="text-align: center; color: #003366;">Membership Approved</h2>

      <p style="color: #333333;">Hello,</p>

      <p style="color: #333333;">
        Hi ${firstName} , Welcome to MIK , your membership has been approved.
      </p>

      <p style="color: #333333;">
        Please familiarize yourself with the club <a href="${mik_rules_url}">rules</a>. If you have any questions feel free to contact a member of the committee.
      </p>

      <p style="color: #333333;">Next steps:</p>
      <ul>
        <li>Pay the membership fee (an automated invoice will be sent to you)</li>
        <li>Contact an instructor or aircraft captain to arrange a check ride</li>
        <li>Join the WhatsApp groups</li>
      </ul>


    </div>
  </div>
`

const membershipApprovedEmailPlainTextEn = ({ firstName }: WelcomeVars): string =>
  `
Hi ${firstName}, Welcome to MIK , your membership has been approved.

Please familiarize yourself with the club rules ${mik_rules_url}.

If you have any questions feel free to contact a member of the committee.

  - Pay the membership fee (an automated invoice will be sent to you)
  - Contact an instructor or aircraft captain to arrange a check ride
  - Join the WhatsApp groups
`.trim()

const membershipApprovedEmailPlainTextFi = ({ firstName }: WelcomeVars): string =>
  `
 Hi ${firstName}, Welcome to MIK , your membership has been approved.

Please familiarize yourself with the club rules ${mik_rules_url}.

If you have any questions feel free to contact a member of the committee.

  - Pay the membership fee (an automated invoice will be sent to you)
  - Contact an instructor or aircraft captain to arrange a check ride
  - Join the WhatsApp groups
`.trim()
