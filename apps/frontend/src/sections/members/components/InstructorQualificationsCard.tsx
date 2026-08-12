import { useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import useApi, { sharedApi } from '../../../hooks/useApi'
import { FormTitle } from '../../../components/FormTitle'
import { EditButton } from '../../../components/EditButton'
import { EditDialogTitle } from '../../../components/EditDialogTitle'
import { SaveButton } from '../../../components/SaveButton'
import { SnackAlert } from '../../../components/SnackAlert'
import type { Problem } from '@mik/contracts/problem'
import type {
  InstructorQualification,
  InstructorQualificationUpsert,
  QualificationSnapshot,
} from '@mik/contracts/instructor-qualifications'

const EXPIRING_DAYS_THRESHOLD = 30
// Matches the backend's proofUpload raw limit (apps/backend/src/routes/instructor-qualifications/api.ts).
const MAX_PROOF_UPLOAD_BYTES = 40 * 1024 * 1024

interface InstructorQualificationsCardProps {
  memberId: string
  canEdit: boolean
  canViewHistory?: boolean
  onSaved?: () => void
}

type QualField = keyof Pick<
  InstructorQualification,
  | 'fiExpiry'
  | 'iriExpiry'
  | 'criExpiry'
  | 'sepExpiry'
  | 'medicalClass1Expiry'
  | 'medicalClass2Expiry'
  | 'medicalLaplExpiry'
>

const renderDateCell = (dateStr: string | null | undefined, t: (key: string) => string) => {
  if (!dateStr) {
    return (
      <Typography
        variant='body2'
        sx={{
          color: 'text.disabled',
        }}
      >
        {'–'}
      </Typography>
    )
  }

  const expiry = dayjs(dateStr)
  const now = dayjs()
  const isExpired = expiry.isBefore(now, 'day')
  const isExpiring = !isExpired && expiry.diff(now, 'day') <= EXPIRING_DAYS_THRESHOLD

  if (isExpired) {
    return (
      <Tooltip title={t('instructorStatus.expired')}>
        <Chip label={expiry.format('DD.MM.YYYY')} size='small' color='error' variant='outlined' />
      </Tooltip>
    )
  }

  if (isExpiring) {
    return (
      <Tooltip title={t('instructorStatus.expiringWarning')}>
        <Chip label={expiry.format('DD.MM.YYYY')} size='small' color='warning' variant='outlined' />
      </Tooltip>
    )
  }

  return <Typography variant='body2'>{expiry.format('DD.MM.YYYY')}</Typography>
}

export const InstructorQualificationsCard = ({
  memberId,
  canEdit,
  canViewHistory,
  onSaved,
}: InstructorQualificationsCardProps) => {
  const { t } = useTranslation()
  const [editOpen, setEditOpen] = useState(false)
  const [problem, setProblem] = useState<Problem | undefined>()
  const [showProofUpload, setShowProofUpload] = useState(false)
  const [licenseFile, setLicenseFile] = useState<File | null>(null)
  const [medicalFile, setMedicalFile] = useState<File | null>(null)
  const [proofUploading, setProofUploading] = useState(false)
  const [licenseSuccess, setLicenseSuccess] = useState(false)
  const [medicalSuccess, setMedicalSuccess] = useState(false)
  const [proofError, setProofError] = useState<string | null>(null)
  const [lastHistoryId, setLastHistoryId] = useState<number | null>(null)
  const licenseInputRef = useRef<HTMLInputElement>(null)
  const medicalInputRef = useRef<HTMLInputElement>(null)

  const selectProofFile = (file: File | null, setFile: (f: File | null) => void) => {
    if (file && file.size > MAX_PROOF_UPLOAD_BYTES) {
      setProofError(t('instructorStatus.proofTooLarge', { maxSize: '40 MB' }))
      return
    }
    setProofError(null)
    setFile(file)
  }

  // Snapshot / history state
  const [snapshotDate, setSnapshotDate] = useState<Dayjs | null>(null)
  const [snapshot, setSnapshot] = useState<QualificationSnapshot | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)

  const {
    data,
    isLoading,
    error,
    mutate: refetchData,
  } = useApi<InstructorQualification>({
    url: `v1/instructor-qualifications/${memberId}`,
  })

  const { mutation } = useApi<{
    qualification: InstructorQualification
    historyId: number
  }>({
    url: `v1/instructor-qualifications/${memberId}`,
    skipFetch: true,
  })

  const [formData, setFormData] = useState<InstructorQualificationUpsert>({})

  const handleOpen = () => {
    setFormData({
      fiExpiry: data?.fiExpiry ?? null,
      iriExpiry: data?.iriExpiry ?? null,
      criExpiry: data?.criExpiry ?? null,
      sepExpiry: data?.sepExpiry ?? null,
      medicalClass1Expiry: data?.medicalClass1Expiry ?? null,
      medicalClass2Expiry: data?.medicalClass2Expiry ?? null,
      medicalLaplExpiry: data?.medicalLaplExpiry ?? null,
    })
    setProblem(undefined)
    setShowProofUpload(false)
    setLicenseFile(null)
    setMedicalFile(null)
    setLicenseSuccess(false)
    setMedicalSuccess(false)
    setProofError(null)
    setLastHistoryId(null)
    setEditOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setProblem(undefined)

    const { data: saveData, error: saveError } = await mutation.trigger('PUT', formData)
    if (saveError) {
      return setProblem(saveError)
    }

    if (saveData?.historyId) {
      setLastHistoryId(saveData.historyId)
    }

    refetchData()
    onSaved?.()
    setShowProofUpload(true)
  }

  const uploadProofFile = async (file: File, category: 'LICENSE' | 'MEDICAL') => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('documentCategory', category)
    if (lastHistoryId !== null) {
      fd.append('historyId', String(lastHistoryId))
    }
    await sharedApi.post(`v1/instructor-qualifications/${memberId}/proof`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  }

  const handleProofUpload = async () => {
    if (!licenseFile && !medicalFile) return
    setProofUploading(true)
    setProofError(null)
    try {
      if (licenseFile) {
        await uploadProofFile(licenseFile, 'LICENSE')
        setLicenseSuccess(true)
        setLicenseFile(null)
      }
      if (medicalFile) {
        await uploadProofFile(medicalFile, 'MEDICAL')
        setMedicalSuccess(true)
        setMedicalFile(null)
      }
    } catch {
      setProofError(t('common.error', 'Upload failed. Please try again.'))
    } finally {
      setProofUploading(false)
    }
  }

  const handleCloseDialog = () => {
    setEditOpen(false)
    setShowProofUpload(false)
    setLicenseFile(null)
    setMedicalFile(null)
    setLicenseSuccess(false)
    setMedicalSuccess(false)
    setLastHistoryId(null)
  }

  const handleDateChange =
    (field: keyof InstructorQualificationUpsert) => (value: Dayjs | null) => {
      setFormData((prev) => ({
        ...prev,
        [field]: value?.isValid() ? value.format('YYYY-MM-DD') : null,
      }))
    }

  const handleSnapshotLookup = async () => {
    if (!snapshotDate?.isValid()) return
    setSnapshotLoading(true)
    setSnapshotError(null)
    setSnapshot(null)
    try {
      const dateStr = snapshotDate.format('YYYY-MM-DD')
      const response = await sharedApi.get<QualificationSnapshot>(
        `v1/instructor-qualifications/${memberId}/snapshot?date=${dateStr}`,
      )
      setSnapshot(response.data)
    } catch {
      setSnapshotError(t('instructorStatus.snapshotError'))
    } finally {
      setSnapshotLoading(false)
    }
  }

  const handleClearSnapshot = () => {
    setSnapshotDate(null)
    setSnapshot(null)
    setSnapshotError(null)
  }

  const fields: { key: QualField; short: string; tooltip: string }[] = [
    {
      key: 'fiExpiry',
      short: t('instructorStatus.fi'),
      tooltip: t('instructorStatus.fiTooltip'),
    },
    {
      key: 'iriExpiry',
      short: t('instructorStatus.iri'),
      tooltip: t('instructorStatus.iriTooltip'),
    },
    {
      key: 'criExpiry',
      short: t('instructorStatus.cri'),
      tooltip: t('instructorStatus.criTooltip'),
    },
    {
      key: 'sepExpiry',
      short: t('instructorStatus.sep'),
      tooltip: t('instructorStatus.sepTooltip'),
    },
    {
      key: 'medicalClass1Expiry',
      short: t('instructorStatus.medClass1'),
      tooltip: t('instructorStatus.medClass1Tooltip'),
    },
    {
      key: 'medicalClass2Expiry',
      short: t('instructorStatus.medClass2'),
      tooltip: t('instructorStatus.medClass2Tooltip'),
    },
    {
      key: 'medicalLaplExpiry',
      short: t('instructorStatus.medLapl'),
      tooltip: t('instructorStatus.medLaplTooltip'),
    },
  ]

  if (isLoading) return null

  // Treat 404 as "no data yet" — not an error
  const hasNoData = error?.status === 404
  if (error && !hasNoData) {
    return (
      <Card>
        <CardContent>
          <Alert severity='error'>{error.detail ?? error.title}</Alert>
        </CardContent>
      </Card>
    )
  }

  const qualFields = fields.map((f) => f.key)
  const displayData: Partial<Record<QualField, string | null | undefined>> = snapshot
    ? snapshot
    : Object.fromEntries(
        qualFields.map((k) => [k, data ? data[k as keyof typeof data] : undefined]),
      )

  return (
    <>
      <Card>
        {canEdit && (
          <EditButton
            title={t('instructorStatus.editQualifications')}
            onClick={handleOpen}
            sx={{ position: 'absolute', top: 8, right: 8 }}
          />
        )}
        <CardContent>
          <FormTitle title={t('instructorStatus.qualifications')} icon='mdi:certificate-outline' />

          {/* Date picker for point-in-time snapshot — admins only */}
          {canViewHistory && (
            <Box
              sx={{
                mb: 2,
              }}
            >
              <Stack
                direction='row'
                spacing={2}
                sx={{
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <DatePicker
                  label={t('instructorStatus.snapshotDate')}
                  value={snapshotDate}
                  onChange={setSnapshotDate}
                  disableFuture
                  slotProps={{ textField: { size: 'small' } }}
                />
                <Button
                  variant='contained'
                  size='small'
                  onClick={handleSnapshotLookup}
                  disabled={!snapshotDate?.isValid() || snapshotLoading}
                >
                  {t('instructorStatus.snapshotLookup')}
                </Button>
                {snapshot && (
                  <Button variant='outlined' size='small' onClick={handleClearSnapshot}>
                    {t('instructorStatus.auditClear')}
                  </Button>
                )}
              </Stack>
              {snapshotError && (
                <Alert severity='error' sx={{ mt: 1 }}>
                  {snapshotError}
                </Alert>
              )}
              {snapshot && snapshotDate && (
                <Alert severity='info' sx={{ mt: 1 }}>
                  {t('instructorStatus.auditViewingDate', {
                    date: snapshotDate.format('DD.MM.YYYY'),
                  })}
                  {snapshot.changedAt && (
                    <>
                      {' · '}
                      {t('instructorStatus.changedAt')}:{' '}
                      {dayjs(snapshot.changedAt).format('DD.MM.YYYY HH:mm')}
                      {' · '}
                      {t('instructorStatus.changedBy')}: {snapshot.changedBy}
                    </>
                  )}
                </Alert>
              )}
            </Box>
          )}

          {/* Horizontal table — abbreviation headers with tooltips */}
          <TableContainer>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  {fields.map((f) => (
                    <TableCell
                      key={f.key}
                      align='center'
                      sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}
                    >
                      <Tooltip title={f.tooltip} placement='top'>
                        <span aria-label={f.tooltip}>{f.short}</span>
                      </Tooltip>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  {fields.map((f) => (
                    <TableCell key={f.key} align='center'>
                      {renderDateCell(displayData[f.key], t)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
      <Dialog open={editOpen} onClose={handleCloseDialog} fullWidth maxWidth='sm'>
        {!showProofUpload ? (
          <form onSubmit={handleSave}>
            <EditDialogTitle
              title={t('instructorStatus.editQualifications')}
              onClose={handleCloseDialog}
            />
            <DialogContent>
              <SnackAlert problem={problem} />
              <Grid container spacing={2} sx={{ mt: 1 }}>
                {fields.map((field) => (
                  <Grid size={{ xs: 12, sm: 6 }} key={field.key}>
                    <DatePicker
                      label={`${field.short} – ${field.tooltip}`}
                      value={formData[field.key] ? dayjs(formData[field.key]) : null}
                      onChange={handleDateChange(field.key)}
                      slotProps={{ textField: { fullWidth: true } }}
                    />
                  </Grid>
                ))}
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseDialog}>{t('common.cancel', 'Cancel')}</Button>
              <SaveButton />
            </DialogActions>
          </form>
        ) : (
          <>
            <EditDialogTitle
              title={t('instructorStatus.proofUploadTitle')}
              onClose={handleCloseDialog}
            />
            <DialogContent>
              {proofError && (
                <Alert severity='error' sx={{ mb: 2 }}>
                  {proofError}
                </Alert>
              )}
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                  mb: 2,
                }}
              >
                {t('instructorStatus.proofUploadMessage')}
              </Typography>
              <Stack spacing={3}>
                {/* License proof: FI / IRI / CRI / SEP */}
                <Stack spacing={1}>
                  <Typography variant='subtitle2'>
                    {t('instructorStatus.proofLicenseLabel')}
                  </Typography>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('instructorStatus.proofLicenseHint')}
                  </Typography>
                  {licenseSuccess ? (
                    <Alert severity='success'>{t('instructorStatus.proofUploaded')}</Alert>
                  ) : (
                    <>
                      <input
                        ref={licenseInputRef}
                        type='file'
                        accept='.pdf,.jpg,.jpeg'
                        capture='environment'
                        style={{ display: 'none' }}
                        onChange={(e) =>
                          selectProofFile(e.target.files?.[0] ?? null, setLicenseFile)
                        }
                      />
                      <Button
                        variant='outlined'
                        size='small'
                        onClick={() => licenseInputRef.current?.click()}
                      >
                        {licenseFile ? licenseFile.name : t('common.chooseFile', 'Choose file')}
                      </Button>
                    </>
                  )}
                </Stack>

                {/* Medical proof: MED I / MED II / MED LAPL */}
                <Stack spacing={1}>
                  <Typography variant='subtitle2'>
                    {t('instructorStatus.proofMedicalLabel')}
                  </Typography>
                  <Typography
                    variant='caption'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t('instructorStatus.proofMedicalHint')}
                  </Typography>
                  {medicalSuccess ? (
                    <Alert severity='success'>{t('instructorStatus.proofUploaded')}</Alert>
                  ) : (
                    <>
                      <input
                        ref={medicalInputRef}
                        type='file'
                        accept='.pdf,.jpg,.jpeg'
                        capture='environment'
                        style={{ display: 'none' }}
                        onChange={(e) =>
                          selectProofFile(e.target.files?.[0] ?? null, setMedicalFile)
                        }
                      />
                      <Button
                        variant='outlined'
                        size='small'
                        onClick={() => medicalInputRef.current?.click()}
                      >
                        {medicalFile ? medicalFile.name : t('common.chooseFile', 'Choose file')}
                      </Button>
                    </>
                  )}
                </Stack>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseDialog}>{t('instructorStatus.proofSkip')}</Button>
              {(!licenseSuccess || !medicalSuccess) && (
                <Button
                  variant='contained'
                  onClick={handleProofUpload}
                  disabled={(!licenseFile && !medicalFile) || proofUploading}
                >
                  {t('instructorStatus.proofUpload')}
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  )
}
