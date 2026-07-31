import { useState } from 'react'
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  Chip,
  Button,
  IconButton,
  Paper,
  Stack,
  Alert,
  CircularProgress,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { useTranslation } from 'react-i18next'
import Papa from 'papaparse'
import useApi, { sharedApi } from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { Title } from '../../components/Title'
import { Link } from 'react-router-dom'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import dayjs, { type Dayjs } from 'dayjs'
import type {
  InstructorStatusListResponse,
  InstructorStatusSummary,
  InstructorQualificationHistory,
} from '@backend/routes/instructor-qualifications/models'
import { useRoles } from '../../hooks/useRoles'
import EasaLogo from '../../assets/easa-logo.png'

const EXPIRING_DAYS_THRESHOLD = 30

// Fields that use the LICENSE proof category
const LICENSE_FIELDS = new Set(['fiExpiry', 'iriExpiry', 'criExpiry', 'sepExpiry'])

type QualField = keyof Pick<
  InstructorStatusSummary,
  | 'fiExpiry'
  | 'iriExpiry'
  | 'criExpiry'
  | 'sepExpiry'
  | 'medicalClass1Expiry'
  | 'medicalClass2Expiry'
  | 'medicalLaplExpiry'
>

function getProofId(
  instructor: InstructorStatusSummary,
  field: QualField,
): number | null | undefined {
  return LICENSE_FIELDS.has(field) ? instructor.licenseProofId : instructor.medicalProofId
}

const InstructorStatus = () => {
  const { t } = useTranslation()
  const { isMembersAdmin } = useRoles()

  // Audit date picker state
  const [auditDate, setAuditDate] = useState<Dayjs | null>(null)
  const [auditData, setAuditData] = useState<InstructorStatusSummary[] | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)

  // Track which proof cell is currently being opened (memberId:field)
  const [openingProof, setOpeningProof] = useState<string | null>(null)

  // History panel state
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(null)
  const [historyData, setHistoryData] = useState<InstructorQualificationHistory[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const { data, isLoading, error } = useApi<InstructorStatusListResponse>({
    url: 'v1/instructor-qualifications',
  })

  const displayInstructors = auditData ?? data?.instructors

  const handleSelectInstructor = async (instructor: InstructorStatusSummary) => {
    if (selectedInstructorId === instructor.memberId) {
      setSelectedInstructorId(null)
      setHistoryData(null)
      return
    }
    setSelectedInstructorId(instructor.memberId)
    setHistoryData(null)
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const res = await sharedApi.get<InstructorQualificationHistory[]>(
        `v1/instructor-qualifications/${instructor.memberId}/history`,
      )
      setHistoryData(res.data)
    } catch {
      setHistoryError(t('instructorStatus.auditError'))
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleProofClick = async (instructor: InstructorStatusSummary, field: QualField) => {
    const proofId = getProofId(instructor, field)
    if (!proofId) return

    const key = `${instructor.memberId}:${field}`
    setOpeningProof(key)
    try {
      const res = await sharedApi.get<{ url: string }>(
        `v1/instructor-qualifications/${instructor.memberId}/proof/${proofId}/download`,
      )
      window.open(res.data.url, '_blank', 'noopener,noreferrer')
    } catch {
      // silently ignore — the cell stays clickable
    } finally {
      setOpeningProof(null)
    }
  }

  const renderDateCell = (
    dateStr: string | null | undefined,
    instructor: InstructorStatusSummary,
    field: QualField,
    referenceDate?: Dayjs,
  ) => {
    const proofId = getProofId(instructor, field)
    const hasProof = Boolean(proofId)
    const key = `${instructor.memberId}:${field}`
    const isOpening = openingProof === key

    const chipSx = hasProof ? { cursor: 'pointer', textDecoration: 'underline dotted' } : {}

    const wrapWithProof = (node: React.ReactNode) => {
      if (!hasProof) return <>{node}</>
      return (
        <Tooltip title={t('instructorStatus.openProof')} placement='top'>
          <Box
            component='span'
            onClick={() => handleProofClick(instructor, field)}
            sx={{
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            {isOpening ? <CircularProgress size={12} /> : node}
          </Box>
        </Tooltip>
      )
    }

    if (!dateStr) {
      return (
        <Typography
          variant='body2'
          sx={{
            color: 'text.disabled',
          }}
        >
          {t('instructorStatus.notHeld')}
        </Typography>
      )
    }

    const expiry = dayjs(dateStr)
    const now = referenceDate ?? dayjs()
    const isExpired = expiry.isBefore(now, 'day')
    const isExpiring = !isExpired && expiry.diff(now, 'day') <= EXPIRING_DAYS_THRESHOLD

    if (isExpired) {
      return wrapWithProof(
        <Tooltip title={t('instructorStatus.expired')}>
          <Chip
            label={expiry.format('DD.MM.YYYY')}
            size='small'
            color='error'
            variant='outlined'
            clickable={hasProof}
            sx={chipSx}
          />
        </Tooltip>,
      )
    }

    if (isExpiring) {
      return wrapWithProof(
        <Tooltip title={t('instructorStatus.expiringWarning')}>
          <Chip
            label={expiry.format('DD.MM.YYYY')}
            size='small'
            color='warning'
            variant='outlined'
            clickable={hasProof}
            sx={chipSx}
          />
        </Tooltip>,
      )
    }

    return wrapWithProof(
      <Typography
        variant='body2'
        sx={hasProof ? { textDecoration: 'underline dotted', cursor: 'pointer' } : undefined}
      >
        {expiry.format('DD.MM.YYYY')}
      </Typography>,
    )
  }

  const handleAuditLookup = async () => {
    if (!auditDate?.isValid()) return
    setAuditLoading(true)
    setAuditError(null)
    setAuditData(null)
    try {
      const dateStr = auditDate.format('YYYY-MM-DD')
      const response = await sharedApi.get<InstructorStatusListResponse>(
        `v1/instructor-qualifications?date=${dateStr}`,
      )
      setAuditData(response.data.instructors)
    } catch {
      setAuditError(t('instructorStatus.auditError'))
    } finally {
      setAuditLoading(false)
    }
  }

  const handleClearAudit = () => {
    setAuditDate(null)
    setAuditData(null)
    setAuditError(null)
  }

  const selectedInstructor =
    displayInstructors?.find((i) => i.memberId === selectedInstructorId) ?? null

  const handleExportHistory = () => {
    if (!historyData || !selectedInstructor) return
    const dateLabel = dayjs().format('YYYY-MM-DD')
    const headers = [
      t('instructorStatus.changedAt'),
      t('instructorStatus.changedBy'),
      t('instructorStatus.fi'),
      t('instructorStatus.iri'),
      t('instructorStatus.cri'),
      t('instructorStatus.sep'),
      t('instructorStatus.medClass1'),
      t('instructorStatus.medClass2'),
      t('instructorStatus.medLapl'),
    ]
    const formatDate = (d: string | null | undefined) => (d ? dayjs(d).format('DD.MM.YYYY') : '–')
    const rows = historyData.map((h) => [
      dayjs(h.changedAt).format('DD.MM.YYYY HH:mm'),
      h.changedBy,
      formatDate(h.fiExpiry),
      formatDate(h.iriExpiry),
      formatDate(h.criExpiry),
      formatDate(h.sepExpiry),
      formatDate(h.medicalClass1Expiry),
      formatDate(h.medicalClass2Expiry),
      formatDate(h.medicalLaplExpiry),
    ])
    const csv = Papa.unparse({ fields: headers, data: rows })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `instructor-history-${selectedInstructor.lastName}-${selectedInstructor.firstName}-${dateLabel}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleExport = () => {
    if (!displayInstructors) return

    const dateLabel =
      auditData && auditDate ? auditDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')

    const headers = [
      t('instructorStatus.name'),
      t('instructorStatus.fi'),
      t('instructorStatus.iri'),
      t('instructorStatus.cri'),
      t('instructorStatus.sep'),
      t('instructorStatus.medClass1'),
      t('instructorStatus.medClass2'),
      t('instructorStatus.medLapl'),
    ]

    const formatDate = (d: string | null | undefined) => (d ? dayjs(d).format('DD.MM.YYYY') : '–')

    const rows = displayInstructors.map((i) => [
      `${i.lastName} ${i.firstName}`,
      formatDate(i.fiExpiry),
      formatDate(i.iriExpiry),
      formatDate(i.criExpiry),
      formatDate(i.sepExpiry),
      formatDate(i.medicalClass1Expiry),
      formatDate(i.medicalClass2Expiry),
      formatDate(i.medicalLaplExpiry),
    ])

    const csv = Papa.unparse({ fields: headers, data: rows })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `instructor-status-${dateLabel}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const columnHeaders = [
    {
      key: 'fiExpiry' as QualField,
      label: t('instructorStatus.fi'),
      tooltip: t('instructorStatus.fiTooltip'),
    },
    {
      key: 'iriExpiry' as QualField,
      label: t('instructorStatus.iri'),
      tooltip: t('instructorStatus.iriTooltip'),
    },
    {
      key: 'criExpiry' as QualField,
      label: t('instructorStatus.cri'),
      tooltip: t('instructorStatus.criTooltip'),
    },
    {
      key: 'sepExpiry' as QualField,
      label: t('instructorStatus.sep'),
      tooltip: t('instructorStatus.sepTooltip'),
    },
    {
      key: 'medicalClass1Expiry' as QualField,
      label: t('instructorStatus.medClass1'),
      tooltip: t('instructorStatus.medClass1Tooltip'),
    },
    {
      key: 'medicalClass2Expiry' as QualField,
      label: t('instructorStatus.medClass2'),
      tooltip: t('instructorStatus.medClass2Tooltip'),
    },
    {
      key: 'medicalLaplExpiry' as QualField,
      label: t('instructorStatus.medLapl'),
      tooltip: t('instructorStatus.medLaplTooltip'),
    },
  ]

  return (
    <Box>
      <Title label={t('instructorStatus.title')}>
        {isMembersAdmin && (
          <Button variant='outlined' size='small' onClick={handleExport}>
            {t('instructorStatus.export')}
          </Button>
        )}
      </Title>
      <Box
        sx={{
          mb: 2,
        }}
      >
        <Box
          component='img'
          src={EasaLogo}
          alt='EASA'
          sx={{ height: 32, display: 'block', mb: 1 }}
        />
        <Typography
          variant='body2'
          sx={{
            color: 'text.secondary',
          }}
        >
          {t('instructorStatus.subtitle')}
        </Typography>
      </Box>
      {/* Audit date picker — admin only */}
      {isMembersAdmin && (
        <Box
          sx={{
            mb: 3,
            p: 2,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          <Typography variant='subtitle2' gutterBottom>
            {t('instructorStatus.auditTitle')}
          </Typography>
          <Typography
            variant='body2'
            sx={{
              color: 'text.secondary',
              mb: 2,
            }}
          >
            {t('instructorStatus.auditSubtitle')}
          </Typography>
          <Stack
            direction='row'
            spacing={2}
            sx={{
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <DatePicker
              label={t('instructorStatus.auditDate')}
              value={auditDate}
              onChange={setAuditDate}
              disableFuture
              slotProps={{ textField: { size: 'small' } }}
            />
            <Button
              variant='contained'
              onClick={handleAuditLookup}
              disabled={!auditDate?.isValid() || auditLoading}
            >
              {t('instructorStatus.auditLookup')}
            </Button>
            {auditData && (
              <Button variant='outlined' size='small' onClick={handleClearAudit}>
                {t('instructorStatus.auditClear')}
              </Button>
            )}
          </Stack>
          {auditError && (
            <Alert severity='error' sx={{ mt: 2 }}>
              {auditError}
            </Alert>
          )}
          {auditData && auditDate && (
            <Alert severity='info' sx={{ mt: 2 }}>
              {t('instructorStatus.auditViewingDate', {
                date: auditDate.format('DD.MM.YYYY'),
              })}
            </Alert>
          )}
        </Box>
      )}
      <RemoteContent isLoading={isLoading || auditLoading} error={error}>
        {displayInstructors && (
          <Typography
            variant='body2'
            sx={{
              mb: 1,
            }}
          >
            {t('instructorStatus.count', { count: displayInstructors.length })}
          </Typography>
        )}

        {!displayInstructors?.length ? (
          <Typography
            variant='body2'
            sx={{
              color: 'text.secondary',
            }}
          >
            {t('instructorStatus.noInstructors')}
          </Typography>
        ) : (
          <TableContainer component={Paper} variant='outlined'>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>{t('instructorStatus.name')}</TableCell>
                  {columnHeaders.map((col) => (
                    <TableCell key={col.key} align='center' sx={{ fontWeight: 600 }}>
                      <Tooltip title={col.tooltip} placement='top'>
                        <span>{col.label}</span>
                      </Tooltip>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {displayInstructors.map((instructor) => (
                  <TableRow key={instructor.memberId} hover>
                    <TableCell>
                      {isMembersAdmin ? (
                        <Stack
                          direction='row'
                          spacing={0.5}
                          sx={{
                            alignItems: 'center',
                          }}
                        >
                          <Button
                            variant='text'
                            size='small'
                            onClick={() => handleSelectInstructor(instructor)}
                            sx={{
                              p: 0,
                              minWidth: 0,
                              textTransform: 'none',
                              fontWeight: selectedInstructorId === instructor.memberId ? 700 : 400,
                            }}
                          >
                            {instructor.lastName} {instructor.firstName}
                          </Button>
                          <Tooltip title={t('instructorStatus.viewProfile')} placement='top'>
                            <IconButton
                              component={Link}
                              to={`/club/members/${instructor.memberId}`}
                              size='small'
                              sx={{ p: 0.25, color: 'text.secondary' }}
                            >
                              <OpenInNewIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      ) : (
                        `${instructor.lastName} ${instructor.firstName}`
                      )}
                    </TableCell>
                    {columnHeaders.map((col) => (
                      <TableCell key={col.key} align='center'>
                        {renderDateCell(
                          instructor[col.key],
                          instructor,
                          col.key,
                          auditDate ?? undefined,
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </RemoteContent>
      {/* History panel — shown when an instructor row is selected */}
      {isMembersAdmin && selectedInstructorId && (
        <Box
          sx={{
            mt: 3,
          }}
        >
          <Stack
            direction='row'
            sx={{
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 1,
            }}
          >
            <Typography
              variant='subtitle1'
              sx={{
                fontWeight: 600,
              }}
            >
              {t('instructorStatus.history')} —{' '}
              {selectedInstructor
                ? `${selectedInstructor.lastName} ${selectedInstructor.firstName}`
                : selectedInstructorId}
            </Typography>
            <Stack direction='row' spacing={1}>
              {historyData && historyData.length > 0 && (
                <Button variant='outlined' size='small' onClick={handleExportHistory}>
                  {t('instructorStatus.export')}
                </Button>
              )}
              <Button
                variant='outlined'
                size='small'
                onClick={() => {
                  setSelectedInstructorId(null)
                  setHistoryData(null)
                }}
              >
                {t('instructorStatus.historyClose')}
              </Button>
            </Stack>
          </Stack>

          {historyLoading && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                py: 2,
              }}
            >
              <CircularProgress size={24} />
            </Box>
          )}
          {historyError && (
            <Alert severity='error' sx={{ mb: 1 }}>
              {historyError}
            </Alert>
          )}
          {historyData &&
            (historyData.length === 0 ? (
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                }}
              >
                {t('instructorStatus.noHistory')}
              </Typography>
            ) : (
              <TableContainer component={Paper} variant='outlined'>
                <Table size='small'>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {t('instructorStatus.changedAt')}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {t('instructorStatus.changedBy')}
                      </TableCell>
                      {columnHeaders.map((col) => (
                        <TableCell key={col.key} align='center' sx={{ fontWeight: 600 }}>
                          <Tooltip title={col.tooltip} placement='top'>
                            <span>{col.label}</span>
                          </Tooltip>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {historyData.map((h) => (
                      <TableRow key={h.historyId}>
                        <TableCell>{dayjs(h.changedAt).format('DD.MM.YYYY HH:mm')}</TableCell>
                        <TableCell>{h.changedBy}</TableCell>
                        {columnHeaders.map((col) => (
                          <TableCell key={col.key} align='center'>
                            {h[col.key] ? (
                              dayjs(h[col.key]).format('DD.MM.YYYY')
                            ) : (
                              <Typography
                                variant='body2'
                                sx={{
                                  color: 'text.disabled',
                                }}
                              >
                                {t('instructorStatus.notHeld')}
                              </Typography>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ))}
        </Box>
      )}
    </Box>
  )
}

export default InstructorStatus
