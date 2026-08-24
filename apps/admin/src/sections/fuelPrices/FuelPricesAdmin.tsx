import { FuelPrices as FuelPricesResponse } from '@mik/contracts/fuel-prices'
import { Alert, Button, Stack, TextField } from '@mui/material'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EditButton } from '@mik/ui/components/EditButton'
import { LocalFuelPrices } from '@mik/ui/components/LocalFuelPrices'
import { FuelPriceNotice } from '@mik/ui/components/FuelPriceNotice'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { Title } from '@mik/ui/components/Title'
import useApi from '@mik/ui/hooks/useApi'
import { useRoles } from '@mik/ui/hooks/useRoles'
import { MIKPermissions } from '@mik/contracts/members'

/**
 * Maintains the fuel-price notice members read, and the local per-fuel-type
 * prices.
 *
 * The member app's `/fly/fuel-prices` used to carry these controls behind a
 * sudo-gated `canEdit`; setting a price is back-office work, so it moved here
 * in #1233 and that page is now read-only. `RecentFuelings` did not come with
 * it — a log of who fuelled what is for the members who did the fuelling.
 */
const FuelPricesAdmin = () => {
  const { t } = useTranslation()
  // `LocalFuelPrices` is a shared component that has to be *told* whether it may
  // edit, exactly like `DocumentsPage`'s `canManage`. The route already requires
  // this permission; deriving it again here means the component is never handed
  // a capability its holder does not have, whatever mounts it.
  const { hasAccess } = useRoles()
  const canEdit = hasAccess(MIKPermissions.FUEL_PRICES_ADMIN)

  const [editMode, setEditMode] = useState(false)
  const [markdown, setMarkdown] = useState('')
  const [saveError, setSaveError] = useState<string>()

  const { data, error, isLoading, mutate } = useApi<FuelPricesResponse>({ url: 'v1/fuel-prices' })

  const { mutation: updateMutation } = useApi<FuelPricesResponse>({
    url: 'v1/fuel-prices',
    skipFetch: true,
  })

  useEffect(() => {
    if (!editMode) {
      setMarkdown(data?.markdown ?? '')
    }
  }, [data?.markdown, editMode])

  const save = async () => {
    setSaveError(undefined)
    const { error: updateError } = await updateMutation.trigger('PATCH', { markdown })
    if (updateError) {
      setSaveError(updateError.detail || t('general.savingError'))
      return
    }
    setEditMode(false)
    mutate()
  }

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Title label={t('fuelPrices.title')}>
        {canEdit && (
          <EditButton
            title={editMode ? t('fuelPrices.exitEditMode') : t('fuelPrices.enterEditMode')}
            onClick={() => {
              setSaveError(undefined)
              setEditMode((current) => !current)
            }}
            icon={editMode ? 'mdi:close' : 'mdi:pencil'}
          />
        )}
      </Title>

      {editMode ? (
        <Stack spacing={2}>
          {!!saveError && <Alert severity='error'>{saveError}</Alert>}
          <TextField
            multiline
            minRows={12}
            value={markdown}
            onChange={(event) => {
              setMarkdown(event.target.value)
              setSaveError(undefined)
            }}
            fullWidth
          />
          <Stack direction='row' spacing={1}>
            <Button variant='contained' onClick={save} disabled={updateMutation.isMutating}>
              {t('general.save')}
            </Button>
            <Button
              variant='outlined'
              onClick={() => {
                setMarkdown(data?.markdown ?? '')
                setSaveError(undefined)
                setEditMode(false)
              }}
            >
              {t('general.cancel')}
            </Button>
          </Stack>
        </Stack>
      ) : (
        <FuelPriceNotice prices={data} />
      )}

      <LocalFuelPrices canEdit={canEdit} />
    </RemoteContent>
  )
}

export default FuelPricesAdmin
