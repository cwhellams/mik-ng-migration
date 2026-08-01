import {
  Typography,
  Box,
  useMediaQuery,
  useTheme,
  Stepper,
  Step,
  StepLabel,
  Button,
  Alert,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { InvoicableFlights, InvoicableFlightFilters } from '@backend/routes/flight-log/models'
import { dayjs } from '../../utils/date'
import { useState } from 'react'
import { InvoicingRange } from './components/InvoicingRange'
import { InvoicingFlights } from './components/InvoicingFlights'
import { PartiallyBillableFlights } from './components/PartiallyBillableFlights'
import { Title } from '../../components/Title'
import { PrepaidBalanceFlights } from './components/PrepaidBalanceFlights'

const steps = [
  { code: undefined, labelKey: 'invoicing.range' },
  { code: InvoicableFlights.TEST_FLIGHT, labelKey: 'invoicing.testFlights' },
  { code: InvoicableFlights.FERRY, labelKey: 'invoicing.ferryFlights' },
  {
    code: InvoicableFlights.COMMENT,
    labelKey: 'invoicing.withBillingComments',
  },
  {
    code: InvoicableFlights.ENTRY_ERROR,
    labelKey: 'invoicing.entryErrorFlights',
  },
  {
    code: InvoicableFlights.PARTIALLY_BILLABLE,
    labelKey: 'invoicing.partiallyBillable',
  },
  { code: InvoicableFlights.MIN_BILLABLE, labelKey: 'invoicing.minBillable' },
  { code: InvoicableFlights.OTHER, labelKey: 'invoicing.other' },
  { code: 'PREPAID_BALANCE', labelKey: 'invoicing.prepaidBalance' },
]

export const FlightInvoicing = () => {
  const { t } = useTranslation()

  const [searchParams, setSearchParams] = useSearchParams()

  const [filters, setFilters] = useState<InvoicableFlightFilters>({
    flights: InvoicableFlights.TEST_FLIGHT,
    aircraftRegistration: searchParams.get('registration') ?? '',
    endDate:
      searchParams.get('end') ??
      dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD') ??
      '',
    page: 1,
  })

  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const activeStep = searchParams.get('step') ? Number(searchParams.get('step')) : 0

  const navigate = {
    next: () =>
      setSearchParams({
        step: (activeStep + 1).toString(),
        registration: filters.aircraftRegistration ?? '',
        end: filters.endDate ?? '',
      }),

    previous: () =>
      setSearchParams((prev) => ({
        ...prev,
        step: (activeStep - 1).toString(),
      })),
  }

  const handleReset = () => setSearchParams({})

  return (
    <Box>
      <Title label={t('invoicing.title')} />

      <Stepper
        orientation={isXs ? 'vertical' : 'horizontal'}
        activeStep={activeStep}
        sx={{ mb: 5 }}
      >
        {steps.map((step) => (
          <Step key={step.labelKey}>
            <StepLabel>{t(step.labelKey)}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {activeStep === 0 && (
        <InvoicingRange filters={filters} setFilters={setFilters} navigate={navigate} />
      )}

      {activeStep === 1 && (
        <InvoicingFlights
          filters={{ ...filters, flights: InvoicableFlights.TEST_FLIGHT }}
          setFilters={setFilters}
          navigate={navigate}
        />
      )}

      {activeStep === 2 && (
        <InvoicingFlights
          filters={{ ...filters, flights: InvoicableFlights.FERRY }}
          setFilters={setFilters}
          navigate={navigate}
        />
      )}

      {activeStep === 3 && (
        <InvoicingFlights
          filters={{
            ...filters,
            flights: InvoicableFlights.COMMENT,
          }}
          setFilters={setFilters}
          navigate={navigate}
        />
      )}

      {activeStep === 4 && (
        <InvoicingFlights
          filters={{
            ...filters,
            flights: InvoicableFlights.ENTRY_ERROR,
          }}
          setFilters={setFilters}
          navigate={navigate}
        />
      )}

      {activeStep === 5 && (
        <PartiallyBillableFlights filters={filters} setFilters={setFilters} navigate={navigate} />
      )}

      {activeStep === 6 && (
        <InvoicingFlights
          filters={{
            ...filters,
            flights: InvoicableFlights.MIN_BILLABLE,
          }}
          setFilters={setFilters}
          navigate={navigate}
        />
      )}

      {activeStep === 7 && (
        <InvoicingFlights
          filters={{
            ...filters,
            flights: InvoicableFlights.OTHER,
          }}
          setFilters={setFilters}
          navigate={navigate}
        />
      )}

      {activeStep === 8 && <PrepaidBalanceFlights filters={filters} navigate={navigate} />}

      {activeStep === steps.length && (
        <>
          <Typography sx={{ mt: 2, mb: 1, textAlign: 'center' }}>
            <Alert severity='success'>{t('invoicing.success')}</Alert>
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
            <Box sx={{ flex: '1 1 auto' }} />
            <Button color='primary' variant='contained' onClick={handleReset}>
              {t('invoicing.restart')}
            </Button>
          </Box>
        </>
      )}
    </Box>
  )
}
