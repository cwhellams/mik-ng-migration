import React from 'react'
import { Chip, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import type { Remark } from '@mik/contracts/remarks'

interface RemarkMarkerProps {
  remark: Remark
}

// Purely informational, unlike DefectMarker/MaintenanceNoteMarker: a remark has no
// status and nothing to resolve, so this is a plain neutral chip -- no warning color,
// no click-through dialog, just the description on hover for anything the label
// itself truncates.
export const RemarkMarker: React.FC<RemarkMarkerProps> = ({ remark }) => (
  <Tooltip title={remark.description} placement='top'>
    <Chip
      id={`remark-${remark.remarkId}`}
      icon={<Icon icon='mdi:comment-text-outline' width={16} />}
      label={remark.description}
      size='small'
      color='default'
      variant='outlined'
      sx={{
        maxWidth: '100%',
        my: 0.5,
        '& .MuiChip-label': {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
      }}
    />
  </Tooltip>
)
