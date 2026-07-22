import { Box, Button, Menu, MenuItem, ListItemIcon, Typography } from '@mui/material'
import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { MIKLang } from '@backend/routes/members/models'

interface LanguageSelectorProps {
  selectedLanguage: MIKLang
  onLanguageChange: (language: MIKLang) => void
  showLabel?: boolean
}

const languageConfig = {
  [MIKLang.EN]: {
    label: 'English',
    flag: 'circle-flags:uk',
  },
  [MIKLang.FI]: {
    label: 'Suomi',
    flag: 'circle-flags:fi',
  },
  [MIKLang.SV]: {
    label: 'Svenska',
    flag: 'circle-flags:se',
  },
}

const LanguageSelector = ({
  selectedLanguage,
  onLanguageChange,
  showLabel = false,
}: LanguageSelectorProps) => {
  const { t } = useTranslation()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleLanguageSelect = (language: MIKLang) => {
    onLanguageChange(language)
    handleClose()
  }

  const currentConfig = languageConfig[selectedLanguage]

  return (
    <Box>
      <Button
        onClick={handleClick}
        variant='outlined'
        color='inherit'
        startIcon={<Icon icon={currentConfig.flag} fontSize={20} />}
        sx={{
          minWidth: showLabel ? 'auto' : 48,
          px: showLabel ? 2 : 1,
          borderColor: 'divider',
          color: 'text.secondary',
          '&:hover': {
            borderColor: 'primary.main',
            color: 'primary.main',
          },
        }}
      >
        {showLabel && currentConfig.label}
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{
          paper: {
            elevation: 3,
            sx: {
              minWidth: 150,
              mt: 1,
              '& .MuiMenuItem-root': {
                px: 2,
                py: 1,
              },
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography
            variant='body2'
            sx={{
              color: 'text.secondary',
            }}
          >
            {t('languageSelector.selectLanguage')}
          </Typography>
        </Box>
        {Object.entries(languageConfig).map(([lang, config]) => (
          <MenuItem
            key={lang}
            onClick={() => handleLanguageSelect(lang as MIKLang)}
            selected={selectedLanguage === lang}
          >
            <ListItemIcon>
              <Icon icon={config.flag} fontSize={20} />
            </ListItemIcon>
            {config.label}
            {selectedLanguage === lang && (
              <Icon icon='mdi:check' fontSize={20} style={{ marginLeft: 'auto' }} />
            )}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  )
}

export default LanguageSelector
