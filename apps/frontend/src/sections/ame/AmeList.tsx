import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Rating,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Title } from '../../components/Title'
import { RemoteContent } from '../../components/RemoteContent'
import useApi from '../../hooks/useApi'
import { useRoles } from '../../hooks/useRoles'
import type { AmeEntry, AmeListResponse } from '@backend/routes/ame/models'
import { AME_MEDICAL_TYPES } from '@backend/routes/ame/models'
import { AmeRemovalRequestDialog } from './AmeRemovalRequestDialog'

const MEDICAL_TYPE_LABELS: Record<string, string> = {
  EASA_CLASS_1: 'EASA Class 1',
  EASA_CLASS_2: 'EASA Class 2',
  LAPL: 'LAPL',
  FAA: 'FAA',
}

export default function AmeList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isAmeUser } = useRoles()

  const [medicalType, setMedicalType] = useState('')
  const [sort, setSort] = useState<'report_date_desc' | 'price_asc'>('report_date_desc')
  const [removalDialogEntry, setRemovalDialogEntry] = useState<AmeEntry | null>(null)

  const { data, isLoading, error, mutate } = useApi<AmeListResponse>({
    url: 'v1/ame',
    params: {
      medicalType: medicalType || undefined,
      sort,
    },
  })

  const { mutation } = useApi({ url: 'v1/ame', skipFetch: true })

  const handleRate = async (entry: AmeEntry, stars: number) => {
    await mutation.trigger('POST', { stars }, `${entry.id}/rating`)
    mutate()
  }

  return (
    <Box>
      <Title label={t('header.ameList')} />

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size='small' sx={{ minWidth: 180 }}>
          <InputLabel>Medical type</InputLabel>
          <Select
            value={medicalType}
            label='Medical type'
            onChange={(e) => setMedicalType(e.target.value)}
          >
            <MenuItem value=''>All types</MenuItem>
            {AME_MEDICAL_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {MEDICAL_TYPE_LABELS[t]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size='small' sx={{ minWidth: 180 }}>
          <InputLabel>Sort by</InputLabel>
          <Select
            value={sort}
            label='Sort by'
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <MenuItem value='report_date_desc'>Newest report first</MenuItem>
            <MenuItem value='price_asc'>Price (low to high)</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ flex: 1 }} />

        {isAmeUser && (
          <Button
            variant='contained'
            startIcon={<Icon icon='mdi:plus' />}
            onClick={() => navigate('/club/ame-list/new')}
          >
            Submit recommendation
          </Button>
        )}
      </Box>

      <RemoteContent isLoading={isLoading} error={error}>
        {data?.entries.length === 0 ? (
          <Typography color='text.secondary'>No AME entries found.</Typography>
        ) : (
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Medical Centre</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Medical Types</TableCell>
                <TableCell>Price (€)</TableCell>
                <TableCell>Report Date</TableCell>
                <TableCell>Rating</TableCell>
                <TableCell>Added</TableCell>
                <TableCell>Updated</TableCell>
                {isAmeUser && <TableCell>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {data?.entries.map((entry) => (
                <TableRow key={entry.id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }}>{entry.name}</Typography>
                    {entry.notes && (
                      <Typography variant='caption' color='text.secondary'>
                        {entry.notes}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{entry.medicalCentre}</TableCell>
                  <TableCell>{entry.location}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {entry.medicalTypes.map((mt) => (
                        <Chip
                          key={mt}
                          label={MEDICAL_TYPE_LABELS[mt] ?? mt}
                          size='small'
                          variant='outlined'
                        />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>{entry.price != null ? `€${entry.price.toFixed(0)}` : '—'}</TableCell>
                  <TableCell>{entry.reportDate}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Rating
                          value={entry.averageRating ?? 0}
                          precision={0.5}
                          readOnly
                          size='small'
                        />
                        <Typography variant='caption' color='text.secondary'>
                          ({entry.ratingCount})
                        </Typography>
                      </Box>
                      {isAmeUser && (
                        <Rating
                          value={entry.myRating ?? 0}
                          size='small'
                          onChange={(_e, value) => {
                            if (value) void handleRate(entry, value)
                          }}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>{dayjs(entry.createdAt).format('DD.MM.YYYY')}</TableCell>
                  <TableCell>{dayjs(entry.updatedAt).format('DD.MM.YYYY')}</TableCell>
                  {isAmeUser && (
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title='Suggest edit'>
                          <IconButton
                            size='small'
                            onClick={() => navigate(`/club/ame-list/${entry.id}/edit`)}
                          >
                            <Icon icon='mdi:pencil' />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title='Request removal'>
                          <IconButton size='small' onClick={() => setRemovalDialogEntry(entry)}>
                            <Icon icon='mdi:delete-outline' />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </RemoteContent>

      <AmeRemovalRequestDialog
        entry={removalDialogEntry}
        onClose={() => setRemovalDialogEntry(null)}
        onSubmitted={() => {
          setRemovalDialogEntry(null)
          mutate()
        }}
      />
    </Box>
  )
}
