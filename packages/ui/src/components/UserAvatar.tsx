import React, { useState } from 'react'
import { Avatar } from '@mui/material'
import { createAvatar, type Style } from '@dicebear/core'
import * as initials from '@dicebear/initials'
import * as avataaars from '@dicebear/avataaars'
import * as bottts from '@dicebear/bottts'
import { DicebearAvatarStyle } from '@mik/contracts/members'

type Props = {
  email: string
  firstName: string
  lastName?: string
  avatarUrl?: string | null
  avatarStyle?: DicebearAvatarStyle
  size?: number
  onClick?: (event: React.MouseEvent<HTMLElement>) => void
  className?: string
  isMembershipApproved?: boolean
}

const getInitials = (firstName: string, lastName?: string) => {
  const firstInitial = firstName ? firstName.charAt(0) : ''
  const lastInitial = lastName ? lastName.charAt(0) : ''
  return `${firstInitial}${lastInitial}`.toUpperCase()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DICEBEAR_STYLES: Record<DicebearAvatarStyle, Style<any>> = {
  [DicebearAvatarStyle.INITIALS]: initials,
  [DicebearAvatarStyle.AVATAAARS]: avataaars,
  [DicebearAvatarStyle.BOTTTS]: bottts,
}

// Deterministic, generated locally in the browser — unlike Gravatar this never sends
// the member's email to a third party just to render a placeholder image.
export const getDicebearAvatar = (
  email: string,
  firstName: string,
  lastName?: string,
  style: DicebearAvatarStyle = DicebearAvatarStyle.INITIALS,
): string => {
  const seed = email.trim().toLowerCase() || `${firstName} ${lastName ?? ''}`
  return createAvatar(DICEBEAR_STYLES[style] ?? initials, { seed }).toDataUri()
}

const UserAvatar: React.FC<Props> = ({
  email,
  firstName,
  lastName,
  avatarUrl,
  avatarStyle,
  size = 40,
  onClick,
  className,
}) => {
  // Tracks the specific URL that failed, not a plain boolean: a presigned URL is
  // short-lived and gets re-signed on every member read, so a stale one failing must not
  // permanently hide a later, freshly-presigned avatarUrl until this component remounts.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const src =
    avatarUrl && avatarUrl !== failedUrl
      ? avatarUrl
      : getDicebearAvatar(email, firstName, lastName, avatarStyle)

  return (
    <Avatar
      src={src}
      alt={`${firstName} ${lastName ?? ''}`.trim()}
      onError={() => avatarUrl && setFailedUrl(avatarUrl)}
      onClick={onClick}
      className={className}
      sx={{
        width: size,
        height: size,
        cursor: onClick ? 'pointer' : 'default',
        fontSize: size / 2,
      }}
    >
      {getInitials(firstName, lastName)}
    </Avatar>
  )
}

export default UserAvatar
