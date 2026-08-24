import React, { useEffect, useState } from 'react'
import {
  Box,
  Chip,
  Divider,
  FormControlLabel,
  Link,
  Paper,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import type { AircraftHilDetail } from '@mik/contracts/aircraft-hil'
import type { AjlbListResponse } from '@mik/contracts/ajlb'
import { EditButton } from '@mik/ui/components/EditButton'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import useApi from '@mik/ui/hooks/useApi'
import { AddHilExtensionModal } from './AddHilExtensionModal'
import { EditHilModal, type HilEditMode } from './EditHilModal'
import { HilAuditDialog } from './HilAuditDialog'
import { useAircraftHil } from './useAircraftHil'
import { useOpenDefectLink } from './useOpenDefectLink'

interface AircraftHilSectionProps {
  aircraftRegistration: string
  /** FLIGHTLOG_ADMIN — plane captains maintain the hold item list */
  canEdit: boolean
  /** Hold item to scroll to, e.g. when arriving from a flight-log defect */
  highlightHilId?: string
}

const formatDate = (isoDate: string) => dayjs(isoDate).format('DD.MM.YYYY')

const HilEntry = ({
  hil,
  canEdit,
  highlighted,
  onEdit,
  onAddExtension,
  onShowAudit,
  onCreateNote,
}: {
  hil: AircraftHilDetail
  canEdit: boolean
  highlighted: boolean
  onEdit: () => void
  onAddExtension: () => void
  onShowAudit: () => void
  onCreateNote: () => void
}) => {
  const { t } = useTranslation()
  const handleOpenDefect = useOpenDefectLink(hil.aircraftRegistration)

  const isExtended = hil.dueDate !== null && hil.effectiveDueDate !== hil.dueDate
  const isResolved = !!hil.resolvedNoteId

  return (
    <Paper
      variant='outlined'
      id={`hil-${hil.hilId}`}
      sx={{
        p: 2,
        borderColor: highlighted ? 'primary.main' : hil.isOverdue ? 'error.main' : 'divider',
        borderWidth: highlighted || hil.isOverdue ? 2 : 1,
      }}
    >
      <Stack spacing={1}>
        <Stack direction='row' spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip size='small' label={`HIL #${hil.hilNumber}`} />
          {hil.defectCat && (
            <Chip
              size='small'
              variant='outlined'
              label={t('aircraft.hil.categoryChip', { defectCat: hil.defectCat })}
            />
          )}
          {hil.isOverdue && (
            <Chip
              size='small'
              color='error'
              icon={<Icon icon='mdi:clock-alert' width={16} />}
              label={t('aircraft.hil.overdue')}
            />
          )}
          {isResolved && (
            <Chip
              size='small'
              color='success'
              variant='outlined'
              icon={<Icon icon='mdi:check-circle' width={16} />}
              label={t('aircraft.hil.resolved')}
            />
          )}
          {canEdit && (
            <Stack direction='row' sx={{ ml: 'auto' }}>
              {!isResolved && (
                <>
                  {/* With no due date there is nothing to extend (issue #1120) */}
                  {hil.extensions.length === 0 && hil.dueDate && (
                    <EditButton
                      title={t('aircraft.hil.addExtension')}
                      icon='mdi:calendar-plus'
                      onClick={onAddExtension}
                    />
                  )}
                  <EditButton
                    title={t('aircraft.hil.createNoteToClose')}
                    icon='mdi:wrench-clock'
                    onClick={onCreateNote}
                  />
                </>
              )}
              <EditButton title={t('aircraft.hil.edit')} icon='mdi:pencil' onClick={onEdit} />
              <EditButton
                title={t('aircraft.hil.auditButton')}
                icon='mdi:history'
                onClick={onShowAudit}
              />
            </Stack>
          )}
        </Stack>

        <Typography variant='subtitle1'>{hil.description}</Typography>

        <Box>
          <Typography variant='caption' sx={{ color: 'text.secondary' }}>
            {t('aircraft.hil.restrictions')}
          </Typography>
          <Typography variant='body2' sx={{ fontWeight: hil.restrictions ? 'medium' : undefined }}>
            {hil.restrictions || t('aircraft.hil.noRestrictions')}
          </Typography>
        </Box>

        <Stack direction='row' spacing={3} sx={{ flexWrap: 'wrap' }}>
          <Box>
            <Typography variant='caption' sx={{ color: 'text.secondary', display: 'block' }}>
              {t('aircraft.hil.openDate')}
            </Typography>
            <Typography variant='body2'>{formatDate(hil.openDate)}</Typography>
          </Box>
          <Box>
            <Typography variant='caption' sx={{ color: 'text.secondary', display: 'block' }}>
              {t('aircraft.hil.originalDueDate')}
            </Typography>
            <Typography
              variant='body2'
              sx={{
                textDecoration: isExtended ? 'line-through' : undefined,
                color: hil.dueDate ? undefined : 'text.secondary',
              }}
            >
              {hil.dueDate ? formatDate(hil.dueDate) : t('aircraft.hil.noDueDate')}
            </Typography>
          </Box>
          {isExtended && hil.effectiveDueDate && (
            <Box>
              <Typography variant='caption' sx={{ color: 'text.secondary', display: 'block' }}>
                {t('aircraft.hil.extendedDueDate')}
              </Typography>
              <Typography
                variant='body2'
                sx={{ color: hil.isOverdue ? 'error.main' : 'text.primary', fontWeight: 'medium' }}
              >
                {formatDate(hil.effectiveDueDate)}
              </Typography>
            </Box>
          )}
          <Box>
            <Typography variant='caption' sx={{ color: 'text.secondary', display: 'block' }}>
              {t('aircraft.hil.name')}
            </Typography>
            <Typography variant='body2'>{hil.name}</Typography>
          </Box>
        </Stack>

        {hil.extensions.length > 0 && (
          <Box>
            <Typography variant='caption' sx={{ color: 'text.secondary' }}>
              {t('aircraft.hil.extensionHistory')}
            </Typography>
            {hil.extensions.map((extension) => (
              <Typography key={extension.extensionId} variant='body2'>
                {t('aircraft.hil.extensionRow', {
                  date: formatDate(extension.extensionDate),
                  due: formatDate(extension.extensionDue),
                  name: extension.name,
                })}
              </Typography>
            ))}
          </Box>
        )}

        <Divider />

        <Box>
          {hil.sourceRef && (
            <>
              <Typography variant='caption' sx={{ color: 'text.secondary', display: 'block' }}>
                {t('aircraft.hil.sourceRef')}
              </Typography>
              <Typography variant='body2'>{hil.sourceRef}</Typography>
            </>
          )}
          {hil.defects.map((defect) => (
            <Link
              key={defect.defectId}
              component='button'
              type='button'
              onClick={() => handleOpenDefect(defect)}
              variant='body2'
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, textAlign: 'left' }}
            >
              <Icon icon='mdi:book-open-page-variant' width={16} />
              {t('aircraft.hil.openLogbook', {
                ajlbSeqNo: defect.ajlbSeqNo,
                description: defect.description,
              })}
            </Link>
          ))}
        </Box>
      </Stack>
    </Paper>
  )
}

export const AircraftHilSection: React.FC<AircraftHilSectionProps> = ({
  aircraftRegistration,
  canEdit,
  highlightHilId,
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showResolved, setShowResolved] = useState(false)

  const { fetch: fetchAjlb } = useApi<AjlbListResponse>({
    url: 'v1/ajlb',
    skipFetch: true,
  })

  // Maintenance notes live on a specific logbook page, so hand off to the
  // aircraft's current one and let it open the note dialog for this item.
  const handleCreateNote = async (hilId: string) => {
    const { data } = await fetchAjlb.trigger('GET', { aircraftRegistration, current: 'true' })
    const seqNo = data?.books[0]?.seqNo
    if (seqNo === undefined) return
    navigate(`/logs/books/${aircraftRegistration}/${seqNo}?closeHil=${hilId}`)
  }

  const { hil, isLoading, error } = useAircraftHil(aircraftRegistration, showResolved)

  // Bring the deep-linked hold item into view once the list has loaded
  useEffect(() => {
    if (!highlightHilId || !hil.some((entry) => entry.hilId === highlightHilId)) return
    document
      .getElementById(`hil-${highlightHilId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightHilId, hil])

  const [editMode, setEditMode] = useState<HilEditMode | undefined>()
  const [editHil, setEditHil] = useState<AircraftHilDetail | undefined>()
  const [extensionHil, setExtensionHil] = useState<AircraftHilDetail | undefined>()
  const [auditHil, setAuditHil] = useState<AircraftHilDetail | undefined>()

  return (
    <Box sx={{ flex: 1 }}>
      <RemoteContent isLoading={isLoading} error={error}>
        <Stack spacing={2}>
          <Stack direction='row' spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant='subtitle1'>{t('aircraft.hil.title')}</Typography>
            <FormControlLabel
              sx={{ ml: 'auto' }}
              control={
                <Switch
                  size='small'
                  checked={showResolved}
                  onChange={(e) => setShowResolved(e.target.checked)}
                />
              }
              label={t('aircraft.hil.showResolved')}
            />
            {canEdit && (
              <EditButton
                title={t('aircraft.hil.add')}
                icon='mdi:plus'
                onClick={() => {
                  setEditHil(undefined)
                  setEditMode('new')
                }}
              />
            )}
          </Stack>

          {hil.length === 0 ? (
            <Typography sx={{ color: 'text.secondary' }}>{t('aircraft.hil.noItems')}</Typography>
          ) : (
            hil.map((entry) => (
              <HilEntry
                key={entry.hilId}
                hil={entry}
                canEdit={canEdit}
                highlighted={entry.hilId === highlightHilId}
                onEdit={() => {
                  setEditHil(entry)
                  setEditMode('edit')
                }}
                onAddExtension={() => setExtensionHil(entry)}
                onShowAudit={() => setAuditHil(entry)}
                onCreateNote={() => handleCreateNote(entry.hilId)}
              />
            ))
          )}
        </Stack>
      </RemoteContent>

      <EditHilModal
        mode={editMode}
        aircraftRegistration={aircraftRegistration}
        hil={editHil}
        onClose={() => {
          setEditMode(undefined)
          setEditHil(undefined)
        }}
      />
      <AddHilExtensionModal hil={extensionHil} onClose={() => setExtensionHil(undefined)} />
      <HilAuditDialog hil={auditHil} onClose={() => setAuditHil(undefined)} />
    </Box>
  )
}
