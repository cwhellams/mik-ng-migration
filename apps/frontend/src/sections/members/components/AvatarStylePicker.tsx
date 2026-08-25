import React from 'react'
import { Avatar, ButtonBase, Stack, Tooltip } from '@mui/material'
import { useTranslation } from 'react-i18next'

import { DicebearAvatarStyle } from '@mik/contracts/members'
import { getDicebearAvatar } from '@mik/ui/components/UserAvatar'

const STYLES = Object.values(DicebearAvatarStyle)

interface AvatarStylePickerProps {
  email: string
  firstName: string
  lastName?: string
  currentStyle: DicebearAvatarStyle
  disabled?: boolean
  onSelect: (style: DicebearAvatarStyle) => Promise<void>
}

// Only affects the generated fallback avatar — has no visible effect while the member
// has an uploaded photo, same as UserAvatar which only falls back to this style once
// avatarUrl is absent. Shown regardless, so the choice is already made for whenever
// there's no photo (e.g. after Remove Photo).
export const AvatarStylePicker: React.FC<AvatarStylePickerProps> = ({
  email,
  firstName,
  lastName,
  currentStyle,
  disabled = false,
  onSelect,
}) => {
  const { t } = useTranslation()

  return (
    <Stack direction='row' spacing={1}>
      {STYLES.map((style) => (
        <Tooltip key={style} title={t(`member.avatarUpload.styles.${style}`)}>
          <ButtonBase
            onClick={() => onSelect(style)}
            disabled={disabled}
            aria-label={t(`member.avatarUpload.styles.${style}`)}
            aria-pressed={style === currentStyle}
            sx={{
              borderRadius: '50%',
              border: '2px solid',
              borderColor: style === currentStyle ? 'primary.main' : 'transparent',
              padding: '2px',
            }}
          >
            <Avatar
              src={getDicebearAvatar(email, firstName, lastName, style)}
              sx={{ width: 32, height: 32 }}
            />
          </ButtonBase>
        </Tooltip>
      ))}
    </Stack>
  )
}

export default AvatarStylePicker
