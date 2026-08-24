import { Box, Grid, Button, Typography, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import useApi from '../../hooks/useApi'
import { Icon } from '@iconify/react'
import { Link } from 'react-router'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { useState } from 'react'
import { Title } from '@mik/ui/components/Title'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import {
  Occurrence,
  OccurrenceFilters,
  OccurrencesListResponse,
  OccurrenceStatus,
} from '@mik/contracts/occurrences'
import { MIKPermissions } from '@mik/contracts/members'
import { useTimezone } from '../../hooks/useTimezone'
import { useScrollOnRender } from '../../hooks/useScrollOnRender'
import { useRoles } from '../../hooks/useRoles'
import { useThemeMode } from '../../theme/ThemeContext'
import { OccurrenceStatusChip, OccurrenceStatusFilter } from './components/OccurrenceStatusChip'
import { formatDuration, getDurationInMinutes } from '../flightLog/utils/timeUtils'

export const Occurrences = () => {
  const { t } = useTranslation()
  const theme = useTheme()

  const [filters, setFilters] = useState<OccurrenceFilters>({})

  const { formatDateTime } = useTimezone()

  const scrollToRef = useScrollOnRender()

  const { hasAccess } = useRoles()
  const { sudo } = useThemeMode()
  const showAdminModeHint =
    !sudo && hasAccess(MIKPermissions.SMS_MANAGER, MIKPermissions.SMS_PROCESSOR)

  const { data, isLoading, error } = useApi<OccurrencesListResponse, Occurrence>(
    {
      url: 'v1/occurrences',
      params: filters,
    },
    {
      // don't clear old data when searching
      keepPreviousData: true,
    },
  )

  return (
    <Box>
      <Title label={t('occurrences.title')}>
        <Button
          variant='contained'
          color='primary'
          startIcon={<Icon icon='mdi:plus' />}
          component={Link}
          to='new'
        >
          {t('occurrences.newReport')}
        </Button>
      </Title>
      <Box
        sx={{
          mb: 2,
          p: 2,
          borderRadius: 2,
          backgroundColor: theme.palette.info.light,
          color: theme.palette.info.contrastText,
        }}
      >
        <Typography variant='body1'>{t('occurrences.infoText')}</Typography>
      </Box>
      {showAdminModeHint && (
        <Box
          sx={{
            mb: 2,
            p: 2,
            borderRadius: 2,
            backgroundColor: theme.palette.warning.light,
            color: theme.palette.warning.contrastText,
          }}
        >
          <Typography variant='body1'>{t('occurrences.adminModeHint')}</Typography>
        </Box>
      )}
      <OccurrenceStatusFilter
        selected={filters.status!}
        onChange={(status) =>
          setFilters((oldFilters) => ({
            ...oldFilters,
            status: oldFilters.status === status ? undefined : status,
          }))
        }
      />
      <RemoteContent isLoading={isLoading} error={error}>
        <ResponsiveTable
          header={
            <>
              <Grid size={2}>{t('occurrences.reportDate')}</Grid>
              <Grid size={2}>{t('occurrences.occurrenceDate')}</Grid>
              <Grid size={1.5}>{t('occurrences.status')}</Grid>
              <Grid size={1}>{t('occurrences.aircraft')}</Grid>
              <Grid size={3}>{t('occurrences.headline')}</Grid>
              <Grid size={2.5}>{t('occurrences.location')}</Grid>
            </>
          }
          notFoundMsg={t('occurrences.noReports')}
          rows={data?.occurrences}
          row={(occurrence) => (
            <>
              <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                <Link
                  to={`/logs/occurrences/${occurrence.id}`}
                  ref={location.hash == `#${occurrence.id}` ? scrollToRef : undefined}
                >
                  {formatDateTime(occurrence.reportDate)}
                </Link>
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 2 }}>
                <Box>{formatDateTime(occurrence.occurrenceDate)}</Box>
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
                <OccurrenceStatusChip status={occurrence.status} />

                {occurrence.status !== OccurrenceStatus.RECEIVED &&
                  occurrence.status !== OccurrenceStatus.CLOSED && (
                    <Box
                      sx={{
                        fontSize: '0.8em',
                        color: 'text.secondary',
                      }}
                    >
                      {t('occurrences.age', {
                        duration: formatDuration(getDurationInMinutes(occurrence.reportDate)),
                      })}
                    </Box>
                  )}
              </Grid>

              <Grid size={{ xs: 6, sm: 3, md: 1 }}>{occurrence.aircraftRegistration}</Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Box>{occurrence.headline}</Box>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2.5 }}>
                <Box>{occurrence.location}</Box>
              </Grid>
            </>
          )}
        />
      </RemoteContent>
    </Box>
  )
}
