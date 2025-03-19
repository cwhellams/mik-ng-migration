import { CircularProgress, Card, CardContent, Typography, Box, Stack } from '@mui/material';
import useApi from '../../hooks/useApi'; // Assume useApi is a custom hook wrapping Axios
import { Member } from '@backend/routes/members/models'
import { useTranslation } from 'react-i18next';

const MyProfile = () => {
    const { t } = useTranslation();
    const { data, isLoading, error } = useApi<Member>({ path: 'v1/members/me'})

  return (
    <Box sx={{ padding: 3 }}>
      <Typography variant='h2' gutterBottom>
       {t('member.profile')}
      </Typography>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <CircularProgress size={24} color="inherit" />
        </Box>
      ) : error || !data ? (
        <Typography variant="h6" color="error" align="center">
          Error loading member data.
        </Typography>
      ) : (
        <Stack spacing={3}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6">{t('member.info')}</Typography>
                <Typography variant="body1">{t('member.fullname')}: {data.firstName} {data.lastName}</Typography>
                <Typography variant="body1">{t('member.email')}: {data.email}</Typography>
                <Typography variant="body1">{t('member.phone')}: {data.phoneNumber ?? 'N/A'}</Typography>
                <Typography variant="body1">{t('member.postcode')}: {data.postcode ?? 'N/A'}</Typography>
                <Typography variant="body1">{t('member.town')}: {data.townCity ?? 'N/A'}</Typography>
                <Typography variant="body1">{t('member.street')}: {data.streetAddress ?? 'N/A'}</Typography>
              </CardContent>
            </Card>

            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6">{t('member.emergencyContact')}</Typography>
                <Typography variant="body1">{t('member.iceContact')}: {data.iceContactName ?? 'N/A'}</Typography>
                <Typography variant="body1">{t('member.icePhone')}: {data.iceContactPhoneNumber ?? 'N/A'}</Typography>
              </CardContent>
            </Card>
          </Stack>

          <Card>
            <CardContent>
              <Typography variant="h6">{t('member.roles')}</Typography>
              {data.roles && data.roles.length > 0 ? (
                <ul>
                  {data.roles.map((role, index) => (
                    <li key={index}>
                      <Typography variant="body1">{role}</Typography>
                    </li>
                  ))}
                </ul>
              ) : (
                <Typography variant="body1">No roles assigned</Typography>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6">{t('member.trainingProgram')}</Typography>
              <Typography variant="body1">
                {data.isTrainingProgramPilot ? 'Is a Training Program Pilot' : 'Not a Training Program Pilot'}
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      )}
    </Box>
  );
};

export default MyProfile;
