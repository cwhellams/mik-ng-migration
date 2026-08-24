import { Icon } from '@iconify/react'
import { Button } from '@mui/material'
import { t } from 'i18next'

export const RemoveButton = (props?: React.ComponentProps<typeof Button>) => (
  <Button
    color='secondary'
    variant='outlined'
    loadingPosition='start'
    startIcon={<Icon icon='mdi:delete' />}
    {...props}
  >
    {t('general.delete')}
  </Button>
)
