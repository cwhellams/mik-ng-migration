import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Typography,
  useMediaQuery,
  useTheme,
  type SxProps,
  type Theme,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { EditDialogTitle } from './EditDialogTitle'

/**
 * A button next to a stat's title that opens a dialog explaining, in detail,
 * what the stat shows and how it is calculated. All props are i18n keys, not
 * resolved strings — the component calls `t()` on each of them itself.
 */
export const StatInfoButton = ({
  titleKey,
  summaryKey,
  calculationKey,
  caveatKeys,
  sx,
}: {
  titleKey: string
  summaryKey: string
  calculationKey: string
  caveatKeys?: string[]
  sx?: SxProps<Theme>
}) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  const [open, setOpen] = useState(false)

  return (
    <>
      <IconButton
        aria-label={t(titleKey)}
        onClick={() => setOpen(true)}
        size='small'
        sx={{
          // Ensure touch targets meet the 44px minimum on mobile, matching EditButton.
          minWidth: { xs: 44, sm: 'auto' },
          minHeight: { xs: 44, sm: 'auto' },
          ...sx,
        }}
      >
        <Icon icon='mdi:information-outline' width={20} />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} fullScreen={isXs} maxWidth='sm' fullWidth>
        <EditDialogTitle title={titleKey} onClose={() => setOpen(false)} />
        <DialogContent>
          <Typography variant='body1' sx={{ mb: 2 }}>
            {t(summaryKey)}
          </Typography>
          <Typography variant='body2' sx={{ whiteSpace: 'pre-line', color: 'text.secondary' }}>
            {t(calculationKey)}
          </Typography>
          {caveatKeys && caveatKeys.length > 0 && (
            <List dense sx={{ mt: 1 }}>
              {caveatKeys.map((key) => (
                <ListItem
                  key={key}
                  sx={{ display: 'list-item', listStyleType: 'disc', pl: 0, ml: 3, py: 0.5 }}
                >
                  <ListItemText
                    slotProps={{ primary: { variant: 'body2', color: 'text.secondary' } }}
                    primary={t(key)}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
