import React from 'react'
import { Box, Link } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import type { HilLinkedDefect } from '@mik/contracts/aircraft-hil'

interface OpenDefectLinkProps {
  defect: HilLinkedDefect
  onClick: () => void
  /**
   * Where the link is rendered. `banner` is the grounding Alert, which is
   * filled — so the link takes the banner's colour — and stacks its lines
   * flush; `list` is a hold item's own entry, which needs the gap above.
   */
  context?: 'list' | 'banner'
}

/**
 * Link from a hold item — or from the grounding banner — to the journey log book
 * page the defect was raised on. Shared by AircraftHilSection and
 * AircraftGroundedAlert, which render the same link from the same translation.
 *
 * A defect description may run to 2000 characters, so the label is clamped to
 * one line with an ellipsis (issue #1255). The fly page is used from a phone on
 * the apron, where a long snag description would otherwise push the rest of the
 * card off screen. The full text stays available as the link's tooltip.
 */
export const OpenDefectLink: React.FC<OpenDefectLinkProps> = ({
  defect,
  onClick,
  context = 'list',
}) => {
  const { t } = useTranslation()

  const label = t('aircraft.hil.openLogbook', {
    ajlbSeqNo: defect.ajlbSeqNo,
    description: defect.description,
  })

  const inBanner = context === 'banner'

  return (
    <Link
      component='button'
      type='button'
      color={inBanner ? 'inherit' : undefined}
      onClick={onClick}
      variant='body2'
      title={label}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        mt: inBanner ? 0 : 0.5,
        textAlign: 'left',
        maxWidth: '100%',
      }}
    >
      <Icon icon='mdi:book-open-page-variant' width={16} style={{ flexShrink: 0 }} />
      {/* minWidth: 0 is what lets a flex item shrink below its content width —
          without it the ellipsis never appears and the link overflows instead. */}
      <Box
        component='span'
        sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {label}
      </Box>
    </Link>
  )
}
