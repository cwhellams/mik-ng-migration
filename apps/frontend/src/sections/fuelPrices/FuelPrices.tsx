import { MIKPermissions } from '@mik/contracts/members'
import { FuelPrices as FuelPricesResponse } from '@mik/contracts/fuel-prices'
import { Alert, Box, Button, Paper, Stack, TextField } from '@mui/material'
import { useEffect, useState } from 'react'
import { EditButton } from '../../components/EditButton'
import { MarkdownContent } from '../../components/MarkdownContent'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'
import useApi from '../../hooks/useApi'
import { useRoles } from '../../hooks/useRoles'
import { useThemeMode } from '../../theme/ThemeContext'
import { useTranslation } from 'react-i18next'
import { RecentFuelings } from './RecentFuelings'
import { LocalFuelPrices } from './LocalFuelPrices'

const FuelPrices = () => {
  const { t } = useTranslation()
  const { sudo } = useThemeMode()
  const { hasAccess } = useRoles()

  const canEdit = sudo && hasAccess(MIKPermissions.FUEL_PRICES_ADMIN)
  const [editMode, setEditMode] = useState(false)
  const [markdown, setMarkdown] = useState('')
  const [saveError, setSaveError] = useState<string>()

  const { data, error, isLoading, mutate } = useApi<FuelPricesResponse>({
    url: 'v1/fuel-prices',
  })

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
    const { error: updateError } = await updateMutation.trigger('PATCH', {
      markdown,
    })
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
        <Paper sx={{ p: 2 }}>
          {!data?.markdown && <Alert severity='info'>{t('fuelPrices.empty')}</Alert>}
          {!!data?.renderedHtml && <MarkdownContent html={data.renderedHtml} />}
        </Paper>
      )}

      <LocalFuelPrices canEdit={canEdit} />

      <Box sx={{ mt: 4 }}>
        <RecentFuelings />
      </Box>
    </RemoteContent>
  )
}

export default FuelPrices
