import { Box, IconButton, Stack, Tooltip } from '@mui/material'
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
import { DtoInstructorWidget } from './components/DtoInstructorWidget'
import { EventsDashboard } from './components/EventsDashboard'
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
  hasAccess: ReturnType<typeof useRoles>['hasAccess'],
): Record<string, () => JSX.Element | null> => ({
  profileUpdateRequired: () => <ProfileUpdateRequiredBanner />,
  reservationsSuspended: () => (isMember ? <ReservationsSuspendedBanner /> : null),
  overdueInvoice: () => (isMember ? <OverdueInvoiceBanner /> : null),
  equipmentFee: () => (isMember && flyingUser ? <EquipmentFeeBanner /> : null),
  pendingReview: () =>
    me?.isMembershipApproved === false && me.memberType !== MIKMemberTypes.EXTERNAL ? (
      <PendingReviewBanner />
    ) : null,
  expiryWarning: () => <ExpiryWarningBanner />,
  weather: () => (bookingUser ? <WeatherWidget /> : null),
  events: () => (isMember ? <EventsDashboard /> : null),
  bookingUser: () => (bookingUser ? <BookingUserDashboard /> : null),
  flightLogUser: () => (flyingUser ? <FlightLogUserDashboard /> : null),
  memberAdmin: () => (hasAccess(MIKPermissions.MEMBER_ADMIN) ? <MemberAdminDashboard /> : null),
  flightLogAdmin: () =>
    hasAccess(MIKPermissions.FLIGHTLOG_ADMIN) ? <FlightLogAdminDashboard /> : null,
  dtoInstructor: () =>
    hasAccess(MIKPermissions.DTO_INSTRUCTOR, MIKPermissions.DTO_ADMIN) ? (
      <DtoInstructorWidget />
    ) : null,
})

const Dashboard = () => {
  const { hasAccess, me } = useRoles()
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)

  const isMember = hasAccess(MIKPermissions.MEMBER)
  const bookingUser = hasAccess(MIKPermissions.BOOKING_USER, MIKPermissions.BOOKING_ADMIN)
  const flyingUser = hasAccess(MIKPermissions.FLIGHTLOG_USER, MIKPermissions.FLIGHTLOG_ADMIN)

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
  const componentMap = createComponentMap(isMember, bookingUser, flyingUser, me, hasAccess)
  const alwaysVisibleComponentIds: readonly string[] = ALWAYS_VISIBLE_COMPONENTS
  const customizableComponentIds = useMemo(
    () => Object.keys(componentMap).filter((id) => !alwaysVisibleComponentIds.includes(id)),
    [alwaysVisibleComponentIds, componentMap],
  )

  // Get list of component IDs that user has access to (excluding always-visible)
  const accessibleComponentIds = useMemo(() => {
    return customizableComponentIds.filter((id) => {
      const component = componentMap[id]
      // Check if component function returns non-null (has access)
      return component() !== null
    })
  }, [componentMap, customizableComponentIds])

  const mergedDashboardComponents = useMemo(() => {
    if (!dashboardSettings?.components) return []

    const knownComponentIds = new Set(dashboardSettings.components.map((component) => component.id))
    let nextOrder =
      dashboardSettings.components.reduce(
        (maxOrder, component) => Math.max(maxOrder, component.order),
        -1,
      ) + 1

    return [
      ...dashboardSettings.components,
      ...customizableComponentIds
        .filter((id) => !knownComponentIds.has(id))
        .map(
          (id): DashboardComponent => ({
            id,
            visible: true,
            order: nextOrder++,
          }),
        ),
    ]
  }, [customizableComponentIds, dashboardSettings?.components])

  // Always visible components (alerts/banners)
  const alwaysVisibleComponents = useMemo(() => {
    return alwaysVisibleComponentIds
      .map((id) => ({
        id,
        render: componentMap[id],
      }))
      .filter((component) => component.render)
  }, [alwaysVisibleComponentIds, componentMap])

  // Sort and filter customizable components based on settings
  const orderedComponents = useMemo(() => {
    if (!mergedDashboardComponents.length) return []

    return mergedDashboardComponents
      .filter((component) => component.visible)
      .filter((component) => !alwaysVisibleComponentIds.includes(component.id))
      .sort((a, b) => a.order - b.order)
      .map((component) => ({
        id: component.id,
        render: componentMap[component.id],
      }))
      .filter((component) => component.render) // Remove components without render function
  }, [alwaysVisibleComponentIds, componentMap, mergedDashboardComponents])

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <Box>
        <Box display='flex' justifyContent='space-between' alignItems='center' mb={2}>
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
          return ComponentElement ? <Box key={component.id}>{ComponentElement}</Box> : null
        })}

        {isMember && <InstructorQualificationsBanner />}

        {/* Render customizable components in user-defined order */}
        {orderedComponents.length > 0 ? (
          <Stack spacing={2}>
            {orderedComponents.map((component) => {
              const ComponentElement = component.render()
              return ComponentElement ? <Box key={component.id}>{ComponentElement}</Box> : null
            })}
          </Stack>
        ) : (
          // Fallback to default order if no settings for customizable components
          <>
            {isMember && flyingUser && <EquipmentFeeBanner />}

            {bookingUser && <WeatherWidget />}

            {isMember && <EventsDashboard />}

            {bookingUser && <BookingUserDashboard />}

            {flyingUser && <FlightLogUserDashboard />}

            {hasAccess(MIKPermissions.MEMBER_ADMIN) && <MemberAdminDashboard />}

            {hasAccess(MIKPermissions.FLIGHTLOG_ADMIN) && <FlightLogAdminDashboard />}
          </>
        )}

        {/* Dashboard Settings Modal */}
        {dashboardSettings && (
          <DashboardSettingsModal
            open={settingsModalOpen}
            onClose={() => setSettingsModalOpen(false)}
            settings={mergedDashboardComponents}
            onSave={handleSaveSettings}
            accessibleComponentIds={accessibleComponentIds}
          />
        )}
      </Box>
    </RemoteContent>
  )
}

export default Dashboard
