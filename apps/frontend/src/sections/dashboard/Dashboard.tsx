import { Box, IconButton, Tooltip } from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import { useState, useMemo, JSX } from 'react'
import { useRoles } from '../../hooks/useRoles'
import { FlightLogAdminDashboard } from './components/FlightLogAdminDashboard'
import { MemberAdminDashboard } from './components/MemberAdminDashboard'
import { BookingUserDashboard } from './components/BookingUserDashboard'
import { EquipmentFeeBanner } from './components/EquipmentFeeBanner'
import { OverdueInvoiceBanner } from './components/OverdueInvoiceBanner'
import { ReservationsSuspendedBanner } from './components/ReservationsSuspendedBanner'
import { WeatherWidget } from './components/WeatherWidget'
import { MIKMemberTypes, MIKPermissions } from '@backend/routes/members/models'
import { Title } from '../../components/Title'
import { t } from 'i18next'
import { FlightLogUserDashboard } from './components/FlightLogUserDashboard'
import { PendingReviewBanner } from './components/PendingReviewBanner'
import { ProfileUpdateRequiredBanner } from './components/ProfileUpdateRequiredBanner'
import { ExpiryWarningBanner } from './components/ExpiryWarningBanner'
import { DashboardSettingsModal } from './components/DashboardSettingsModal'
import { InstructorQualificationsBanner } from './components/InstructorQualificationsBanner'
import useApi from '../../hooks/useApi'
import type { DashboardSettings, DashboardComponent } from './types'
import { ALWAYS_VISIBLE_COMPONENTS } from './types'
import { RemoteContent } from '../../components/RemoteContent'

// Component factory function - moved outside to avoid React linting issues
const createComponentMap = (
  isMember: boolean,
  bookingUser: boolean,
  flyingUser: boolean,
  me: ReturnType<typeof useRoles>['me'],
  hasAccess: ReturnType<typeof useRoles>['hasAccess']
): Record<string, () => JSX.Element | null> => ({
  profileUpdateRequired: () => <ProfileUpdateRequiredBanner />,
  reservationsSuspended: () =>
    isMember ? <ReservationsSuspendedBanner /> : null,
  overdueInvoice: () => (isMember ? <OverdueInvoiceBanner /> : null),
  equipmentFee: () => (isMember && flyingUser ? <EquipmentFeeBanner /> : null),
  pendingReview: () =>
    me?.isMembershipApproved === false &&
    me.memberType !== MIKMemberTypes.EXTERNAL ? (
      <PendingReviewBanner />
    ) : null,
  expiryWarning: () => <ExpiryWarningBanner />,
  weather: () => (bookingUser ? <WeatherWidget /> : null),
  bookingUser: () => (bookingUser ? <BookingUserDashboard /> : null),
  flightLogUser: () => (flyingUser ? <FlightLogUserDashboard /> : null),
  memberAdmin: () =>
    hasAccess(MIKPermissions.MEMBER_ADMIN) ? <MemberAdminDashboard /> : null,
  flightLogAdmin: () =>
    hasAccess(MIKPermissions.FLIGHTLOG_ADMIN) ? (
      <FlightLogAdminDashboard />
    ) : null,
})

const Dashboard = () => {
  const { hasAccess, me } = useRoles()
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)

  const isMember = hasAccess(MIKPermissions.MEMBER)
  const bookingUser = hasAccess(
    MIKPermissions.BOOKING_USER,
    MIKPermissions.BOOKING_ADMIN
  )
  const flyingUser = hasAccess(
    MIKPermissions.FLIGHTLOG_USER,
    MIKPermissions.FLIGHTLOG_ADMIN
  )

  // Fetch dashboard settings
  const {
    data: dashboardSettings,
    error,
    isLoading,
    mutation,
  } = useApi<DashboardSettings>({
    url: 'v1/dashboard/settings',
  })

  // Save dashboard settings
  const handleSaveSettings = async (settings: DashboardComponent[]) => {
    try {
      await mutation.trigger('PUT', { components: settings })
    } catch (error) {
      console.error('Failed to save dashboard settings:', error)
      throw error
    }
  }

  // Component mapping - returns null if component should not be shown based on permissions
  const componentMap = createComponentMap(
    isMember,
    bookingUser,
    flyingUser,
    me,
    hasAccess
  )

  // Get list of component IDs that user has access to (excluding always-visible)
  const accessibleComponentIds = useMemo(() => {
    return Object.keys(componentMap)
      .filter((id) => !ALWAYS_VISIBLE_COMPONENTS.includes(id as any))
      .filter((id) => {
        const component = componentMap[id]
        // Check if component function returns non-null (has access)
        return component() !== null
      })
  }, [componentMap])

  // Always visible components (alerts/banners)
  const alwaysVisibleComponents = useMemo(() => {
    return ALWAYS_VISIBLE_COMPONENTS.map((id) => ({
      id,
      render: componentMap[id],
    })).filter((component) => component.render)
  }, [componentMap])

  // Sort and filter customizable components based on settings
  const orderedComponents = useMemo(() => {
    if (!dashboardSettings?.components) return []

    return dashboardSettings.components
      .filter((component) => component.visible)
      .filter(
        (component) => !ALWAYS_VISIBLE_COMPONENTS.includes(component.id as any)
      )
      .sort((a, b) => a.order - b.order)
      .map((component) => ({
        id: component.id,
        render: componentMap[component.id],
      }))
      .filter((component) => component.render) // Remove components without render function
  }, [dashboardSettings?.components, componentMap])

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Box>
        <Box
          display='flex'
          justifyContent='space-between'
          alignItems='center'
          mb={2}
        >
          <Title label={t('header.dashboard')} />
          <Tooltip title='Dashboard Settings'>
            <IconButton
              onClick={() => setSettingsModalOpen(true)}
              color='primary'
              aria-label='Dashboard settings'
            >
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Always visible components (alerts/banners) */}
        {alwaysVisibleComponents.map((component) => {
          const ComponentElement = component.render()
          return ComponentElement ? (
            <Box key={component.id}>{ComponentElement}</Box>
          ) : null
        })}

        <InstructorQualificationsBanner />

        {/* Render customizable components in user-defined order */}
        {orderedComponents.length > 0 ? (
          orderedComponents.map((component) => {
            const ComponentElement = component.render()
            return ComponentElement ? (
              <Box key={component.id}>{ComponentElement}</Box>
            ) : null
          })
        ) : (
          // Fallback to default order if no settings for customizable components
          <>
            {isMember && flyingUser && <EquipmentFeeBanner />}

            {bookingUser && <WeatherWidget />}

            {bookingUser && <BookingUserDashboard />}

            {flyingUser && <FlightLogUserDashboard />}

            {hasAccess(MIKPermissions.MEMBER_ADMIN) && <MemberAdminDashboard />}

            {hasAccess(MIKPermissions.FLIGHTLOG_ADMIN) && (
              <FlightLogAdminDashboard />
            )}
          </>
        )}

        {/* Dashboard Settings Modal */}
        {dashboardSettings && (
          <DashboardSettingsModal
            open={settingsModalOpen}
            onClose={() => setSettingsModalOpen(false)}
            settings={dashboardSettings.components}
            onSave={handleSaveSettings}
            accessibleComponentIds={accessibleComponentIds}
          />
        )}
      </Box>
    </RemoteContent>
  )
}

export default Dashboard
