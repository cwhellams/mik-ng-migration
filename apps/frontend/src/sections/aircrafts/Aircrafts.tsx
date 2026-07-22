import {
  Typography,
  Box,
  Stack,
  Card,
  CardContent,
  Alert,
  CardMedia,
  Chip,
  Divider,
  BottomNavigation,
  BottomNavigationAction,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  FormControlLabel,
  Switch,
} from '@mui/material'
import useApi from '../../hooks/useApi'
import {
  Aircraft,
  AircraftAlert,
  AircraftListResponse,
  Severity,
} from '@backend/routes/aircrafts/models'
import { AircraftPricingListResponse } from '@backend/routes/aircraft-pricing/models'
import { t } from 'i18next'
import { EditButton } from '../../components/EditButton'
import { FormTitle } from '../../components/FormTitle'
import { RemoteContent } from '../../components/RemoteContent'
import { FormField } from '../../components/FormField'
import { Icon } from '@iconify/react'
import { AircraftDocumentSection } from './components/AircraftDocumentSection'
import { AircraftCardSection } from './components/AircraftCardSection'
import { NavdataSection, NavdataInfoStatus } from './components/NavdataSection'
import { useRoles } from '../../hooks/useRoles'
import { useState } from 'react'
import { AircraftEditMode, EditAircraftModal } from './components/EditAircraftModal'
import { PricingEditMode, EditPricingModal } from './components/EditPricingModal'
import dayjs from 'dayjs'
import MIKLogo from '../../assets/mik-logo-blue.png'
import ProgressLine from './components/Progress'
import { Title } from '../../components/Title'
import { RemoveButton } from '../../components/RemoveButton'
import { AircraftPricing } from '@backend/routes/aircraft-pricing/models'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { mutate } from 'swr'
import { formatHHMM } from '../../utils/format'
import { useTimezone } from '../../hooks/useTimezone'

const Aircrafts = () => {
  const [showInactive, setShowInactive] = useState(false)

  const { data, isLoading, error } = useApi<AircraftListResponse, Aircraft>({
    url: 'v1/aircrafts',
    params: { activeOnly: !showInactive },
  })

  const { isAircraftAdmin, isInvoicingAdmin } = useRoles()
  const canEditPricing = isAircraftAdmin || isInvoicingAdmin

  const pricingDelete = useApi({ url: 'v1/aircraft-pricing', skipFetch: true })

  const [editMode, setEditMode] = useState<AircraftEditMode | undefined>(undefined)
  const [editData, setEditData] = useState<Aircraft | undefined>(undefined)

  // State for pricing edit modal
  const [pricingEditMode, setPricingEditMode] = useState<PricingEditMode | undefined>(undefined)
  const [selectedPricing, setSelectedPricing] = useState<AircraftPricing | undefined>(undefined)
  const [pricingRegistration, setPricingRegistration] = useState<string>('')

  // State for delete confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [pricingToDelete, setPricingToDelete] = useState<AircraftPricing | undefined>(undefined)

  const { formatISODateTime } = useTimezone()

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
        documentId: alert.documentId ? t(`aircraft.document.${alert.documentId}`) : undefined,
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

  // Handle deleting pricing
  const handleDeletePricing = async () => {
    if (!pricingToDelete) return

    try {
      await pricingDelete.mutation.trigger(
        'DELETE',
        undefined,
        `${pricingToDelete.registration}/${pricingToDelete.valid_from}`,
      )

      await mutate(
        (key: unknown) =>
          Array.isArray(key) && typeof key[0] === 'string' && key[0].includes('aircraft-pricing'),
      )
    } catch (error) {
      console.error('Error deleting pricing:', error)
    }

    setDeleteConfirmOpen(false)
    setPricingToDelete(undefined)
  }

  // Component to display historical pricing for an aircraft
  const AircraftPricingHistory = ({ registration }: { registration: string }) => {
    const { data: pricingData, isLoading } = useApi<AircraftPricingListResponse>({
      url: `v1/aircraft-pricing?registration=${registration}`,
    })

    if (isLoading) {
      return <Typography>{t('common.loading', 'Loading...')}</Typography>
    }

    if (!pricingData?.pricing || pricingData.pricing.length === 0) {
      return (
        <Typography
          sx={{
            color: 'text.secondary',
          }}
        >
          {t('aircraft.pricing.noHistory', 'No pricing history available')}
        </Typography>
      )
    }

    // Sort by valid_from descending and limit to 10 rows
    const sortedPricing = [...pricingData.pricing]
      .sort((a, b) => new Date(b.valid_from).getTime() - new Date(a.valid_from).getTime())
      .slice(0, 10)

    return (
      <Stack spacing={2}>
        {canEditPricing && (
          <Box>
            <EditButton
              title={t('aircraft.pricing.add', 'Add Pricing')}
              icon='mdi:plus'
              onClick={() => {
                setPricingRegistration(registration)
                setSelectedPricing(undefined)
                setPricingEditMode('new')
              }}
            />
          </Box>
        )}
        <TableContainer component={Paper} variant='outlined'>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>{t('aircraft.pricing.from', 'From')}</TableCell>
                <TableCell>{t('aircraft.pricing.to', 'To')}</TableCell>
                <TableCell align='right'>{t('aircraft.pricing.rate', 'Rate')}</TableCell>
                <TableCell align='center' sx={{ width: 48 }}></TableCell>
                {canEditPricing && (
                  <TableCell align='center' sx={{ width: 96 }}>
                    {t('general.actions', 'Actions')}
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedPricing.map((price) => (
                <TableRow key={`${price.registration}-${price.valid_from}`}>
                  <TableCell>{dayjs(price.valid_from).format('YYYY-MM-DD')}</TableCell>
                  <TableCell>
                    {price.valid_to
                      ? dayjs(price.valid_to).format('YYYY-MM-DD')
                      : t('aircraft.pricing.current', 'Current')}
                  </TableCell>
                  <TableCell align='right'>€{(price.price_per_min * 60).toFixed(2)}/h</TableCell>
                  <TableCell align='center'>
                    {price.notes && (
                      <Tooltip title={price.notes} arrow>
                        <IconButton size='small'>
                          <Icon icon='mdi:information' />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                  {canEditPricing && (
                    <TableCell align='center'>
                      <Stack
                        direction='row'
                        spacing={0.5}
                        sx={{
                          justifyContent: 'center',
                        }}
                      >
                        <EditButton
                          title={t('aircraft.pricing.edit', 'Edit')}
                          icon='mdi:pencil'
                          onClick={() => {
                            setPricingRegistration(registration)
                            setSelectedPricing(price)
                            setPricingEditMode('edit')
                          }}
                        />
                        <RemoveButton
                          title={t('aircraft.pricing.delete', 'Delete')}
                          onClick={() => {
                            setPricingToDelete(price)
                            setDeleteConfirmOpen(true)
                          }}
                        />
                      </Stack>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    )
  }

  // Component to display current pricing for an aircraft
  const AircraftPricing = ({ registration }: { registration: string }) => {
    const today = dayjs().format('YYYY-MM-DD')
    const { data: pricingData } = useApi<AircraftPricingListResponse>({
      url: `v1/aircraft-pricing?registration=${registration}&fromDate=${today}&toDate=${today}`,
    })

    const currentPricing = pricingData?.pricing?.[0]

    if (!currentPricing) {
      return null
    }

    const pricePerHour = (currentPricing.price_per_min * 60).toFixed(2)
    const pricePerMin = currentPricing.price_per_min.toFixed(2)

    return (
      <Box sx={{ mt: 2 }}>
        <Typography
          variant='subtitle1'
          gutterBottom
          sx={{
            color: 'text.primary',
          }}
        >
          {t('aircraft.pricing.title')}
        </Typography>
        <Typography
          variant='body1'
          sx={{
            color: 'text.secondary',
          }}
        >
          €{pricePerHour}/h (€{pricePerMin}/min)
        </Typography>
        {currentPricing.notes && (
          <Typography
            variant='caption'
            sx={{
              color: 'text.secondary',
              display: 'block',
              mt: 0.5,
            }}
          >
            {currentPricing.notes}
          </Typography>
        )}
      </Box>
    )
  }

  return (
    <Box>
      <Title label={t('header.aircrafts')}>
        {isAircraftAdmin && (
          <>
            <FormControlLabel
              control={
                <Switch
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
              }
              label={t('aircraft.showActive')}
            />
            <EditButton
              title={t('aircraft.edit.new')}
              onClick={() => {
                setEditData(undefined)
                setEditMode('new')
              }}
              icon='mdi:plus'
            />
          </>
        )}
      </Title>
      <RemoteContent isLoading={isLoading} error={error}>
        <Stack
          direction={{ sm: 'column', md: 'row' }}
          useFlexGap
          spacing={{ xs: 2, sm: 3 }}
          sx={{
            flexWrap: 'wrap',
          }}
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
                      <Typography
                        variant='body2'
                        sx={{
                          color: 'text.primary',
                        }}
                      >
                        {aircraft.displayName}
                      </Typography>

                      {isAircraftAdmin && aircraft.hidden && (
                        <Chip
                          label={t('aircraft.hiddenBadge', 'Hidden')}
                          size='small'
                          color='default'
                          variant='outlined'
                          icon={<Icon icon='mdi:eye-off' />}
                          sx={{ mt: 0.5 }}
                        />
                      )}

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
                            <Alert key={index} severity='warning' sx={{ mb: 2 }}>
                              {caution.description}
                            </Alert>
                          )
                        })}
                        <FormField label={t('aircraft.location')} sx={{ display: 'block' }}>
                          {aircraft.location}
                        </FormField>

                        {aircraft.fuelTypes.length > 0 && (
                          <FormField label={t('aircraft.fuelTypes')} sx={{ display: 'block' }}>
                            <Box
                              sx={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 0.5,
                              }}
                            >
                              {aircraft.fuelTypes.map((fuelType) => {
                                const isPreferred = fuelType === aircraft.preferredFuelType
                                const chip = (
                                  <Chip
                                    key={fuelType}
                                    label={fuelType}
                                    size='small'
                                    color={isPreferred ? 'primary' : 'default'}
                                    variant={isPreferred ? 'filled' : 'outlined'}
                                    icon={isPreferred ? <Icon icon='mdi:star' /> : undefined}
                                  />
                                )
                                return isPreferred ? (
                                  <Tooltip
                                    key={fuelType}
                                    title={t('aircraft.preferredFuelTypeTooltip')}
                                  >
                                    {chip}
                                  </Tooltip>
                                ) : (
                                  chip
                                )
                              })}
                            </Box>
                          </FormField>
                        )}

                        {notes.length > 0 && (
                          <FormField label={t('aircraft.notes.title')} sx={{ display: 'block' }}>
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

                        <AircraftPricing registration={aircraft.registration} />

                        <Divider sx={{ my: 3 }} />

                        <Box>
                          <Typography
                            variant='subtitle1'
                            sx={{
                              color: 'text.primary',
                            }}
                          >
                            {t('aircraft.totalTime', {
                              ...aircraft.status,
                              remainingFuelGallons: Math.round(
                                (aircraft.status?.remainingFuelLitres ?? 0) / 3.785,
                              ),
                              lastLanding: formatISODateTime(aircraft.status?.lastLandingTimeUtc),
                            })}
                          </Typography>
                        </Box>

                        <Typography>
                          {t('aircraft.maintenanceHours', {
                            ...aircraft.maintenance,
                            ...aircraft.status,
                            nextMaintenanceTime: formatHHMM(
                              aircraft.maintenance.nextMaintenanceMins,
                            ),
                            usableTime: aircraft.status
                              ? formatHHMM(aircraft.status?.usableMins)
                              : undefined,
                          })}

                          {aircraft.status?.daysUntilNextMaintenance !== undefined &&
                            t('aircraft.maintenanceDays', aircraft.status)}
                        </Typography>

                        <ProgressLine
                          limit={-aircraft.maintenance.totalPercentageHours}
                          reserved={aircraft.maintenance.reservedHours}
                          current={(aircraft.status?.minsUntilNextMaintenance ?? 0) / 60}
                          max={aircraft.maintenance.maintenanceCycle}
                        />

                        <NavdataInfoStatus aircraftRegistration={aircraft.registration} />
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

                    {/* Pricing History Tab Content */}
                    {currentTab === 2 && (
                      <Box sx={{ flex: 1 }}>
                        <AircraftPricingHistory registration={aircraft.registration} />
                      </Box>
                    )}

                    {/* Cards Tab Content */}
                    {currentTab === 3 && (
                      <Box sx={{ flex: 1 }}>
                        <AircraftCardSection
                          aircraftRegistration={aircraft.registration}
                          isAdmin={isAircraftAdmin}
                        />
                      </Box>
                    )}

                    {/* Navdata Tab Content */}
                    {currentTab === 4 && (
                      <Box sx={{ flex: 1 }}>
                        <NavdataSection
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
                  onChange={(_, newValue) => handleTabChange(aircraft.registration, newValue)}
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
                  <BottomNavigationAction
                    label={t('aircraft.tabs.pricing', 'Pricing')}
                    icon={<Icon icon='mdi:currency-usd' />}
                  />
                  <BottomNavigationAction
                    label={t('aircraft.tabs.cards', 'Cards')}
                    icon={<Icon icon='mdi:card-account-details' />}
                  />
                  <BottomNavigationAction
                    label={t('aircraft.tabs.navdata', 'Navdata')}
                    icon={<Icon icon='mdi:satellite-uplink' />}
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
        <EditPricingModal
          mode={pricingEditMode}
          onClose={() => {
            setPricingEditMode(undefined)
            setSelectedPricing(undefined)
            setPricingRegistration('')
          }}
          registration={pricingRegistration}
          pricing={selectedPricing}
        />
        <ConfirmDialog
          open={deleteConfirmOpen}
          title={t('aircraft.pricing.delete', 'Delete Pricing')}
          message={t(
            'aircraft.pricing.deleteConfirm',
            'Are you sure you want to delete this pricing entry?',
          )}
          confirmText={t('general.delete', 'Delete')}
          cancelText={t('general.cancel', 'Cancel')}
          onConfirm={handleDeletePricing}
          onClose={() => {
            setDeleteConfirmOpen(false)
            setPricingToDelete(undefined)
          }}
          severity='error'
        />
      </RemoteContent>
    </Box>
  )
}

export default Aircrafts
