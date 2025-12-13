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
    .parse(template(variables), {
      async: false,
    })

  return emailTemplate(body, footer)
}

const emailTemplate = (body: string, footer?: string) => `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; padding: 40px;">
    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); padding: 40px;">
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
  </div>`

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

  tokenizer(src: string): ButtonToken | undefined {
    const rule = /^\[button:([^\]]+)\]\(([^)]+)\)/
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
