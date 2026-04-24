import { Router } from 'express'
import type { Request, Response } from 'express'
import { Marked } from 'marked'
import type { Token, Tokens } from 'marked'

import { validateUser } from '../../middleware/authMiddleware.ts'
import { MIKPermissions } from '../members/models.ts'
import { type FuelPrices, FuelPricesUpdateSchema } from './models.ts'
import { getFuelPricesMarkdown, setFuelPricesMarkdown } from '../../db/fuel-prices-queries.ts'
import { escapeHtml, sanitizeUrl } from '../../util/sanitizers.ts'

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

const renderMarkdown = (markdown: string): string => {
  const rendered = markdownParser.parse(markdown, { async: false })
  return typeof rendered === 'string' ? rendered : ''
}

export const router = Router()

router.get(
  '/',
  validateUser(MIKPermissions.FUEL_PRICES_USER, MIKPermissions.FUEL_PRICES_ADMIN),
  async (_req: Request, res: Response<FuelPrices>) => {
    const markdown = await getFuelPricesMarkdown()
    res.status(200).json({
      markdown,
      renderedHtml: renderMarkdown(markdown),
    })
  },
)

router.patch(
  '/',
  validateUser(MIKPermissions.FUEL_PRICES_ADMIN),
  async (req: Request, res: Response<FuelPrices>) => {
    const payload = FuelPricesUpdateSchema.parse(req.body)
    await setFuelPricesMarkdown(payload.markdown, req.user!)

    res.status(200).json({
      markdown: payload.markdown,
      renderedHtml: renderMarkdown(payload.markdown),
    })
  },
)
