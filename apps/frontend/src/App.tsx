import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SplashScreen from './components/SplashScreen'
import MainLayout from './layouts/MainLayout'
import AuthLayout from './layouts/AuthLayout'

// Import your page components (create these files)
import Dashboard from './sections/dashboard/Dashboard'
// import Schedule from './sections/Schedule'
// import Aircraft from './sections/Aircraft'
import Members from './sections/members/Members'
import Login from './sections/login/Login'
import LoginSent from './sections/login/Sent'
import LoginValidate from './sections/login/Validate'
import Register from './sections/login/Register'
import NotFound from './sections/error/NotFound'
import Member from './sections/members/Member'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider/LocalizationProvider'
// import FlightLogLanding from './sections/flightLog/Landing'
// import NewFlightLogEntry from './sections/flightLog/NewFlightLogEntry'

function App() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if document fonts are loaded
    const checkFontsLoaded = () => {
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          // Add a small delay to ensure smooth transition
          setTimeout(() => {
            setLoading(false)
          }, 500)
        })
      } else {
        // Fallback for browsers that don't support document.fonts
        setTimeout(() => {
          setLoading(false)
        }, 1500)
      }
    }

    checkFontsLoaded()
  }, [])

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale='fi'>
      <SplashScreen loading={loading} />
      <BrowserRouter>
        <Routes>
          {/* Main Layout with header */}
          <Route element={<MainLayout />}>
            <Route path='/' element={<Dashboard />} />
            {/* <Route path="/schedule" element={<Schedule />} />
            <Route path="/aircraft" element={<Aircraft />} /> */}
            <Route index path='/members' element={<Members />} />
            <Route path='/members/:memberId' element={<Member />} />
            {/* <Route path='/flight-logs' element={<FlightLogLanding />} /> */}
            {/* <Route path='/flight-logs/new' element={<NewFlightLogEntry />} /> */}
          </Route>

          {/* Auth Layout without header */}
          <Route element={<AuthLayout />}>
            <Route path='/login' element={<Login />} />
            <Route path='/login/sent' element={<LoginSent />} />
            <Route path='/login/validate' element={<LoginValidate />} />
            <Route path='/register' element={<Register />} />
          </Route>

          {/* Fallback route - 404 page */}
          <Route path='*' element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </LocalizationProvider>
  )
}

export default App
