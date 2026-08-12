import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import type { LocalFuelPrice } from '@mik/contracts/fuel-prices'
import { FUEL_TYPES } from '@mik/contracts/expenses'
import useApi from '../../hooks/useApi'

// Local (EFNU) fuel price cap per fuel type, used to compute the balanced cross-trip
// reimbursement cap on fuel claims (issue #955). Effective-dated: the price shown on a
// claim is whichever row here has the latest validFrom on or before the trip's date.
export function LocalFuelPrices({ canEdit }: { canEdit: boolean | undefined }) {
  const { t } = useTranslation()
  const { data, mutate } = useApi<{ prices: LocalFuelPrice[] }>({ url: 'v1/fuel-prices/local' })
  const { mutation } = useApi<LocalFuelPrice>({ url: 'v1/fuel-prices/local', skipFetch: true })

  const [fuelType, setFuelType] = useState<string>(FUEL_TYPES[0])
  const [price, setPrice] = useState('')
  const [validFrom, setValidFrom] = useState(new Date().toISOString().substring(0, 10))
  const [error, setError] = useState<string>()

  const addPrice = async () => {
    setError(undefined)
    const response = await mutation.trigger('POST', {
      fuelType,
      priceEurPerLitre: Number(price),
      validFrom,
    })
    if (response.error) {
      setError(response.error.detail)
      return
    }
    setPrice('')
    await mutate()
  }

  const prices = data?.prices ?? []

  return (
    <Paper sx={{ p: 2, mt: 3 }}>
      <Typography variant='h6' sx={{ mb: 2 }}>
        {t('fuelPrices.localPrices.title')}
      </Typography>
      <Typography variant='body2' sx={{ color: 'text.secondary', mb: 2 }}>
        {t('fuelPrices.localPrices.description')}
      </Typography>
      {prices.length === 0 ? (
        <Alert severity='info'>{t('fuelPrices.localPrices.empty')}</Alert>
      ) : (
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>{t('fuelPrices.localPrices.fuelType')}</TableCell>
              <TableCell align='right'>{t('fuelPrices.localPrices.price')}</TableCell>
              <TableCell>{t('fuelPrices.localPrices.validFrom')}</TableCell>
              <TableCell>{t('fuelPrices.localPrices.createdBy')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {prices.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.fuelType}</TableCell>
                <TableCell align='right'>{p.priceEurPerLitre.toFixed(4)} €/l</TableCell>
                <TableCell>{p.validFrom}</TableCell>
                <TableCell>{p.createdBy}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canEdit && (
        <Box sx={{ mt: 2 }}>
          {!!error && (
            <Alert severity='error' sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ alignItems: 'flex-start' }}
          >
            <TextField
              select
              label={t('fuelPrices.localPrices.fuelType')}
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value)}
              sx={{ minWidth: 120 }}
            >
              {FUEL_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type='number'
              label={t('fuelPrices.localPrices.price')}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              slotProps={{ htmlInput: { step: '0.0001', min: 0 } }}
              sx={{ width: 160 }}
            />
            <TextField
              type='date'
              label={t('fuelPrices.localPrices.validFrom')}
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 180 }}
            />
            <Button
              variant='contained'
              onClick={() => void addPrice()}
              disabled={!price || Number(price) <= 0 || mutation.isMutating}
            >
              {t('fuelPrices.localPrices.add')}
            </Button>
          </Stack>
        </Box>
      )}
    </Paper>
  )
}
