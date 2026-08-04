import React, { useState } from 'react'
import { Chip, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import type { MaintenanceNote } from '@backend/routes/maintenance-notes/models'
import { useAircraftHil } from '../aircrafts/components/hil/useAircraftHil'
import { MaintenanceNoteDialog } from './MaintenanceNoteDialog'

interface MaintenanceNoteMarkerProps {
  note: MaintenanceNote
  onChanged: () => void
  highlighted?: boolean
}

export const MaintenanceNoteMarker: React.FC<MaintenanceNoteMarkerProps> = ({
  note,
  onChanged,
  highlighted,
}) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const { hil } = useAircraftHil(note.aircraftRegistration, true)
  const closesHil = hil.some((entry) => entry.resolvedNoteId === note.noteId)

  const label = `${note.description} — ${note.performedBy}`

  return (
    <>
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
