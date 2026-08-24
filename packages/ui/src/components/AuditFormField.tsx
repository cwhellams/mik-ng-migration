import { Tooltip } from '@mui/material'
import { FormField } from './FormField'
import { Link } from 'react-router'
import { useTimezone } from '@mik/ui/hooks/useTimezone'

const AuditBy = ({
  by,
  byName,
  memberId,
}: {
  by?: string
  byName?: string | null
  memberId?: string
}) => {
  if (!by) {
    return <></>
  }
  if (by == memberId) {
    return ' (self)'
  }
  if (byName) {
    return <> ({byName})</>
  }
  return (
    <>
      {'('}
      <Link to={`/members/${by}`}>{by}</Link>
      {')'}
    </>
  )
}

export const AuditFormField = ({
  label,
  width,
  at,
  by,
  byName,
  memberId,
  includeTime = false,
}: {
  label: string
  width?: number
  at?: string
  by?: string
  byName?: string | null
  memberId?: string
  includeTime?: boolean
}) => {
  const { formatDate, formatDateTime } = useTimezone()
  return (
    <FormField label={label} width={width}>
      <Tooltip title={at}>
        <span>{includeTime ? formatDateTime(at) : formatDate(at)} </span>
      </Tooltip>
      {by && <AuditBy by={by} byName={byName} memberId={memberId} />}
    </FormField>
  )
}
