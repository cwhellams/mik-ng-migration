import {
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Alert,
  CardMedia,
  Divider,
  BottomNavigation,
  BottomNavigationAction,
} from '@mui/material'
import useApi from '../../hooks/useApi'
import {
  Aircraft,
  AircraftAlert,
  AircraftListResponse,
  Severity,
} from '@backend/routes/aircrafts/models'
import { t } from 'i18next'
import { EditButton } from '../../components/EditButton'
import { FormTitle } from '../../components/FormTitle'
import { RemoteContent } from '../../components/RemoteContent'
import { FormField } from '../../components/FormField'
import { Icon } from '@iconify/react'
import { AircraftDocumentSection } from '../../components/AircraftDocumentSection'
import { useRoles } from '../../hooks/useRoles'
import { useState } from 'react'
import {
  AircraftEditMode,
  EditAircraftModal,
} from './components/EditAircraftModal'
import dayjs from 'dayjs'
import MIKLogo from '../../assets/mik-logo-blue.png'
import ProgressLine from './components/Progress'
import { Title } from '../../components/Title'

const Aircrafts = () => {
  const { data, isLoading, error } = useApi<AircraftListResponse, Aircraft>({
    url: 'v1/aircrafts',
  })

  const { isAircraftAdmin } = useRoles()

  const [editMode, setEditMode] = useState<AircraftEditMode | undefined>(
    undefined
  )
  const [editData, setEditData] = useState<Aircraft | undefined>(undefined)

  // State to track which tab is active for each aircraft card
  const [activeTab, setActiveTab] = useState<Record<string, number>>({})

  const handleTabChange = (registration: string, newValue: number) => {
    setActiveTab((prev) => ({
      ...prev,
      [registration]: newValue,
    }))
  }

  const translateAlert = (alert: AircraftAlert): AircraftAlert => {
    return {
      ...alert,
      description: t(alert.description, {
        ...alert,
        documentId: alert.documentId
          ? t(`aircraft.document.${alert.documentId}`)
          : undefined,
      }),
    }
  }

  const getMsg = (aircraft: Aircraft, level: Severity) => {
    const messages: AircraftAlert[] = aircraft.notes
      .filter((note) => note.severity == level)
      .map((note) => ({
        description: note.text,
        untilExpiration: 0,
        hardLimit: null,
        softLimit: null,
      }))

    switch (level) {
      case Severity.warning: {
        const warnings = aircraft.status?.warnings ?? []
        return [...messages, ...warnings.map(translateAlert)]
      }
      case Severity.caution: {
        const cautions = aircraft.status?.cautions ?? []
        return [...messages, ...cautions.map(translateAlert)]
      }
      default:
        return messages
    }
  }

  return (
    <Box>
      <Title label={t('header.aircrafts')}>
        {isAircraftAdmin && (
          <EditButton
            title={t('aircraft.edit.new')}
            onClick={() => {
              setEditData(undefined)
              setEditMode('new')
            }}
            icon='mdi:plus'
          />
        )}
      </Title>

      <RemoteContent isLoading={isLoading} error={error}>
        <Stack
          direction={{ sm: 'column', md: 'row' }}
          useFlexGap
          flexWrap={'wrap'}
          spacing={{ xs: 2, sm: 3 }}
        >
          {data?.aircrafts.map((aircraft) => {
            const warnings = getMsg(aircraft, Severity.warning)
            const cautions = getMsg(aircraft, Severity.caution)
            const notes = getMsg(aircraft, Severity.note)
            const currentTab = activeTab[aircraft.registration] || 0

            return (
              <Card
                key={aircraft.registration}
                sx={{
                  flex: 1,
                  flexBasis: '40%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <CardMedia
                  component='img'
                  height='180'
                  image={aircraft.imageUrl || MIKLogo}
                  alt={`Aircraft ${aircraft.registration}`}
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).src = MIKLogo
                  }}
                />
                <CardContent
                  sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    pb: 0, // Remove bottom padding to accommodate bottom navigation
                  }}
                >
                  <Stack spacing={2} sx={{ flex: 1 }}>
                    <Box>
                      <FormTitle title={aircraft.registration} sx={{ mb: 0 }} />
                      <Typography variant='body2' color='text.primary'>
                        {aircraft.displayName}
                      </Typography>

                      {isAircraftAdmin && (
                        <Stack
                          direction='row'
                          sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                          }}
                        >
                          <EditButton
                            title={t('aircraft.maintenance.edit')}
                            icon='mdi:wrench'
                            onClick={() => {
                              setEditData(aircraft)
                              setEditMode('maintenance')
                            }}
                          />
                          <EditButton
                            title={t('aircraft.edit.notes')}
                            onClick={() => {
                              setEditData(aircraft)
                              setEditMode('notes')
                            }}
                            icon='mdi:notes'
                          />
                          <EditButton
                            title={t('aircraft.edit.details')}
                            onClick={() => {
                              setEditData(aircraft)
                              setEditMode('details')
                            }}
                          />
                        </Stack>
                      )}
                    </Box>

                    {/* Info Tab Content */}
                    {currentTab === 0 && (
                      <>
                        {warnings.map((warn, index) => {
                          return (
                            <Alert key={index} severity='error' sx={{ mb: 2 }}>
                              {warn.description}
                            </Alert>
                          )
                        })}

                        {cautions.map((caution, index) => {
                          return (
                            <Alert
                              key={index}
                              severity='warning'
                              sx={{ mb: 2 }}
                            >
                              {caution.description}
                            </Alert>
                          )
                        })}
                        <FormField
                          label={t('aircraft.location')}
                          sx={{ display: 'block' }}
                        >
                          {aircraft.location}
                        </FormField>

                        {notes.length > 0 && (
                          <FormField
                            label={t('aircraft.notes.title')}
                            sx={{ display: 'block' }}
                          >
                            {notes.map((note) => {
                              return (
                                <span key={note.description}>
                                  {note.description}
                                  <br />
                                </span>
                              )
                            })}
                          </FormField>
                        )}

                        <Divider sx={{ my: 3 }} />

                        <Box>
                          <Typography variant='subtitle1' color='text.primary'>
                            {t('aircraft.totalTime', {
                              ...aircraft.status,
                              remainingFuelGallons: Math.round(
                                (aircraft.status?.remainingFuelLitres ?? 0) /
                                  3.785
                              ),
                              lastLanding: dayjs(
                                aircraft.status?.lastLandingTimeUtc
                              ).format('YYYY-MM-DD HH:mm'),
                            })}
                          </Typography>
                        </Box>

                        <Typography>
                          {t('aircraft.maintenanceHours', {
                            ...aircraft.maintenance,
                            ...aircraft.status,
                            tachUntilNextMaintenance: aircraft.status
                              ? Math.max(
                                  0,
                                  aircraft.status?.tachUntilNextMaintenance
                                )
                              : undefined,
                          })}

                          {aircraft.status?.daysUntilNextMaintenance !==
                            undefined &&
                            t('aircraft.maintenanceDays', aircraft.status)}
                        </Typography>

                        <ProgressLine
                          hardLimit={-aircraft.maintenance.totalPercentageHours}
                          softLimit={
                            -aircraft.maintenance.usablePercentageHours
                          }
                          current={
                            aircraft.status?.tachUntilNextMaintenance ?? 0
                          }
                          max={aircraft.maintenance.maintenanceCycle}
                        />
                      </>
                    )}

                    {/* Documents Tab Content */}
                    {currentTab === 1 && (
                      <Box sx={{ flex: 1 }}>
                        <AircraftDocumentSection
                          aircraftRegistration={aircraft.registration}
                          isAdmin={isAircraftAdmin}
                        />
                      </Box>
                    )}
                  </Stack>
                </CardContent>

                {/* Bottom Navigation */}
                <BottomNavigation
                  value={currentTab}
                  onChange={(_, newValue) =>
                    handleTabChange(aircraft.registration, newValue)
                  }
                  sx={{
                    borderTop: 1,
                    borderColor: 'divider',
                    '& .MuiBottomNavigationAction-root': {
                      minWidth: 'auto',
                      px: 1,
                    },
                  }}
                >
                  <BottomNavigationAction
                    label={t('aircraft.tabs.info', 'Info')}
                    icon={<Icon icon='mdi:information' />}
                  />
                  <BottomNavigationAction
                    label={t('aircraft.tabs.documents', 'Documents')}
                    icon={<Icon icon='mdi:file-document-multiple' />}
                  />
                </BottomNavigation>
              </Card>
            )
          })}
        </Stack>
        <EditAircraftModal
          mode={editMode}
          onClose={() => setEditMode(undefined)}
          aircraft={editData}
        />
      </RemoteContent>
    </Box>
  )
}

export default Aircrafts
