import {
  Card,
  CardContent,
  Stack,
  Grid,
  TextField,
  Button,
  DialogActions,
  DialogContent,
  Dialog,
  useMediaQuery,
  useTheme,
  CardActions,
  Typography,
} from '@mui/material'
import useApi, { MutateMethods } from '../../../hooks/useApi'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { AuditFormField } from '../../../components/AuditFormField'
import { FormTitle } from '../../../components/FormTitle'
import { mutate } from 'swr'
import { EditDialogTitle } from '../../../components/EditDialogTitle'
import { Upsert } from '@backend/types/schema'
import { AircraftJourneyLogBook } from '@backend/routes/ajlb/model'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs from 'dayjs'
import { HoursAndMinutes } from './HoursAndMinutes'
import { splitTime } from '../utils/timeUtils'
import { FormField } from '../../../components/FormField'
import { FlightLogListResponse, FlightLogStatus } from '@backend/routes/flight-log/models'
import { FlightTable } from './FlightTable'
import { Problem } from '@backend/routes/response'
import { SnackAlert } from '../../../components/SnackAlert'
import { SaveButton } from '../../../components/SaveButton'
import { RemoveButton } from '../../../components/RemoveButton'

export const AjlbEditor = ({
  book,
  onClose,
}: {
  book: Upsert<AircraftJourneyLogBook> | undefined
  onClose: (newBook?: Upsert<AircraftJourneyLogBook>) => void
}) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const isNewBook = !book?.createdBy

  const { data: flightLogs } = useApi<FlightLogListResponse>({
    url: 'v1/flight-logs',
    params: {
      aircraftRegistration: book?.aircraftRegistration,
      status: FlightLogStatus.NEW,
    },
    skipFetch: !isNewBook,
  })

  const { mutation } = useApi<AircraftJourneyLogBook>({
    url: `v1/ajlb${isNewBook ? '' : `/${book?.aircraftRegistration}/${book?.seqNo}`}`,
    skipFetch: true,
  })
  const [formData, setFormData] = useState<Upsert<AircraftJourneyLogBook>>({
    aircraftRegistration: '',
    seqNo: -1,
    startFlightMins: 0,
    startLandings: 0,
    noOfPages: 0,
    rowsPerPage: 0,
    startPage: 0,
    startDate: new Date().toISOString(),
    endDate: null,
  })

  const [currentHours, setCurrentHours] = useState(0)
  const [currentMinutes, setCurrentMinutes] = useState(0)

  useEffect(() => {
    if (book) {
      setProblem(undefined)
      setFormData(book)

      setCurrentHours(Math.floor(book.startFlightMins / 60))
      setCurrentMinutes(book.startFlightMins % 60)
    }
  }, [book])

  const [problem, setProblem] = useState<Problem | undefined>()

  const trigger = async (method: MutateMethods) => {
    setProblem(undefined)

    const { error } = await mutation.trigger(method, formData)
    if (error) {
      return setProblem(error)
    }

    // clear the cache for roles list
    mutate((key) => Array.isArray(key) && key[0] == 'v1/ajlb')

    onClose()
  }

  const handleRemove = async () => trigger('DELETE')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProblem(undefined)

    await trigger(isNewBook ? 'POST' : 'PATCH')
  }

  const handleChange = (field: keyof AircraftJourneyLogBook, value: string | number | null) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const editorCard = () => (
    <Card sx={{ flex: 1, position: 'relative' }}>
      <CardContent>
        <Grid container spacing={2}>
          <Grid size={6}>
            <TextField
              fullWidth
              required
              label={t('flightLog.aircraft')}
              value={formData.aircraftRegistration || ''}
            />
          </Grid>

          <Grid size={6}>
            <TextField
              fullWidth
              required
              label={t('flightLog.logbooks.seqNo')}
              value={formData.seqNo || ''}
            />
          </Grid>

          <Grid size={6}>
            <TextField
              fullWidth
              required
              type='number'
              inputMode='numeric'
              label={t('flightLog.logbooks.noOfPages')}
              value={formData.noOfPages || ''}
              onChange={({ target }) => handleChange('noOfPages', Number(target.value))}
            />
          </Grid>

          <Grid size={6}>
            <TextField
              fullWidth
              required
              type='number'
              inputMode='numeric'
              label={t('flightLog.logbooks.rowsPerPage')}
              value={formData.rowsPerPage || ''}
              onChange={({ target }) => handleChange('rowsPerPage', Number(target.value))}
            />
          </Grid>

          <Grid size={6}>
            <TextField
              fullWidth
              required
              type='number'
              inputMode='numeric'
              label={t('flightLog.logbooks.startPage')}
              value={formData.startPage || ''}
              onChange={({ target }) => handleChange('startPage', Number(target.value))}
            />
          </Grid>

          <Grid size={6}>
            <DatePicker
              label={t('flightLog.logbooks.validFrom')}
              defaultValue={dayjs()}
              value={dayjs(formData.startDate)}
              onChange={(value) => handleChange('startDate', value?.format('YYYY-MM-DD') ?? '')}
            />
          </Grid>

          <Grid size={6}>
            <DatePicker
              label={t('flightLog.logbooks.validTo')}
              defaultValue={null}
              value={dayjs(formData.endDate)}
              slotProps={{
                field: {
                  clearable: true,
                  onClear: () => handleChange('endDate', null),
                },
              }}
              onChange={(value) => handleChange('endDate', value?.format('YYYY-MM-DD') ?? null)}
            />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )

  const timeCard = () =>
    book && (
      <Card>
        <CardContent>
          <FormTitle title={t('flightLog.logbooks.flightTimeAtStart')} icon='mdi:clock' />

          <Grid container spacing={2}>
            <Grid size={12}>
              <HoursAndMinutes
                currentHours={currentHours}
                currentMinutes={currentMinutes}
                setCurrentHours={(hours) => {
                  if (hours !== null) {
                    setCurrentHours(hours)
                    handleChange('startFlightMins', hours * 60 + currentMinutes)
                  }
                }}
                setCurrentMinutes={(minutes) => {
                  if (minutes !== null) {
                    setCurrentMinutes(minutes)
                    handleChange('startFlightMins', currentHours * 60 + minutes)
                  }
                }}
              />
            </Grid>

            <Grid size={12}>
              <TextField
                fullWidth
                type='number'
                inputMode='numeric'
                label={t('flightLog.logbooks.landingsAtStart')}
                value={formData.startLandings ?? 0}
                onChange={({ target }) => {
                  const num = Number(target.value)
                  handleChange('startLandings', Number.isFinite(num) ? Math.max(0, num) : 0)
                }}
                slotProps={{ htmlInput: { min: 0 } }}
              />
            </Grid>

            {!isNewBook && (
              <Grid size={12}>
                <FormField label={t('flightLog.logbooks.verifiedTotalFlightTime')} width={200}>
                  {book.view?.verifiedTotalFlightTime}
                </FormField>

                <FormField label={t('flightLog.logbooks.unverifiedFlights')} width={200}>
                  {book.view?.newFlightsCount}
                </FormField>

                <FormField label={t('flightLog.logbooks.unverifiedFlightsTime')} width={200}>
                  {book.view?.newFlightsTime}
                </FormField>

                <FormField label={t('flightLog.logbooks.totalLandings')} width={200}>
                  {book.view?.totalLandings}
                </FormField>
              </Grid>
            )}

            {isNewBook && (
              <>
                <Typography
                  variant='subtitle1'
                  gutterBottom
                  sx={{
                    fontWeight: 'medium',
                  }}
                >
                  {t('flightLog.logbooks.flightsToMove')}
                </Typography>
                <FlightTable flights={flightLogs?.logs ?? []} />
              </>
            )}
          </Grid>
        </CardContent>
        {!isNewBook && (
          <CardActions sx={{ m: 1 }}>
            <Button
              onClick={() => {
                const { hours, minutes } = splitTime(book.view?.validatedFlightsTime ?? '00:00')

                onClose({
                  ...formData,
                  startDate: book.endDate ?? dayjs().format('YYYY-MM-DD'),
                  endDate: null,
                  seqNo: book.seqNo + 1,
                  startFlightMins: hours * 60 + minutes,
                  startLandings: book.view?.validatedTotalLandings ?? 0,
                  view: undefined,
                  createdAt: undefined,
                  createdBy: undefined,
                  updatedAt: undefined,
                  updatedBy: undefined,
                })
              }}
              color='primary'
              variant='contained'
              disabled={book.endDate === null}
            >
              {t('flightLog.logbooks.nextSequence')}
            </Button>
            {book.endDate === null && (
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                }}
              >
                {t('flightLog.logbooks.oldBookMustBeEnded')}
              </Typography>
            )}
          </CardActions>
        )}
      </Card>
    )

  const detailsCard = () =>
    book && (
      <Card>
        <CardContent>
          <FormTitle title={t('flightLog.logbooks.details')} icon='mdi:information' />

          <Stack spacing={1.5}>
            <AuditFormField label={t('member.created')} by={book.createdBy} at={book.createdAt} />

            <AuditFormField label={t('member.updated')} by={book.updatedBy} at={book.updatedAt} />
          </Stack>
        </CardContent>
      </Card>
    )

  return (
    <Dialog
      open={book !== undefined}
      onClose={() => onClose()}
      maxWidth='sm'
      fullWidth
      fullScreen={isXs}
      slotProps={{
        paper: {
          component: 'form',
          onSubmit: handleSubmit,
        },
      }}
    >
      <EditDialogTitle
        title={isNewBook ? 'flightLog.logbooks.newAjlb' : 'flightLog.logbooks.editAjlb'}
        onClose={() => onClose()}
      />
      <DialogContent dividers>
        <Stack spacing={3}>
          {editorCard()}

          {timeCard()}

          {!isNewBook && detailsCard()}

          <SnackAlert problem={problem} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Grid
          size={12}
          sx={{
            justifyContent: 'space-between',
            display: 'flex',
            flexGrow: 1,
          }}
        >
          <Grid>
            {!isNewBook && <RemoveButton onClick={handleRemove} loading={mutation.isMutating} />}
          </Grid>

          <Grid
            sx={{
              display: 'flex',
              gap: 2,
            }}
          >
            <Button onClick={() => onClose()} color='inherit'>
              {t('general.cancel', 'Cancel')}
            </Button>
            <SaveButton loading={mutation.isMutating} />
          </Grid>
        </Grid>
      </DialogActions>
    </Dialog>
  )
}
