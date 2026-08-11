import Handlebars from 'handlebars'
import { markdownEmailTemplate } from './emailTemplate.ts'
import {
  EMAIL_LANGUAGES,
  emailTemplates,
  type EmailLang,
  type EmailTemplateKey,
  type EmailTemplateVars,
} from './registry.ts'

export interface RenderedEmail {
  subject: string
  html: string
}

/**
 * Anything not `fi` or `sv` — including `undefined` and languages we don't
 * translate into — is English. Every template selection used to inline its own
 * version of this, and the ones that forgot ended up reading
 * `…-undefined.md` and throwing.
 */
export const normaliseEmailLang = (lang: string | undefined): EmailLang =>
  lang === 'fi' || lang === 'sv' ? lang : 'en'

// Subjects are plain text, not HTML: `noEscape` keeps an `&` in a claim title
// from arriving as `&amp;` in the recipient's inbox. Compiled subjects are
// cached because the same handful are rendered on every worker run.
const subjectCache = new Map<string, Handlebars.TemplateDelegate>()

const renderSubject = (template: string, vars: Record<string, unknown>): string => {
  let compiled = subjectCache.get(template)
  if (!compiled) {
    compiled = Handlebars.compile(template, { noEscape: true })
    subjectCache.set(template, compiled)
  }
  return compiled(vars)
}

/**
 * Render one of the emails declared in `./registry.ts`.
 *
 * @param key - Template key, which is also the `<key>-<lang>.md` file prefix.
 * @param lang - Recipient's language; anything untranslated falls back to English.
 * @param vars - Values for the markdown (and subject) placeholders. Typed per
 *   key by `EmailTemplateVars`, so a missing or misspelled var is a compile
 *   error rather than an empty gap in the sent mail.
 */
export function renderEmail<K extends EmailTemplateKey>(
  key: K,
  lang: string | undefined,
  vars: EmailTemplateVars[K],
): RenderedEmail {
  const spec = emailTemplates[key]

  // One language for the whole email. A template may exist only in English
  // even though the subject table covers all three, and picking the subject
  // and footer independently of the body would send a Finnish subject over an
  // English body the first time someone declares a `footer` alongside a
  // restricted `languages` list.
  const languages: readonly EmailLang[] = 'languages' in spec ? spec.languages : EMAIL_LANGUAGES
  const requested = normaliseEmailLang(lang)
  const language = languages.includes(requested) ? requested : 'en'

  // Registry constants last: they are the template's own values, and the
  // wrappers this replaced spread them the same way so no payload could
  // override e.g. the billing address.
  const allVars = {
    ...(vars as Record<string, unknown>),
    ...('defaults' in spec ? spec.defaults() : {}),
  }
  const footer = 'footer' in spec ? spec.footer[language] : undefined

  return {
    subject: renderSubject(spec.subject[language], allVars),
    html: markdownEmailTemplate(`${key}-${language}.md`, allVars, footer),
  }
}
