import { Box, Container } from '@mui/material'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { Outlet } from 'react-router-dom'

const MainLayout = () => {
  return (
    <>
      <Header />

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
