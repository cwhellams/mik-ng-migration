import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  useMediaQuery,
  useTheme,
  Stack,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { mutate } from 'swr'
import useApi from '../../../hooks/useApi'
import { EditDialogTitle } from '../../../components/EditDialogTitle'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { SaveButton } from '../../../components/SaveButton'
import { Problem } from '@mik/contracts/problem'
import { SnackAlert } from '../../../components/SnackAlert'
import dayjs, { Dayjs } from 'dayjs'
import { AircraftCard, AircraftCardAuditable } from '@mik/contracts/aircraft-cards'

export type CardEditMode = 'new' | 'edit'

interface EditCardModalProps {
  onClose: () => void
  mode: CardEditMode | undefined
  aircraftRegistration: string
  card?: AircraftCardAuditable
}

export const EditCardModal = ({
  onClose,
  mode,
  aircraftRegistration,
  card,
}: EditCardModalProps) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const isNew = mode === 'new'

  const api = useApi<AircraftCardAuditable>({
    url: isNew ? 'v1/aircraft-cards' : `v1/aircraft-cards/${card?.cardId}`,
    skipFetch: true,
  })

  const [name, setName] = useState<string>(card?.name || '')
  const [description, setDescription] = useState<string>(card?.description || '')
  const [validFrom, setValidFrom] = useState<Dayjs | null>(
    card?.validFrom ? dayjs(card.validFrom) : null,
  )
  const [validTo, setValidTo] = useState<Dayjs | null>(card?.validTo ? dayjs(card.validTo) : null)
  const [problem, setProblem] = useState<Problem | undefined>()

  useEffect(() => {
    setProblem(undefined)
    if (card) {
      setName(card.name)
      setDescription(card.description || '')
      setValidFrom(card.validFrom ? dayjs(card.validFrom) : null)
      setValidTo(card.validTo ? dayjs(card.validTo) : null)
    } else {
      setName('')
      setDescription('')
      setValidFrom(null)
      setValidTo(null)
    }
  }, [card, mode])

  const handleSave = async () => {
    if (!name.trim()) {
      setProblem({
        type: 'validation-error',
        title: 'Validation Error',
        detail: t('aircraft.cards.nameRequired', 'Card name is required'),
        status: 400,
      })
      return
    }

    if (validFrom && validTo && validTo.isBefore(validFrom)) {
      setProblem({
        type: 'validation-error',
        title: 'Validation Error',
        detail: t('aircraft.cards.dateRangeError', 'Valid from date must be before valid to date'),
        status: 400,
      })
      return
    }

    setProblem(undefined)

    const payload: AircraftCard = {
      aircraftRegistration,
      name: name.trim(),
      description: description.trim() || null,
      validFrom: validFrom ? validFrom.format('YYYY-MM-DD') : null,
      validTo: validTo ? validTo.format('YYYY-MM-DD') : null,
    }

    const method = isNew ? 'POST' : 'PATCH'
    const { error } = await api.mutation.trigger(method, payload)

    if (error) {
      setProblem(error)
      return
    }

    await mutate(
      (key: unknown) =>
        Array.isArray(key) && typeof key[0] === 'string' && key[0].includes('aircraft-cards'),
    )
    onClose()
  }

  if (!mode) return null

  return (
    <Dialog open={!!mode} onClose={onClose} maxWidth='sm' fullWidth fullScreen={isXs}>
      <EditDialogTitle
        title={isNew ? t('aircraft.cards.add', 'Add Card') : t('aircraft.cards.edit', 'Edit Card')}
        onClose={onClose}
      />
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <SnackAlert problem={problem} />

          <TextField
            label={t('aircraft.cards.name', 'Name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            helperText={t('aircraft.cards.nameHelp', 'E.g. Air BP Fuel Card, Finavia Season Pass')}
          />

          <TextField
            label={t('aircraft.cards.description', 'Description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={3}
          />

          <DatePicker
            label={t('aircraft.cards.validFrom', 'Valid From')}
            value={validFrom}
            onChange={(newValue) => setValidFrom(newValue)}
            slotProps={{
              textField: {
                fullWidth: true,
              },
            }}
          />

          <DatePicker
            label={t('aircraft.cards.validTo', 'Valid To')}
            value={validTo}
            onChange={(newValue) => setValidTo(newValue)}
            minDate={validFrom || undefined}
            slotProps={{
              textField: {
                fullWidth: true,
                helperText: t('aircraft.cards.validToHelp', 'Leave empty if no expiry date'),
              },
            }}
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
