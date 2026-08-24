import { Alert, Paper } from '@mui/material'
import type { FuelPrices } from '@mik/contracts/fuel-prices'
import { useTranslation } from 'react-i18next'

import { MarkdownContent } from './MarkdownContent'

/**
 * The club's fuel-price notice, as members read it.
 *
 * Both fuel-price pages render this: `apps/frontend`'s read-only one and
 * `apps/admin`'s editor, which shows it whenever it is not in edit mode. It is
 * only a handful of lines, but it is the *whole* overlap between the two —
 * everything else about them differs, which is why they are two components
 * rather than one with a `canEdit` prop (see `DocumentsPage` for the case where
 * the opposite was true).
 */
export const FuelPriceNotice = ({ prices }: { prices: FuelPrices | undefined }) => {
  const { t } = useTranslation()

  return (
    <Paper sx={{ p: 2 }}>
      {!prices?.markdown && <Alert severity='info'>{t('fuelPrices.empty')}</Alert>}
      {!!prices?.renderedHtml && <MarkdownContent html={prices.renderedHtml} />}
    </Paper>
  )
}
