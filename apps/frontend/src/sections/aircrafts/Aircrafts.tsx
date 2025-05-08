import { Typography, Box, Stack, Card, CardContent, Alert } from '@mui/material'
import useApi from '../../hooks/useApi'
import {
  Aircraft,
  AircraftAlert,
  AircraftDocument,
  AircraftListResponse,
  Severity,
} from '@backend/routes/aircrafts/models'
import { t } from 'i18next'
import { EditButton } from '../../components/EditButton'
import { FormTitle } from '../../components/FormTitle'
import { RemoteContent } from '../../components/RemoteContent'
import { FormField } from '../../components/FormField'

import ProgressLine from './components/Progress'
import { useRoles } from '../../hooks/useRoles'
import { useState } from 'react'
import {
  AircraftEditMode,
  EditAircraftModal,
} from './components/EditAircraftModal'
import { Upsert } from '@backend/types/schema'
import { EditDocumentModal } from './components/EditDocumentModal'
import dayjs from 'dayjs'

const Aircrafts = () => {
  const { data, isLoading, error } = useApi<AircraftListResponse, Aircraft>({
    url: 'v1/aircrafts',
  })
  const { isAircraftAdmin } = useRoles()

  const [editMode, setEditMode] = useState<AircraftEditMode | undefined>(
    undefined
  )
  const [editData, setEditData] = useState<Aircraft | undefined>(undefined)

  const [editDocument, setEditDocument] = useState<
    Upsert<AircraftDocument> | undefined
  >(undefined)

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
    <Box sx={{ position: 'relative' }}>
      <Typography variant='h2' gutterBottom>
        {t('header.aircrafts')}
      </Typography>

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

            return (
              <Card
                key={aircraft.registration}
                sx={{ flex: 1, flexBasis: '40%' }}
              >
                <CardContent>
                  <Stack spacing={2}>
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
                            sx={{ position: 'static' }}
                          />
                          <EditButton
                            title={t('aircraft.edit.notes')}
                            onClick={() => {
                              setEditData(aircraft)
                              setEditMode('notes')
                            }}
                            sx={{ position: 'static' }}
                            icon='mdi:notes'
                          />
                          <EditButton
                            title={t('aircraft.edit.details')}
                            onClick={() => {
                              setEditData(aircraft)
                              setEditMode('details')
                            }}
                            sx={{ position: 'static' }}
                          />
                        </Stack>
                      )}
                    </Box>

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

                    <Box sx={{ position: 'relative' }}>
                      <Typography variant='subtitle1' color='text.primary'>
                        {t('aircraft.documents', 'Documents')}
                      </Typography>

                      {isAircraftAdmin && (
                        <EditButton
                          title={t('aircraft.document.edit.new')}
                          icon='mdi:plus'
                          onClick={() => {
                            setEditData(aircraft)
                            setEditDocument({
                              documentId: '',
                              startDate: dayjs().format('YYYY-MM-DD'),
                              endDate: '',
                              alertDaysBefore: null,
                              softLimit: null,
                              hardLimit: null,
                            })
                          }}
                          sx={{ top: 0, right: 0 }}
                        />
                      )}

                      {aircraft.documents.map((doc) => (
                        <FormField
                          key={doc.documentId}
                          label={t(`aircraft.document.${doc.documentId}`)}
                          width={200}
                          sx={{
                            position: 'relative',
                            color: warnings.find((alert) =>
                              alert.documentId?.includes(doc.documentId)
                            )
                              ? 'red'
                              : cautions.find((alert) =>
                                    alert.documentId?.includes(doc.documentId)
                                  )
                                ? 'orange'
                                : 'black',
                          }}
                        >
                          {doc.endDate}

                          {isAircraftAdmin && (
                            <EditButton
                              title={t('aircraft.document.edit.details')}
                              onClick={() => {
                                setEditData(aircraft)
                                setEditDocument(doc)
                              }}
                              sx={{ top: 0, right: 0 }}
                            />
                          )}
                        </FormField>
                      ))}
                    </Box>

                    <Box>
                      <Typography variant='subtitle1' color='text.primary'>
                        {t('aircraft.totalTime', {
                          ...aircraft.status,
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
                      softLimit={-aircraft.maintenance.usablePercentageHours}
                      current={aircraft.status?.tachUntilNextMaintenance ?? 0}
                      max={aircraft.maintenance.maintenanceCycle}
                    />
                  </Stack>
                </CardContent>
              </Card>
            )
          })}
        </Stack>
        <EditAircraftModal
          mode={editMode}
          onClose={() => setEditMode(undefined)}
          aircraft={editData}
        />
        <EditDocumentModal
          registration={editData?.registration}
          document={editDocument}
          onClose={() => setEditDocument(undefined)}
        />
      </RemoteContent>
    </Box>
  )
}

export default Aircrafts
