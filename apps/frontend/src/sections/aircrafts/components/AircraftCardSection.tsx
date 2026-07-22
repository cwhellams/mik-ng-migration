import React, { useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Tooltip,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import useApi from '../../../hooks/useApi'
import { RemoteContent } from '../../../components/RemoteContent'
import { AircraftCardListResponse } from '@backend/routes/aircraft-cards/models'
import { EditCardModal, type CardEditMode } from './EditCardModal'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { mutate } from 'swr'
import dayjs from 'dayjs'

interface AircraftCardSectionProps {
  aircraftRegistration: string
  isAdmin: boolean
}

const useAircraftCards = (aircraftRegistration: string) => {
  const params = useMemo(
    () => ({
      aircraftRegistration,
      limit: '100',
      offset: '0',
    }),
    [aircraftRegistration],
  )

  const {
    isLoading,
    data,
    error,
    mutate: refresh,
  } = useApi<AircraftCardListResponse>({
    url: 'v1/aircraft-cards',
    method: 'GET',
    params,
  })

  return {
    cards: data?.cards || [],
    total: data?.total || 0,
    isLoading,
    error,
    mutate: refresh,
  }
}

const getCardStatus = (validFrom?: string | null, validTo?: string | null) => {
  const today = dayjs().startOf('day')
  if (validTo) {
    const toDate = dayjs(validTo)
    if (toDate.isBefore(today, 'day')) return 'expired'
    if (toDate.diff(today, 'day') <= 30) return 'expiring'
  }
  if (validFrom && dayjs(validFrom).isAfter(today, 'day')) return 'future'
  return 'valid'
}

export const AircraftCardSection: React.FC<AircraftCardSectionProps> = ({
  aircraftRegistration,
  isAdmin,
}) => {
  const { t } = useTranslation()
  const { cards, isLoading, error } = useAircraftCards(aircraftRegistration)

  const [editMode, setEditMode] = useState<CardEditMode | undefined>(undefined)
  const [editCard, setEditCard] = useState<AircraftCardListResponse['cards'][number] | undefined>(
    undefined,
  )
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [cardToDelete, setCardToDelete] = useState<
    AircraftCardListResponse['cards'][number] | undefined
  >(undefined)

  const deleteApi = useApi({ url: 'v1/aircraft-cards', skipFetch: true })

  const handleAdd = () => {
    setEditCard(undefined)
    setEditMode('new')
  }

  const handleEdit = (card: AircraftCardListResponse['cards'][number]) => {
    setEditCard(card)
    setEditMode('edit')
  }

  const handleDeleteConfirm = (card: AircraftCardListResponse['cards'][number]) => {
    setCardToDelete(card)
    setDeleteConfirmOpen(true)
  }

  const handleDelete = async () => {
    if (!cardToDelete) return
    await deleteApi.mutation.trigger('DELETE', undefined, `${cardToDelete.cardId}`)
    setDeleteConfirmOpen(false)
    setCardToDelete(undefined)
    await mutate(
      (key: unknown) =>
        Array.isArray(key) && typeof key[0] === 'string' && key[0].includes('aircraft-cards'),
    )
  }

  const statusChip = (validFrom?: string | null, validTo?: string | null) => {
    const status = getCardStatus(validFrom, validTo)
    const colors: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
      valid: 'success',
      expiring: 'warning',
      expired: 'error',
      future: 'default',
    }
    const labels: Record<string, string> = {
      valid: t('aircraft.cards.status.valid', 'Valid'),
      expiring: t('aircraft.cards.status.expiring', 'Expiring Soon'),
      expired: t('aircraft.cards.status.expired', 'Expired'),
      future: t('aircraft.cards.status.future', 'Not Yet Active'),
    }
    return <Chip label={labels[status]} color={colors[status]} size='small' variant='outlined' />
  }

  return (
    <Box sx={{ position: 'relative' }}>
      <Stack
        direction='row'
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1,
        }}
      >
        <Typography
          variant='subtitle1'
          sx={{
            color: 'text.primary',
          }}
        >
          {t('aircraft.cards.title', 'Cards & Passes')}
        </Typography>
        {isAdmin && (
          <Tooltip title={t('aircraft.cards.add', 'Add Card')}>
            <IconButton size='small' color='primary' onClick={handleAdd}>
              <Icon icon='mdi:plus-circle' />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <RemoteContent isLoading={isLoading} error={error}>
        {cards.length === 0 ? (
          <Typography
            variant='body2'
            sx={{
              color: 'text.secondary',
            }}
          >
            {t('aircraft.cards.noCards', 'No cards or passes registered')}
          </Typography>
        ) : (
          <TableContainer component={Paper} variant='outlined'>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>{t('aircraft.cards.name', 'Name')}</TableCell>
                  <TableCell>{t('aircraft.cards.description', 'Description')}</TableCell>
                  <TableCell>{t('aircraft.cards.validFrom', 'Valid From')}</TableCell>
                  <TableCell>{t('aircraft.cards.validTo', 'Valid To')}</TableCell>
                  <TableCell>{t('aircraft.cards.status.label', 'Status')}</TableCell>
                  {isAdmin && (
                    <TableCell align='right'>{t('aircraft.cards.actions', 'Actions')}</TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {cards.map((card) => (
                  <TableRow key={card.cardId} hover>
                    <TableCell>
                      <Typography
                        variant='body2'
                        sx={{
                          fontWeight: 'medium',
                        }}
                      >
                        {card.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant='body2'
                        sx={{
                          color: 'text.secondary',
                        }}
                      >
                        {card.description || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2'>{card.validFrom || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='body2'>{card.validTo || '—'}</Typography>
                    </TableCell>
                    <TableCell>{statusChip(card.validFrom, card.validTo)}</TableCell>
                    {isAdmin && (
                      <TableCell align='right'>
                        <Stack
                          direction='row'
                          spacing={0.5}
                          sx={{
                            justifyContent: 'flex-end',
                          }}
                        >
                          <Tooltip title={t('general.edit', 'Edit')}>
                            <IconButton size='small' onClick={() => handleEdit(card)}>
                              <Icon icon='mdi:pencil' />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('general.delete', 'Delete')}>
                            <IconButton
                              size='small'
                              color='error'
                              onClick={() => handleDeleteConfirm(card)}
                            >
                              <Icon icon='mdi:delete' />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </RemoteContent>
      <EditCardModal
        mode={editMode}
        aircraftRegistration={aircraftRegistration}
        card={editCard}
        onClose={() => {
          setEditMode(undefined)
          setEditCard(undefined)
        }}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t('aircraft.cards.delete.title', 'Delete Card')}
        message={t('aircraft.cards.delete.confirm', 'Are you sure you want to delete this card?')}
        confirmText={t('general.delete', 'Delete')}
        cancelText={t('general.cancel', 'Cancel')}
        onConfirm={handleDelete}
        onClose={() => {
          setDeleteConfirmOpen(false)
          setCardToDelete(undefined)
        }}
        severity='error'
      />
    </Box>
  )
}
