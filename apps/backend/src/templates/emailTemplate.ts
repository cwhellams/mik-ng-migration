import { readFileSync } from 'fs'
import { marked, type TokenizerExtension, type RendererExtension, type Tokens } from 'marked'
import Handlebars from 'handlebars'

const mik_logo_url =
  process.env.MIK_LOGO_URL ?? 'https://walrus-app-sa62h.ondigitalocean.app/mik-logo-blue.png'

// Generate MIK email template. The body is loaded from markdown file which can
// contain handlebars template variables.
export const markdownEmailTemplate = (
  markdownFile: string,
  variables: Record<string, unknown>,
  footer?: string,
): string => {
  const markdown = readFileSync(`src/templates/${markdownFile}`, 'utf-8')

  const template = Handlebars.compile(markdown)
  const body = marked
    .use({
      renderer: {
        heading: headingRenderer,
      },
      extensions: [buttonExtension],
    })
    .parse(template(escapeMarkdownVariables(variables, rawHtmlVariables(markdown))), {
      async: false,
    })

  return emailTemplate(body, footer)
}

// A variable the body inserts with a Handlebars triple-stash. That is the
// template's own declaration that the value is HTML we built ourselves —
// `itemsTableHtml`, `barcodeImageHtml`, `qrCodeImageHtml` — rather than text
// from a member, and it is the one thing `escapeMarkdownVariables` below must
// leave alone. Read from the markdown rather than kept as a hand-maintained
// list, so a new raw variable cannot be forgotten.
const rawHtmlVariables = (markdown: string): Set<string> =>
  new Set(Array.from(markdown.matchAll(/\{\{\{\s*([\w.]+)\s*\}\}\}/g), (m) => m[1]))

// Handlebars only HTML-escapes template output, so user-controlled values
// (e.g. a member's display name) can still contain literal markdown link
// syntax like `[button:Click me](http://evil.example)`. Escaping `[` and `]`
// stops that text from being parsed as a markdown link or button once the
// substituted string reaches `marked` below.
//
// Pre-rendered HTML is exempt: it is already escaped, `marked` passes an HTML
// block through verbatim, and so the backslashes would be printed rather than
// consumed. A product named `MIK cap [Navy]` inside `itemsTableHtml` reached
// the member as `MIK cap \[Navy\]` until this exemption existed.
const escapeMarkdownVariables = (
  variables: Record<string, unknown>,
  rawHtmlKeys: Set<string>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(variables).map(([key, value]) => [
      key,
      typeof value === 'string' && !rawHtmlKeys.has(key) ? value.replace(/[[\]]/g, '\\$&') : value,
    ]),
  )

const emailTemplate = (body: string, footer?: string) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Malmin Ilmailukerho ry</title>
      <style>
        body {
          margin: 0;
          padding: 0;
        }
        .email-card table {
          width: 100%;
          border-collapse: collapse;
        }
        .email-card th,
        .email-card td {
          word-break: break-word;
        }
        .items-table-mobile {
          display: none;
        }
        @media only screen and (max-width: 600px) {
          .email-wrapper {
            padding: 16px !important;
          }
          .email-card {
            padding: 20px !important;
          }
          .email-card h1,
          .email-card h2,
          .email-card h3 {
            font-size: 1.15em !important;
          }
        }
        @media only screen and (max-width: 480px) {
          .items-table-desktop {
            display: none !important;
          }
          .items-table-mobile {
            display: block !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="email-wrapper" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; padding: 40px;">
      <div class="email-card" style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); padding: 40px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="${mik_logo_url}" alt="MIK Logo" style="max-width: 120px;" />
        </div>

        <div style="color: #333333">
          ${body}
        </div>

        <hr style="margin-top: 32px; border: none; border-top: 1px solid #dddddd;" />
          ${footer ? `<p style="font-size: 0.9em; color: #666666;">${footer}</p>` : ''}
          <p style="font-size: 0.9em; color: #666666;">Malmin Ilmailukerho ry</p>
      </div>
      </div>
    </body>
    </html>`

interface ButtonToken extends Tokens.Generic {
  type: 'button'
  text: string
  href: string
}

// Create buttons with similar syntax as markdown links.
// Example:
// [button:Open Google](https://google.com)
const buttonExtension: TokenizerExtension & RendererExtension = {
  name: 'button',
  level: 'block',

  start(src: string): number | void {
    return src.match(/\[button:/)?.index
  },

  // `(?<!\\)` on the closing bracket is what makes `escapeMarkdownVariables`'
  // backslashes bite here. They do not on their own: `marked` consumes a
  // leading `\[` as an inline escape and then restarts block tokenizing on the
  // remainder, so this extension was handed a clean `[button:…` and built a
  // real button out of a member's own text — with the member's own href on it.
  // The closing `\]` survives that consumption, so refusing an escaped one
  // rejects exactly the substituted values and leaves a template's own buttons
  // (which carry no backslashes) alone.
  tokenizer(src: string): ButtonToken | undefined {
    const rule = /^\[button:([^\]]+)(?<!\\)\]\(([^)]+)\)/
    const match = rule.exec(src)
    if (!match) return

    return {
      type: 'button',
      raw: match[0],
      text: match[1],
      href: match[2],
    }
  },

  renderer(token: Tokens.Generic): string {
    // all variables are already sanitized by handlebar template
    const { href, text } = token as ButtonToken
    return `
    <div style="text-align: center; margin: 24px 0;">
      <a href="${href}" style="
        background-color: #003366;
        color: #ffffff;
        padding: 12px 24px;
        text-decoration: none;
        border-radius: 6px;
        display: inline-block;
        font-weight: bold;
      ">${text}</a>
    </div>
    `
  },
}

// add styling to headings
const headingRenderer = (token: Tokens.Heading): string =>
  `<h${token.depth} style="text-align: center; color: #003366;">${token.text}</h${token.depth}>`
