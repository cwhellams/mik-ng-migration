import { Typography, Box, Stack, Card, CardContent } from '@mui/material'
import useApi from '../../hooks/useApi'
import { AircraftListResponse } from '@backend/routes/aircrafts/models'
import { t } from 'i18next'
import { EditButton } from '../../components/EditButton'
import { FormTitle } from '../../components/FormTitle'
import { RemoteContent } from '../../components/RemoteContent'
import { FormField } from '../../components/FormField'

const Aircrafts = () => {
  const { data, isLoading, error } = useApi<AircraftListResponse>({
    url: 'v1/aircrafts',
  })

  return (
    <Box sx={{ position: 'relative' }}>
      <Typography variant='h2' gutterBottom>
        {t('header.aircrafts')}
      </Typography>

      <EditButton
        title={t('member.edit.register')}
        onClick={() => {}}
        icon='mdi:plus'
      />

      <RemoteContent isLoading={isLoading} error={error}>
        <Stack direction={{ sm: 'column', md: 'row' }} spacing={3}>
          {data?.aircrafts.map((aircraft) => (
            <Card key={aircraft.registration} sx={{ flex: 1, mb: 3 }}>
              <CardContent>
                <FormTitle title={aircraft.registration} sx={{ mb: 0 }} />
                <Typography variant='body2' color='text.primary' sx={{ mb: 2 }}>
                  {aircraft.displayName}
                </Typography>

                <FormField
                  label={t('aircraft.location')}
                  sx={{ mb: 2, display: 'block' }}
                >
                  {aircraft.location}
                </FormField>

                <FormField
                  label={t('aircraft.notes')}
                  sx={{ mb: 2, display: 'block' }}
                >
                  {aircraft.notes.map((note) => note.text)}
                </FormField>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </RemoteContent>
    </Box>
  )
}

export default Aircrafts
