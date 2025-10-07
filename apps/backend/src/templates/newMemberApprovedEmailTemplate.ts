import 'dotenv/config'
import { marked } from 'marked'
import { emailTemplate } from './emailTemplate.ts'

export type WelcomeVars = {
  firstName: string
}

const mik_rules_url =
  process.env.MIK_RULES_URL ?? 'https://www.mik.fi/malmin-ilmailukerho-ry/saannot/'

export const membershipApprovedEmailSubject = (lang: string | undefined): string =>
  lang == 'fi' ? 'Tervetuloa Malmin ilmailukerhoon' : 'MIK - your membership is approved'

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

const membershipApprovedEmailBodyHtmlFi = ({ firstName }: WelcomeVars): string =>
  emailTemplate(
    'Jäsenyytesi on hyväksytty',
    `
      <p>
        Hei ${firstName}, tervetuloa MIK:iin, jäsenyytesi on hyväksytty.
      </p>

      <p>
        Tutustu klubin <a href="${mik_rules_url}">sääntöihin</a>. Jos sinulla on kysyttävää, ota rohkeasti yhteyttä hallituksen jäseneen.
      </p>

      <p>Seuraavat askeleet:</p>
      <ul>
        <li>Maksa jäsenmaksu (automaattinen lasku lähetetään sinulle)</li>
        <li>Ota yhteyttä lennonopettajiin järjestääksesi kerhotarkkarin jotta saat käyttöoikeuden kerhon lentokoneisiin ja varauskirjaan</li>
        <li>Liity WhatsApp-ryhmiin</li>
      </ul>
`,
  )

const membershipApprovedEmailBodyHtmlEn = ({ firstName }: WelcomeVars): string =>
  emailTemplate(
    'Membership Approved',
    `
      <p>
        Hi ${firstName} , Welcome to MIK, your membership has been approved.
      </p>

      <p>
        Please familiarize yourself with the club <a href="${mik_rules_url}">rules</a>. If you have any questions feel free to contact a member of the committee.
      </p>

      <p>Next steps:</p>
      <ul>
        <li>Pay the membership fee (an automated invoice will be sent to you)</li>
        <li>Contact an instructor or aircraft captain to arrange a check ride</li>
        <li>Join the WhatsApp groups</li>
      </ul>
`,
  )

const membershipApprovedEmailPlainTextFi = ({ firstName }: WelcomeVars): string =>
  `
 Hei ${firstName}, Tervetuloa MIK:iin, jäsenyytesi on hyväksytty.

Tutustu klubin sääntöihin ${mik_rules_url}.

Jos sinulla on kysyttävää, ota rohkeasti yhteyttä hallituksen jäseneen.

  - Maksa jäsenmaksu (automaattinen lasku lähetetään sinulle)
  - Ota yhteyttä lennonopettajiin järjestääksesi kerhotarkkarin jotta saat käyttöoikeuden kerhon lentokoneisiin ja varauskirjaan
  - Liity WhatsApp-ryhmiin
`.trim()

const membershipApprovedEmailPlainTextEn = ({ firstName }: WelcomeVars): string =>
  `
Hi ${firstName}, Welcome to MIK, your membership has been approved.

Please familiarize yourself with the club rules ${mik_rules_url}.

If you have any questions feel free to contact a member of the committee.

  - Pay the membership fee (an automated invoice will be sent to you)
  - Contact an instructor to arrange a check ride and get access to club aircrafts and booking system
  - Join the WhatsApp groups
`.trim()
