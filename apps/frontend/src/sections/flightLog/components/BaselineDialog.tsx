import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { mutate } from 'swr'
import { Icon } from '@iconify/react/dist/iconify.js'
import { Problem } from '@backend/routes/response'
import useApi from '../../../hooks/useApi'
import { SaveButton } from '../../../components/SaveButton'
import { SnackAlert } from '../../../components/SnackAlert'

export const BaselineDialog = ({
  registration,
  currentBaseline,
  open,
  onClose,
}: {
  registration: string
  currentBaseline: number
  open: boolean
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const [baseline, setBaseline] = useState(currentBaseline)
  const [problem, setProblem] = useState<Problem | undefined>()

  useEffect(() => {
    setBaseline(currentBaseline)
  }, [currentBaseline])

  const { mutation } = useApi({
    url: `v1/ajlb/${registration}/baseline`,
    skipFetch: true,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProblem(undefined)

    const { error } = await mutation.trigger('POST', { baselineLandings: baseline })
    if (error) {
      return setProblem(error)
    }

    mutate(
      (key) =>
        Array.isArray(key) &&
        key[0] === 'v1/ajlb' &&
        (!key[1]?.aircraftRegistration || key[1]?.aircraftRegistration === registration),
    )
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth='xs'
      fullWidth
      slotProps={{ paper: { component: 'form', onSubmit: handleSubmit } }}
    >
      <DialogTitle>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant='h6'>
            {t('flightLog.logbooks.setBaseline')} — {registration}
          </Typography>
          <IconButton onClick={onClose} aria-label='close'>
            <Icon icon='mdi:close' />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            fullWidth
            autoFocus
            type='number'
            inputMode='numeric'
            label={t('flightLog.logbooks.baselineLandings')}
            value={baseline}
            onChange={({ target }) => {
              const n = Number(target.value)
              setBaseline(Number.isFinite(n) ? Math.max(0, n) : 0)
            }}
            slotProps={{ htmlInput: { min: 0 } }}
            helperText={t('flightLog.logbooks.baselineHelperText')}
          />

          <SnackAlert problem={problem} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color='inherit'>
          {t('general.cancel', 'Cancel')}
        </Button>
        <SaveButton loading={mutation.isMutating} />
      </DialogActions>
    </Dialog>
  )
}
