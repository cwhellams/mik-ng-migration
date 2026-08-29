import { Chip } from '@mui/material'
import type { DefectStatus } from '@mik/contracts/defects'
import type { FindingKind } from '@mik/contracts/findings'
import { useTranslation } from 'react-i18next'

/**
 * How a defect, a remark and a maintenance note are labelled wherever either
 * app lists them together (#1230).
 *
 * Shared rather than app-local because both apps render them unchanged: the
 * admin app's findings search and pattern list, and the member app's per-
 * aircraft technical-notes dialog. Two copies would be two places to change
 * the day a status's colour moves, and the colour is the part a reader
 * actually reads -- red means the aeroplane is grounded.
 */

const KIND_COLOR: Record<FindingKind, 'error' | 'info' | 'success'> = {
  DEFECT: 'error',
  REMARK: 'info',
  MAINTENANCE_NOTE: 'success',
}

export const KindChip = ({ kind }: { kind: FindingKind }) => {
  const { t } = useTranslation()

  return <Chip size='small' color={KIND_COLOR[kind]} label={t(`findings.kind.${kind}`)} />
}

const STATUS_COLOR: Record<DefectStatus, 'error' | 'warning' | 'success'> = {
  ACTIVE: 'error',
  MOVED_TO_HIL: 'warning',
  RESOLVED: 'success',
}

/**
 * A defect's lifecycle. Renders nothing for the kinds that have none, so a
 * caller can drop it in unconditionally rather than repeating the null check
 * at every site.
 */
export const StatusChip = ({ status }: { status: DefectStatus | null }) => {
  const { t } = useTranslation()

  if (!status) return null

  return (
    <Chip
      size='small'
      variant='outlined'
      color={STATUS_COLOR[status]}
      label={t(`findings.status.${status}`)}
    />
  )
}
