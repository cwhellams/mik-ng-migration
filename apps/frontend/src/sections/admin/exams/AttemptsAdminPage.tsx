import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Title } from '../../../components/Title'
import useApi from '../../../hooks/useApi'
import { RemoteContent } from '../../../components/RemoteContent'
import type { AttemptListResponse } from '@backend/routes/exams/models'
import dayjs from 'dayjs'

export default function AttemptsAdminPage() {
  const { t } = useTranslation()
  const [status, setStatus] = useState('')
  const [memberId, setMemberId] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (memberId.trim()) params.set('memberId', memberId.trim())
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))

  const { data, isLoading, error } = useApi<AttemptListResponse>({
    url: `v1/exams/admin/attempts?${params.toString()}`,
  })

  const statusColor = (s: string) => {
    if (s === 'GRADED') return 'default' as const
    if (s === 'IN_PROGRESS') return 'warning' as const
    if (s === 'ABANDONED') return 'error' as const
    return 'default' as const
  }

  return (
    <Box>
      <Button
        component={Link}
        to='/admin/exams'
        startIcon={<Icon icon='mdi:arrow-left' />}
        sx={{ mb: 2 }}
      >
        {t('exams.admin.title')}
      </Button>
      <Title label={t('exams.admin.attempts')} />

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size='small' sx={{ minWidth: 160 }}>
          <InputLabel>{t('common.status')}</InputLabel>
          <Select
            value={status}
            label={t('common.status')}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <MenuItem value=''>{t('common.all')}</MenuItem>
            <MenuItem value='IN_PROGRESS'>IN_PROGRESS</MenuItem>
            <MenuItem value='GRADED'>GRADED</MenuItem>
            <MenuItem value='ABANDONED'>ABANDONED</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size='small'
          label={t('exams.admin.memberId')}
          value={memberId}
          onChange={(e) => {
            setMemberId(e.target.value)
            setPage(1)
          }}
        />
      </Box>

      <RemoteContent isLoading={isLoading} error={error}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>{t('exams.admin.memberId')}</TableCell>
              <TableCell>{t('exams.date')}</TableCell>
              <TableCell>{t('common.status')}</TableCell>
              <TableCell>{t('exams.score')}</TableCell>
              <TableCell>{t('exams.result')}</TableCell>
              <TableCell>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data?.items ?? []).map((attempt) => (
              <TableRow key={attempt.attemptId}>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {attempt.attemptId}
                </TableCell>
                <TableCell>{attempt.memberId}</TableCell>
                <TableCell>{dayjs(attempt.createdAt).format('DD.MM.YYYY HH:mm')}</TableCell>
                <TableCell>
                  <Chip label={attempt.status} size='small' color={statusColor(attempt.status)} />
                </TableCell>
                <TableCell>
                  {attempt.scorePercent != null ? `${attempt.scorePercent.toFixed(1)}%` : '—'}
                </TableCell>
                <TableCell>
                  {attempt.passed === true && (
                    <Chip label={t('exams.passed')} color='success' size='small' />
                  )}
                  {attempt.passed === false && (
                    <Chip label={t('exams.failed')} color='error' size='small' />
                  )}
                  {attempt.passed == null && '—'}
                </TableCell>
                <TableCell>
                  {attempt.status === 'GRADED' && (
                    <Button
                      component={Link}
                      to={`/exams/review/${attempt.attemptId}`}
                      size='small'
                      startIcon={<Icon icon='mdi:eye' />}
                    >
                      {t('common.view')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data && data.total > pageSize && (
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 2 }}>
            <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <Icon icon='mdi:chevron-left' />
            </Button>
            <Button disabled={page * pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>
              <Icon icon='mdi:chevron-right' />
            </Button>
          </Box>
        )}
      </RemoteContent>
    </Box>
  )
}
