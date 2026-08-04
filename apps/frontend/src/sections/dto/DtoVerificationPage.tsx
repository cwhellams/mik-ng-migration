import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Title } from '../../components/Title'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import type {
  FlightItemOutcome,
  SyllabusFlight,
  SyllabusFlightItem,
} from '@backend/routes/dto/models'
import {
  verifyAttempt,
  type PendingVerificationItem,
  type AttemptWithFlightLogData,
} from './dtoApi'

type AttemptWithOutcomes = AttemptWithFlightLogData & {
  itemOutcomes: FlightItemOutcome[]
}

type ItemOutcome = 'COMPLETED' | 'FAILED' | 'MOVED_TO_HIL'

function formatMins(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

function formatTime(utc: string): string {
  return new Date(utc).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function FlightInfoRow({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        alignItems: 'baseline',
      }}
    >
      <Typography
        variant='caption'
        sx={{
          color: 'text.secondary',
          minWidth: 110,
        }}
      >
        {label}
      </Typography>
      <Typography variant='body2'>{value}</Typography>
    </Box>
  )
}

function TrainingItemCard({
  item,
  outcome,
  remark,
  onOutcome,
  onRemark,
}: Readonly<{
  item: SyllabusFlightItem
  outcome: ItemOutcome | undefined
  remark: string
  onOutcome: (val: ItemOutcome) => void
  onRemark: (val: string) => void
}>) {
  const missing = item.mandatory && !outcome
  return (
    <Paper
      variant='outlined'
      sx={{
        p: 1.5,
        borderColor: missing ? 'warning.main' : 'divider',
        borderWidth: missing ? 2 : 1,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 1,
        }}
      >
        <Typography
          variant='body2'
          sx={{
            fontWeight: 500,
            flex: 1,
            mr: 1,
          }}
        >
          {item.name}
        </Typography>
        {item.mandatory && (
          <Chip
            label='Required'
            size='small'
            color='warning'
            variant='outlined'
            sx={{ flexShrink: 0 }}
          />
        )}
      </Box>
      <ToggleButtonGroup
        value={outcome ?? null}
        exclusive
        onChange={(_e, val: ItemOutcome | null) => {
          if (val) onOutcome(val)
        }}
        size='small'
        fullWidth
        sx={{ mb: remark || outcome ? 1.5 : 0 }}
      >
        <ToggleButton value='COMPLETED' color='success'>
          <Icon icon='mdi:check' style={{ marginRight: 4 }} />
          Completed
        </ToggleButton>
        <ToggleButton value='FAILED' color='error'>
          <Icon icon='mdi:close' style={{ marginRight: 4 }} />
          Failed
        </ToggleButton>
        <ToggleButton value='MOVED_TO_HIL' color='warning'>
          <Icon icon='mdi:arrow-right' style={{ marginRight: 4 }} />
          HIL
        </ToggleButton>
      </ToggleButtonGroup>
      {outcome && (
        <TextField
          size='small'
          value={remark}
          onChange={(e) => onRemark(e.target.value)}
          placeholder='Remarks (optional)'
          fullWidth
          multiline
          maxRows={3}
        />
      )}
    </Paper>
  )
}

function VerifyPanel({ attemptId, onDone }: Readonly<{ attemptId: string; onDone: () => void }>) {
  const navigate = useNavigate()

  const {
    data: attempt,
    isLoading,
    error,
  } = useApi<AttemptWithOutcomes>({
    url: `v1/dto/attempts/${attemptId}`,
  })

  const { data: flightDetail, isLoading: flightDetailLoading } = useApi<SyllabusFlight>({
    url: attempt ? `v1/dto/flights/${attempt.syllabusFlightId}` : undefined,
  })

  const [result, setResult] = useState<'APPROVED' | 'FAILED'>('APPROVED')
  const [comments, setComments] = useState('')
  const [outcomes, setOutcomes] = useState<Record<string, ItemOutcome>>({})
  const [remarks, setRemarks] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const mandatoryItems: SyllabusFlightItem[] = (flightDetail?.items ?? []).filter(
    (i) => i.mandatory,
  )
  const allMandatoryHaveOutcome =
    !flightDetailLoading && mandatoryItems.every((i) => outcomes[i.itemId])
  const missingCount = mandatoryItems.filter((i) => !outcomes[i.itemId]).length

  const handleVerify = async () => {
    if (!allMandatoryHaveOutcome) return
    setSaving(true)
    setSaveError(null)
    try {
      await verifyAttempt(attemptId, {
        result,
        instructorComments: comments || null,
        itemOutcomes: Object.entries(outcomes).map(([itemId, outcome]) => ({
          itemId,
          outcome,
          remarks: remarks[itemId] || null,
        })),
      })
      onDone()
    } catch {
      setSaveError('Verification failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <CircularProgress />
  if (error || !attempt) return <Alert severity='error'>Could not load attempt</Alert>

  return (
    <Stack spacing={2}>
      {attempt.requiresReverification && (
        <Alert severity='warning'>
          <Typography
            variant='body2'
            sx={{
              fontWeight: 'bold',
            }}
          >
            Flight data was edited after the previous verification. Please re-verify.
          </Typography>
          {attempt.verifiedAt && (
            <Typography variant='caption'>
              Previously {attempt.verificationResult === 'APPROVED' ? 'approved' : 'reviewed'} by{' '}
              {attempt.verifierName ?? attempt.verifiedBy} on {attempt.verifiedAt.substring(0, 10)}
            </Typography>
          )}
        </Alert>
      )}
      {saveError && <Alert severity='error'>{saveError}</Alert>}
      {/* Flight log summary */}
      <Paper
        variant='outlined'
        sx={{
          p: 1.5,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
          }}
        >
          <FlightInfoRow label='Date' value={attempt.flightDate} />
          <FlightInfoRow
            label='Route'
            value={`${attempt.departureAirport} → ${attempt.arrivalAirport}`}
          />
          <FlightInfoRow
            label='Dep / Arr'
            value={`${formatTime(attempt.offBlockTimeUtc)} / ${formatTime(attempt.onBlockTimeUtc)}`}
          />
          <FlightInfoRow
            label='T/O / Ldg'
            value={`${formatTime(attempt.takeoffTimeUtc)} / ${formatTime(attempt.landingTimeUtc)}`}
          />
          <FlightInfoRow label='Block time' value={attempt.blockTime} />
          {flightDetail?.recommendedBlockTimeMins && (
            <FlightInfoRow
              label='Recommended'
              value={formatMins(flightDetail.recommendedBlockTimeMins)}
            />
          )}
          <FlightInfoRow label='Air time' value={attempt.flightTime} />
          <FlightInfoRow label='Landings' value={attempt.numberOfLandings} />
        </Box>
        <Button
          size='small'
          variant='outlined'
          startIcon={<Icon icon='mdi:book-open-outline' />}
          onClick={() => navigate(`/logs/flights/${attempt.flightLogId}`)}
        >
          Open Book Entry
        </Button>
      </Paper>
      {flightDetail && (
        <Typography
          variant='subtitle1'
          sx={{
            fontWeight: 600,
          }}
        >
          {flightDetail.code} — {flightDetail.name}
        </Typography>
      )}
      {/* Training items */}
      {flightDetail && (flightDetail.items ?? []).length > 0 && (
        <>
          <Typography
            variant='subtitle2'
            sx={{
              color: 'text.secondary',
            }}
          >
            Training Items
          </Typography>
          <Stack spacing={1.5}>
            {(flightDetail.items ?? []).map((item) => (
              <TrainingItemCard
                key={item.itemId}
                item={item}
                outcome={outcomes[item.itemId]}
                remark={remarks[item.itemId] ?? ''}
                onOutcome={(val) => setOutcomes((prev) => ({ ...prev, [item.itemId]: val }))}
                onRemark={(val) => setRemarks((prev) => ({ ...prev, [item.itemId]: val }))}
              />
            ))}
          </Stack>

          {!allMandatoryHaveOutcome && (
            <Alert severity='warning'>
              {missingCount} mandatory item{missingCount !== 1 ? 's' : ''} still need an outcome
              before you can submit.
            </Alert>
          )}

          <Divider />
        </>
      )}
      {/* Verification result */}
      <FormControl fullWidth>
        <InputLabel>Verification result</InputLabel>
        <Select
          value={result}
          label='Verification result'
          onChange={(e) => setResult(e.target.value as 'APPROVED' | 'FAILED')}
        >
          <MenuItem value='APPROVED'>Approved / Passed</MenuItem>
          <MenuItem value='FAILED'>Failed</MenuItem>
        </Select>
      </FormControl>
      <TextField
        label='Instructor remarks'
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        fullWidth
        multiline
        rows={3}
      />
      <Button
        variant='contained'
        size='large'
        fullWidth
        color={result === 'APPROVED' ? 'success' : 'error'}
        onClick={handleVerify}
        disabled={saving || !allMandatoryHaveOutcome}
        startIcon={
          saving ? (
            <CircularProgress size={18} color='inherit' />
          ) : (
            <Icon icon={result === 'APPROVED' ? 'mdi:check' : 'mdi:close'} />
          )
        }
      >
        {saving ? 'Verifying…' : `Submit — ${result === 'APPROVED' ? 'APPROVED' : 'FAILED'}`}
      </Button>
    </Stack>
  )
}

export default function DtoVerificationPage() {
  const [selected, setSelected] = useState<PendingVerificationItem | null>(null)

  const {
    data: pending,
    isLoading,
    error,
    mutation,
  } = useApi<PendingVerificationItem[]>({
    url: 'v1/dto/instructor/pending',
  })

  if (selected) {
    return (
      <Box>
        <Button
          startIcon={<Icon icon='mdi:arrow-left' />}
          onClick={() => setSelected(null)}
          sx={{ mb: 1 }}
        >
          Back to list
        </Button>
        <Title label='Verify Flight' />
        <Typography
          variant='subtitle2'
          sx={{
            color: 'text.secondary',
            mb: 2,
          }}
        >
          Student: <strong>{selected.memberName}</strong>
        </Typography>
        <VerifyPanel
          attemptId={selected.attemptId}
          onDone={() => {
            setSelected(null)
            mutation.trigger('GET')
          }}
        />
      </Box>
    )
  }

  return (
    <Box>
      <Title label='Flights Awaiting Verification' />
      <RemoteContent isLoading={isLoading} error={error}>
        {(pending?.length ?? 0) === 0 ? (
          <Alert severity='success'>No flights awaiting verification. 🎉</Alert>
        ) : (
          <Stack spacing={1.5}>
            <Typography
              variant='body2'
              sx={{
                color: 'text.secondary',
              }}
            >
              {pending!.length} flight{pending!.length !== 1 ? 's' : ''} awaiting verification
            </Typography>
            {pending!.map((a) => (
              <Card key={a.attemptId} variant='outlined'>
                <CardActionArea onClick={() => setSelected(a)}>
                  <CardContent>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        mb: 0.5,
                      }}
                    >
                      <Typography
                        sx={{
                          fontWeight: 600,
                        }}
                      >
                        {a.memberName}
                      </Typography>
                      {a.requiresReverification ? (
                        <Chip
                          label='Re-verification'
                          icon={<Icon icon='mdi:alert' />}
                          color='warning'
                          size='small'
                        />
                      ) : (
                        <Chip label='Pending' color='warning' size='small' />
                      )}
                    </Box>
                    <Typography
                      variant='body2'
                      sx={{
                        color: 'text.secondary',
                      }}
                    >
                      {a.syllabusFlightCode} — {a.syllabusFlightName}
                    </Typography>
                    <Typography
                      variant='caption'
                      sx={{
                        color: 'text.secondary',
                      }}
                    >
                      Submitted: {new Date(a.createdAt).toLocaleDateString()}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Stack>
        )}
      </RemoteContent>
    </Box>
  )
}
