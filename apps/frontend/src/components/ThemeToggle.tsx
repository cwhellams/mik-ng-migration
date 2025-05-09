import { IconButton, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import { useThemeMode } from '../theme/ThemeContext'
import { useTranslation } from 'react-i18next'

const ThemeToggle = () => {
  const { mode, toggleTheme } = useThemeMode()
  const { t } = useTranslation()

  return (
    <Tooltip title={t('header.toggleTheme') || 'Toggle theme'}>
      <IconButton
        onClick={toggleTheme}
        color='inherit'
        aria-label='toggle theme'
        sx={{ color: 'text.primary' }}
      >
        {mode === 'light' ? (
          <Icon icon='mdi:weather-night' fontSize={24} />
        ) : (
          <Icon icon='mdi:white-balance-sunny' fontSize={24} />
        )}
      </IconButton>
    </Tooltip>
  )
}

export default ThemeToggle
