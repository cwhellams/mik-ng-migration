import { Box, Container } from '@mui/material'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { NotificationBanner } from '../components/NotificationBanner'
import { useMe } from '../hooks/useMe'
import { useEffect } from 'react'

const PROFILE_PATH = '/club/members/me'

// Paths a flagged member must still be able to reach so the redirect can't trap
// them mid-flow. The profile page itself is the redirect target; the email-change
// verification link must be allowed to consume its token instead of being bounced.
const REDIRECT_EXEMPT_PATHS = [PROFILE_PATH, '/profile/email-change/verify']

const MainLayout = () => {
  const { me } = useMe()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const isExempt = REDIRECT_EXEMPT_PATHS.includes(location.pathname)
    if (me?.mustUpdateProfile && !isExempt) {
      navigate(PROFILE_PATH, { replace: true })
    }
  }, [me?.mustUpdateProfile, location.pathname, navigate])

  return (
    <>
      <Header />
      <NotificationBanner />

      <Box sx={{ pt: 3, pb: 4, minHeight: 'calc(100vh - 300px)' }}>
        <Container maxWidth='lg'>
          <Outlet />
        </Container>
      </Box>
      <Footer />
    </>
  )
}

export default MainLayout
