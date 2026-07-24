interface PricedArticle {
  code?: string
  markup_type?: string
  markup_value?: number
  price_per_unit?: number
}

/**
 * SimplBooks articles carry the "real" price in different fields depending on
 * markup_type: 'fixed' articles store it in markup_value (price_per_unit is 0),
 * 'none' articles store it in price_per_unit, and 'percent' articles compute it
 * as a markup on top of price_per_unit. Reading the wrong field for a given
 * markup_type silently produces a €0 price instead of an error, so this never
 * falls back to 0 — a missing/misconfigured field throws instead.
 */
export function resolveArticlePrice(article: PricedArticle): number {
  switch (article.markup_type) {
    case 'fixed':
      if (article.markup_value === undefined) {
        throw new Error(`Article '${article.code}' has markup_type 'fixed' but no markup_value set`)
      }
      return article.markup_value
    case 'none':
      if (article.price_per_unit === undefined) {
        throw new Error(
          `Article '${article.code}' has markup_type 'none' but no price_per_unit set`,
        )
      }
      return article.price_per_unit
    case 'percent':
      if (article.price_per_unit === undefined || article.markup_value === undefined) {
        throw new Error(
          `Article '${article.code}' has markup_type 'percent' but is missing price_per_unit or markup_value`,
        )
      }
      return article.price_per_unit * (1 + article.markup_value / 100)
    default:
      if (article.price_per_unit !== undefined) {
        return article.price_per_unit
      }
      if (article.markup_value !== undefined) {
        return article.markup_value
      }
      throw new Error(
        `Article '${article.code}' has no markup_type and neither price_per_unit nor markup_value is set`,
      )
  }
}
