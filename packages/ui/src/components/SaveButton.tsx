import { Icon } from '@iconify/react'
import { Button } from '@mui/material'
import { t } from 'i18next'

export const SaveButton = (props?: React.ComponentProps<typeof Button>) => (
  <Button
    type='submit'
    color='primary'
    variant='contained'
    loadingPosition='start'
    startIcon={<Icon icon='mdi:content-save' />}
    {...props}
  >
    {t('general.save')}
  </Button>
)
