import React, { useState } from 'react'
import { Box, Chip, Tooltip, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import type { MaintenanceNote } from '@mik/contracts/maintenance-notes'
import { useAircraftHil } from '../aircrafts/components/hil/useAircraftHil'
import { useTimezone } from '../../hooks/useTimezone'
import { MaintenanceNoteDialog } from './MaintenanceNoteDialog'

interface MaintenanceNoteMarkerProps {
  note: MaintenanceNote
  onChanged: () => void
  highlighted?: boolean
  /** Anchor flight's date, shown next to the marker when it renders on its own row. */
  flightDate?: string | null
}

export const MaintenanceNoteMarker: React.FC<MaintenanceNoteMarkerProps> = ({
  note,
  onChanged,
  highlighted,
  flightDate,
}) => {
  const { t } = useTranslation()
  const { formatDate } = useTimezone()
  const [open, setOpen] = useState(false)

  const { hil } = useAircraftHil(note.aircraftRegistration, true)
  const closesHil = hil.some((entry) => entry.resolvedNoteId === note.noteId)

  const label = `${note.description} — ${note.performedBy}`

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {flightDate && (
          <Typography variant='caption' sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {formatDate(flightDate)}
          </Typography>
        )}
        <Tooltip title={t('flightLog.maintenanceNotes.clickToView')} placement='top'>
          <Chip
            id={`note-${note.noteId}`}
            icon={<Icon icon='mdi:wrench' width={16} />}
            label={label}
            size='small'
            color={closesHil ? 'warning' : 'default'}
            variant='outlined'
            onClick={() => setOpen(true)}
            sx={{
              maxWidth: '100%',
              cursor: 'pointer',
              my: 0.5,
              ...(highlighted && {
                outline: (theme) => `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 1,
              }),
              '& .MuiChip-label': {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            }}
          />
        </Tooltip>
      </Box>

      <MaintenanceNoteDialog
        note={note}
        open={open}
        onClose={() => setOpen(false)}
        onChanged={() => {
          setOpen(false)
          onChanged()
        }}
      />
    </>
  )
}
