import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import useApi from '../../../hooks/useApi'
import { EquipmentFee, EquipmentFeeStatus } from '@backend/routes/invoicing/models'
import { useState } from 'react'
import { RemoteContent } from '../../../components/RemoteContent'

export const EquipmentFeeBanner = () => {
  const { t } = useTranslation()
  const { data, isLoading, error, mutate, mutation } = useApi<EquipmentFeeStatus>({
    url: 'v1/invoices/equipmentFeeStatus',
  })

  const { data: feeData } = useApi<EquipmentFee | undefined>(
    {
      url: 'v1/invoices/annualEquipmentFee',
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  )

  const [requestSuccess, setRequestSuccess] = useState(false)
  const [requestError, setRequestError] = useState<string | undefined>()
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

  const handleRequestInvoice = async () => {
    setConfirmDialogOpen(false)
    // `trigger` resolves with `{ error }` rather than throwing. Checking only
    // `data` meant a rejected request left the banner unchanged with nothing
    // said, so the member had no idea their request had not gone through.
    const { data: invoice, error: requestFailure } = await mutation.trigger(
      'POST',
      {},
      '/v1/invoices/requestOwnEquipmentFeeInvoice',
    )

    if (requestFailure) {
      setRequestError(requestFailure.detail ?? t('general.savingError'))
      return
    }

    if (invoice) {
      setRequestError(undefined)
      setRequestSuccess(true)
      mutate() // Refresh the equipment fee status
    }
  }

  const shouldShowBanner = !data?.hasPaid && !requestSuccess

  const fullAmount = feeData?.markup_value ?? 0
  const seasonalDiscountPercent = feeData?.seasonal_discount_percent
  const hasSeasonalDiscount = seasonalDiscountPercent !== undefined && seasonalDiscountPercent > 0
  const discountedAmount = hasSeasonalDiscount
    ? Math.round(fullAmount * (1 - seasonalDiscountPercent / 100) * 100) / 100
    : fullAmount

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      {requestError && (
        <Alert severity='error' sx={{ mb: 2 }} onClose={() => setRequestError(undefined)}>
          {requestError}
        </Alert>
      )}
      {shouldShowBanner && (
        <>
          <Alert
            severity='warning'
            sx={{ mb: 3 }}
            action={
              <Button
                variant='contained'
                color='warning'
                size='small'
                onClick={() => setConfirmDialogOpen(true)}
                disabled={mutation.isMutating}
              >
                {mutation.isMutating
                  ? t('dashboard.requestingInvoice')
                  : t('dashboard.requestInvoice')}
              </Button>
            }
          >
            {t('dashboard.equipmentFeeNotPaid', {
              year: data?.year,
              discount: feeData?.discount_amount ?? 0,
            })}
            {hasSeasonalDiscount && (
              <Typography variant='body2' sx={{ mt: 0.5, fontWeight: 'bold' }}>
                {t('dashboard.equipmentFeeSeasonalDiscountNote', {
                  discountedAmount,
                  amount: fullAmount,
                  percent: seasonalDiscountPercent,
                })}
              </Typography>
            )}
          </Alert>

          <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)}>
            <DialogTitle>{t('dashboard.confirmEquipmentFee.title')}</DialogTitle>
            <DialogContent>
              <DialogContentText>
                {hasSeasonalDiscount
                  ? t('dashboard.confirmEquipmentFee.messageWithDiscount', {
                      year: data?.year,
                      amount: fullAmount,
                      discountedAmount,
                      discount: feeData?.discount_amount ?? 0,
                      percent: seasonalDiscountPercent,
                    })
                  : t('dashboard.confirmEquipmentFee.message', {
                      year: data?.year,
                      amount: fullAmount,
                      discount: feeData?.discount_amount ?? 0,
                    })}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmDialogOpen(false)}>
                {t('dashboard.confirmEquipmentFee.cancel')}
              </Button>
              <Button onClick={handleRequestInvoice} variant='contained' color='warning' autoFocus>
                {t('dashboard.confirmEquipmentFee.accept')}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </RemoteContent>
  )
}
