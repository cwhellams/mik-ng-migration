import React, { useState } from 'react'
import { Chip, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import type { Defect } from '@backend/routes/defects/models'
import { DefectDialog } from './DefectDialog'

interface DefectMarkerProps {
  defect: Defect
  aircraftRegistration: string
  onChanged: () => void
  highlighted?: boolean
}

export const DefectMarker: React.FC<DefectMarkerProps> = ({
  defect,
  aircraftRegistration,
  onChanged,
  highlighted,
}) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const color =
    defect.status === 'ACTIVE' ? 'error' : defect.status === 'MOVED_TO_HIL' ? 'warning' : 'success'

  const icon =
    defect.status === 'RESOLVED'
      ? 'mdi:alert-circle-check-outline'
      : defect.status === 'MOVED_TO_HIL'
        ? 'mdi:clipboard-list'
        : 'mdi:alert-circle-outline'

  const tooltip =
    defect.status === 'MOVED_TO_HIL'
      ? t('flightLog.defects.movedToHilTooltip')
      : t('flightLog.defects.clickToView')

  return (
    <>
      <Tooltip title={tooltip} placement='top'>
        <Chip
          id={`defect-${defect.defectId}`}
          icon={<Icon icon={icon} width={16} />}
          label={defect.description}
          size='small'
          color={color}
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

      <DefectDialog
        defect={defect}
        aircraftRegistration={aircraftRegistration}
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
