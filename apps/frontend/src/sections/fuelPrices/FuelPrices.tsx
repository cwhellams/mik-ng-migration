import { FuelPrices as FuelPricesResponse } from '@mik/contracts/fuel-prices'
import { LocalFuelPrices } from '@mik/ui/components/LocalFuelPrices'
import { FuelPriceNotice } from '@mik/ui/components/FuelPriceNotice'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import useApi from '@mik/ui/hooks/useApi'
import { useTranslation } from 'react-i18next'

/**
 * What fuel costs — read-only.
 *
 * Editing the notice and the local prices moved to the admin app in #1233
 * (`FuelPricesAdmin`): setting a price is back-office work. `RecentFuelings`
 * did not survive the Liquid Management System (#1119): it read the old
 * per-claim `/v1/fuel-report`, which the new `liquid.record`-backed reporting
 * replaces — see `FuelPriceComparison` (moved to the admin app alongside
 * `FuelPricesAdmin`, since it answers a treasurer's question) and each
 * member's own history at `/liquid`.
 */
const FuelPrices = () => {
  const { t } = useTranslation()

  const { data, error, isLoading } = useApi<FuelPricesResponse>({ url: 'v1/fuel-prices' })

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Title label={t('fuelPrices.title')} />

      <FuelPriceNotice prices={data} />

      <LocalFuelPrices canEdit={false} />
    </RemoteContent>
  )
}

export default FuelPrices
