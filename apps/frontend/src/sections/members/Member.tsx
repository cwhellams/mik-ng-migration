import { CircularProgress, Card, CardContent, Typography, Box, Stack } from '@mui/material';
import useApi from '../../hooks/useApi'; // Assume useApi is a custom hook wrapping Axios
import { Member } from '@backend/routes/members/models'

const MyProfile = () => {
    const { data, isLoading, error } = useApi<Member>({ path: 'v1/members/me'})

  return (
    <Box sx={{ padding: 3 }}>
      <Typography variant='h2' gutterBottom>
        myProfile
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
                <Typography variant="h6">Member Info</Typography>
                <Typography variant="body1">Full Name: {data.firstName} {data.lastName}</Typography>
                <Typography variant="body1">Email: {data.email}</Typography>
                <Typography variant="body1">Phone: {data.phoneNumber ?? 'N/A'}</Typography>
                <Typography variant="body1">Postcode: {data.postcode ?? 'N/A'}</Typography>
                <Typography variant="body1">Town/City: {data.townCity ?? 'N/A'}</Typography>
                <Typography variant="body1">Street Address: {data.streetAddress ?? 'N/A'}</Typography>
              </CardContent>
            </Card>

            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6">Emergency Contact</Typography>
                <Typography variant="body1">ICE Contact: {data.iceContactName ?? 'N/A'}</Typography>
                <Typography variant="body1">ICE Phone: {data.iceContactPhoneNumber ?? 'N/A'}</Typography>
              </CardContent>
            </Card>
          </Stack>

          <Card>
            <CardContent>
              <Typography variant="h6">Roles</Typography>
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
              <Typography variant="h6">Training Program</Typography>
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
