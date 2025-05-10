import React, { useState } from 'react'
import { Avatar } from '@mui/material'
import md5 from 'crypto-js/md5'

type Props = {
  email: string
  firstName: string
  lastName?: string
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

const getGravatarUrl = (email: string, size: number): string => {
  const hash = md5(email.trim().toLowerCase()).toString()
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`
}

const UserAvatar: React.FC<Props> = ({
  email,
  firstName,
  lastName,
  size = 40,
  onClick,
}) => {
  const [error, setError] = useState(false)
  const showGravatar = email && !error

  return (
    <Avatar
      src={showGravatar ? getGravatarUrl(email, size) : undefined}
      onError={() => setError(true)}
      onClick={onClick}
      sx={{
        bgcolor: error ? 'primary.main' : 'transparent',
        width: size,
        height: size,
        cursor: onClick ? 'pointer' : 'default',
        fontSize: size / 2,
      }}
    >
      {!showGravatar && getInitials(firstName, lastName)}
    </Avatar>
  )
}

export default UserAvatar
