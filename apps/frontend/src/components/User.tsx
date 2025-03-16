import { Box, Button, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Member } from '@backend/routes/members/models'
import useApi from '../hooks/useApi'

const User = () => {
  const { t } = useTranslation()

  const { data, isLoading } = useApi<Member>({
    path: 'v1/members/me',
    allowUnauthenticated: true,
  })

  if (isLoading) {
    return <></>
  }

  return (
    <Box>
      {data ? (
        <>
          <Typography
            component='span'
            variant='body2'
            color='primary'
            sx={{
              marginRight: 2,
            }}
          >
            {data?.firstName}
          </Typography>

          <Button
            component={Link}
            to='/logout'
            variant='contained'
            color='primary'
            sx={{
              borderRadius: 2,
            }}
            onClick={() => {
              sessionStorage.removeItem('accessToken')
            }}
          >
            {t('header.logout')}
          </Button>
        </>
      ) : (
        <Button
          component={Link}
          to='/login'
          variant='contained'
          color='primary'
          sx={{
            borderRadius: 2,
          }}
        >
          {t('header.login')}
        </Button>
      )}
    </Box>
  )
}

export default User
