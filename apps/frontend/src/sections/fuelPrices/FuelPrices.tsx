import { FuelPrices as FuelPricesResponse } from '@mik/contracts/fuel-prices'
import { Box } from '@mui/material'
import { LocalFuelPrices } from '@mik/ui/components/LocalFuelPrices'
import { FuelPriceNotice } from '@mik/ui/components/FuelPriceNotice'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import useApi from '@mik/ui/hooks/useApi'
import { useTranslation } from 'react-i18next'
import { RecentFuelings } from './RecentFuelings'

/**
 * What fuel costs and who has been fuelling — read-only.
 *
 * Editing the notice and the local prices moved to the admin app in #1233
 * (`FuelPricesAdmin`): setting a price is back-office work. `RecentFuelings`
 * stayed, because a log of who fuelled what is for the members who did it.
 */
const FuelPrices = () => {
  const { t } = useTranslation()

  const { data, error, isLoading } = useApi<FuelPricesResponse>({ url: 'v1/fuel-prices' })

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Title label={t('fuelPrices.title')} />

      <FuelPriceNotice prices={data} />

      <LocalFuelPrices canEdit={false} />

      <Box sx={{ mt: 4 }}>
        <RecentFuelings />
      </Box>
    </RemoteContent>
  )
}

export default FuelPrices
