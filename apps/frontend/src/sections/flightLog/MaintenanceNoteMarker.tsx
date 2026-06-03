import React, { useState } from 'react'
import { Chip, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import type { MaintenanceNote } from '@backend/routes/maintenance-notes/models'
import { MaintenanceNoteDialog } from './MaintenanceNoteDialog'

interface MaintenanceNoteMarkerProps {
  note: MaintenanceNote
  onChanged: () => void
}

export const MaintenanceNoteMarker: React.FC<MaintenanceNoteMarkerProps> = ({
  note,
  onChanged,
}) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const label = `${note.description} — ${note.performedBy}`

  return (
    <>
      <Tooltip
        title={t('flightLog.maintenanceNotes.clickToView')}
        placement='top'
      >
        <Chip
          icon={<Icon icon='mdi:wrench' width={16} />}
          label={label}
          size='small'
          color={note.hilId ? 'warning' : 'default'}
          variant='outlined'
          onClick={() => setOpen(true)}
          sx={{
            maxWidth: '100%',
            cursor: 'pointer',
            my: 0.5,
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
