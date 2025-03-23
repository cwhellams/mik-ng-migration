import { marked } from 'marked'

type LoginVars = {
  href: string
  code: number
}

export const loginEmailTitle = (lang: string): string =>
  lang == 'fi' ? 'Kirjaudu MIK sivustolle' : 'Your login to MIK'

export const loginEmailBody = (lang: string, vars: LoginVars): string =>
  marked.parse(lang == 'fi' ? loginEmailBodyFi(vars) : loginEmailBodyEn(vars), { async: false })

const loginEmailBodyFi = ({ href, code }: LoginVars): string => `
  Olet kirjautumassa MIK sivustolle. Jatka kirjautumista klikkaamalla linkkiä:

  [Vahvista kirjautuminen](${href})
    
  Vaihtoehtoisesti voit myös kopioida alla olevan linkin suoraan webbiselaimeesi:

  ${href}
    
  Kirjautumisen vahvistuskoodi ${code}.
  `

const loginEmailBodyEn = ({ href, code }: LoginVars): string => `
  You are logging in to MIK website. Click the link below to continue:

  [Confirm login](${href})
    
  Alternatively you can also copy and paste the link into your browser:

  ${href}

  Verification code ${code}.
  `

type RegisterVars = {
  firstName: string
  href: string
  code: number
}

export const registerEmailTitle = (lang: string): string =>
  lang == 'fi' ? 'Tervetuloa Malmin ilmailukerhoon' : 'Welcome to Malmin Ilmailukerho'

export const registerEmailBody = (lang: string, vars: RegisterVars): string =>
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
