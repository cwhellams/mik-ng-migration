import { Tooltip } from '@mui/material'
import { FormField } from './FormField'
import { Link } from 'react-router-dom'
import { useTimezone } from '../hooks/useTimezone'

const AuditBy = ({ by, memberId }: { by?: string; memberId?: string }) => {
  if (!by) {
    return <></>
  }
  if (by == memberId) {
    return ' (self)'
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
  memberId,
  includeTime = false,
}: {
  label: string
  width?: number
  at?: string
  by?: string
  memberId?: string
  includeTime?: boolean
}) => {
  const { formatDate, formatDateTime } = useTimezone()
  return (
    <FormField label={label} width={width}>
      <Tooltip title={at}>
        <span>{includeTime ? formatDateTime(at) : formatDate(at)} </span>
      </Tooltip>
      {by && <AuditBy by={by} memberId={memberId} />}
    </FormField>
  )
}
