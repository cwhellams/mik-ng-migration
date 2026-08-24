import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  useMediaQuery,
  useTheme,
  InputAdornment,
  Stack,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { mutate } from 'swr'
import useApi from '../../../hooks/useApi'
import { EditDialogTitle } from '../../../components/EditDialogTitle'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { SaveButton } from '../../../components/SaveButton'
import { Problem } from '@mik/contracts/problem'
import { SnackAlert } from '@mik/ui/components/SnackAlert'
import dayjs, { Dayjs } from 'dayjs'
import { useMe } from '../../../hooks/useMe'
import {
  AircraftPricing,
  CreateAircraftPricing,
  UpdateAircraftPricing,
} from '@mik/contracts/aircraft-pricing'

export type PricingEditMode = 'new' | 'edit'

interface EditPricingModalProps {
  onClose: () => void
  mode: PricingEditMode | undefined
  registration: string
  pricing?: AircraftPricing
}

export const EditPricingModal = ({
  onClose,
  mode,
  registration,
  pricing,
}: EditPricingModalProps) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  const { me } = useMe()

  const isNew = mode === 'new'

  const api = useApi<AircraftPricing>({
    url: isNew
      ? 'v1/aircraft-pricing'
      : `v1/aircraft-pricing/${pricing?.registration}/${pricing?.valid_from}`,
    skipFetch: true,
  })

  const [validFrom, setValidFrom] = useState<Dayjs | null>(
    pricing ? dayjs(pricing.valid_from) : dayjs(),
  )
  const [validTo, setValidTo] = useState<Dayjs | null>(
    pricing?.valid_to ? dayjs(pricing.valid_to) : null,
  )
  const [pricePerHour, setPricePerHour] = useState<string>(
    pricing ? (pricing.price_per_min * 60).toFixed(2) : '',
  )
  const [notes, setNotes] = useState<string>(pricing?.notes || '')

  const [problem, setProblem] = useState<Problem | undefined>()

  useEffect(() => {
    setProblem(undefined)
    if (pricing) {
      setValidFrom(dayjs(pricing.valid_from))
      setValidTo(pricing.valid_to ? dayjs(pricing.valid_to) : null)
      setPricePerHour((pricing.price_per_min * 60).toFixed(2))
      setNotes(pricing.notes || '')
    } else {
      setValidFrom(dayjs())
      setValidTo(null)
      setPricePerHour('')
      setNotes('')
    }
  }, [pricing, mode])

  const handleSave = async () => {
    if (!validFrom || !pricePerHour) {
      setProblem({
        type: 'validation-error',
        title: 'Validation Error',
        detail: 'Valid from date and price are required',
        status: 400,
      })
      return
    }

    const pricePerMin = parseFloat(pricePerHour) / 60

    if (isNaN(pricePerMin) || pricePerMin <= 0) {
      setProblem({
        type: 'validation-error',
        title: 'Validation Error',
        detail: 'Price must be a positive number',
        status: 400,
      })
      return
    }

    setProblem(undefined)

    const method = isNew ? 'POST' : 'PATCH'

    if (isNew) {
      const createData: CreateAircraftPricing = {
        registration,
        valid_from: validFrom.format('YYYY-MM-DD'),
        valid_to: validTo ? validTo.format('YYYY-MM-DD') : undefined,
        price_per_min: pricePerMin,
        created_by: me?.memberId,
        notes: notes.trim() || undefined,
      }

      const { error } = await api.mutation.trigger(method, createData)
      if (error) {
        setProblem(error)
        return
      }
    } else {
      const updateData: UpdateAircraftPricing = {
        valid_to: validTo ? validTo.format('YYYY-MM-DD') : null,
        price_per_min: pricePerMin,
        updated_by: me?.memberId,
        notes: notes.trim() || undefined,
      }

      const { error } = await api.mutation.trigger(method, updateData)
      if (error) {
        setProblem(error)
        return
      }
    }

    await mutate((key) => typeof key === 'string' && key.includes('aircraft-pricing'))
    onClose()
  }

  if (!mode) return null

  return (
    <Dialog open={!!mode} onClose={onClose} maxWidth='sm' fullWidth fullScreen={isXs}>
      <EditDialogTitle
        title={
          isNew
            ? t('aircraft.pricing.add', 'Add Pricing')
            : t('aircraft.pricing.edit', 'Edit Pricing')
        }
        onClose={onClose}
      />
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <SnackAlert problem={problem} />

          <Typography
            variant='body2'
            sx={{
              color: 'text.secondary',
            }}
          >
            {t('aircraft.pricing.aircraft', 'Aircraft')}: {registration}
          </Typography>

          <DatePicker
            label={t('aircraft.pricing.from', 'From')}
            value={validFrom}
            onChange={(newValue) => setValidFrom(newValue)}
            disabled={!isNew}
            slotProps={{
              textField: {
                required: true,
                fullWidth: true,
                helperText: isNew
                  ? undefined
                  : t('aircraft.pricing.fromDisabled', 'From date cannot be changed'),
              },
            }}
          />

          <DatePicker
            label={t('aircraft.pricing.to', 'To')}
            value={validTo}
            onChange={(newValue) => setValidTo(newValue)}
            minDate={validFrom || undefined}
            slotProps={{
              textField: {
                fullWidth: true,
                helperText: t('aircraft.pricing.toHelp', 'Leave empty for open-ended pricing'),
              },
            }}
          />

          <TextField
            label={t('aircraft.pricing.hourlyRate', 'Hourly Rate')}
            type='number'
            value={pricePerHour}
            onChange={(e) => setPricePerHour(e.target.value)}
            required
            fullWidth
            helperText={
              pricePerHour
                ? `${t('aircraft.pricing.perMinute', 'Per minute')}: €${(parseFloat(pricePerHour) / 60).toFixed(4)}`
                : undefined
            }
            slotProps={{
              input: {
                startAdornment: <InputAdornment position='start'>€</InputAdornment>,
                endAdornment: <InputAdornment position='end'>/h</InputAdornment>,
              },

              htmlInput: {
                step: '0.01',
                min: '0',
              },
            }}
          />

          <TextField
            label={t('aircraft.pricing.notes', 'Notes')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            multiline
            rows={3}
            helperText={t('aircraft.pricing.notesHelp', 'Optional notes about this pricing period')}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('general.cancel', 'Cancel')}</Button>
        <SaveButton onClick={handleSave} disabled={api.mutation.isMutating} />
      </DialogActions>
    </Dialog>
  )
}
