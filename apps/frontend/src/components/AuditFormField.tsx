import { Tooltip } from '@mui/material'
import { FormField } from './FormField'
import { Link } from 'react-router-dom'
import { toLocalDate } from '../utils/date'

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
}: {
  label: string
  width?: number
  at?: string
  by?: string
  memberId?: string
}) => (
  <FormField label={label} width={width}>
    <Tooltip title={at}>
      <span>{toLocalDate(at)} </span>
    </Tooltip>
    {by && <AuditBy by={by} memberId={memberId} />}
  </FormField>
)
