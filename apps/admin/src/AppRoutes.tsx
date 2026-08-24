import { Routes, Route, Navigate } from 'react-router'
import AdminLayout from './layouts/AdminLayout'
import AuthLayout from './layouts/AuthLayout'
import Dashboard from './sections/dashboard/Dashboard'
import Login from './sections/login/Login'
import LoginSent from './sections/login/Sent'
import LoginValidate from './sections/login/Validate'
import LogoutSuccess from './sections/login/LogoutSuccess'
import NotFound from './sections/error/NotFound'

const AppRoutes = () => {
  return (
    <Routes>
      {/* Admin layout — protected routes */}
      <Route element={<AdminLayout />}>
        <Route path='/' element={<Navigate to='/dashboard' replace />} />
        <Route path='/dashboard' element={<Dashboard />} />
      </Route>

      {/* Auth layout — unauthenticated routes */}
      <Route element={<AuthLayout />}>
        <Route path='/login' element={<Login />} />
        <Route path='/login/sent' element={<LoginSent />} />
        <Route path='/login/validate' element={<LoginValidate />} />
        <Route path='/logout' element={<LogoutSuccess />} />
      </Route>

      {/* Fallback */}
      <Route path='*' element={<NotFound />} />
    </Routes>
  )
}

export default AppRoutes
