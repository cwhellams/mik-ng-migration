import { Chip } from '@mui/material'
import type { FindingKind } from '@mik/contracts/findings'
import type { DefectStatus } from '@mik/contracts/defects'
import { useTranslation } from 'react-i18next'

/**
 * The two chips every findings surface renders, kept in one place so the
 * search results, the pattern list and the related-findings expansion label a
 * defect the same way.
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
 * caller can drop it in unconditionally rather than repeating the null check.
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
