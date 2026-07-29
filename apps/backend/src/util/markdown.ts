import { Marked } from 'marked'
import type { Token, Tokens } from 'marked'

import { escapeHtml, sanitizeUrl } from './sanitizers.ts'

const validateOnlyUrl = (href: string): string => {
  return sanitizeUrl(href) ? href : ''
}

const markdownParser = new Marked()
markdownParser.use({
  gfm: true,
  breaks: true,
  walkTokens(token) {
    if (token.type === 'link' || token.type === 'image') {
      token.href = validateOnlyUrl(token.href)
    }

    if (token.type === 'html' || token.type === 'tag') {
      token.text = escapeHtml(token.text)
    }
  },
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text)
    },
    link(this: { parser: { parseInline: (tokens: Token[]) => string } }, token: Tokens.Link) {
      const safeHref = token.href ? escapeHtml(token.href) : ''
      const text = this.parser.parseInline(token.tokens)
      if (!safeHref) {
        return text
      }

      const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
      return `<a href="${safeHref}"${title} target="_blank" rel="noopener noreferrer">${text}</a>`
    },
  },
})

export const renderMarkdown = (markdown: string): string => {
  const rendered = markdownParser.parse(markdown, { async: false })
  return typeof rendered === 'string' ? rendered : ''
}
