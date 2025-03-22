import { CircularProgress, Card, CardContent, Typography, Box, Stack, Chip, IconButton } from '@mui/material';
import useApi from '../../hooks/useApi'; // Assume useApi is a custom hook wrapping Axios
import { Member } from '@backend/routes/members/models'
import { useTranslation } from 'react-i18next';
import { Icon } from '@iconify/react';
import { useState } from 'react';
import EditMemberModal from './components/EditMemberModal';

const MyProfile = () => {
  const { t } = useTranslation();
  const { data, isLoading, error } = useApi<Member>({ path: 'v1/members/me' })
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editMode, setEditMode] = useState<'personalInfo' | 'emergencyContact'>('personalInfo');

  const handleOpenEditModal = (mode: 'personalInfo' | 'emergencyContact') => {
    setEditMode(mode);
    setEditModalOpen(true);
  };

  const handleSaveMemberData = async (updatedData: Partial<Member>) => {
    console.log('updatedData', updatedData)
  };

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
          {t('error.loadingMemberData', 'Error loading member data.')}
        </Typography>
      ) : (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 3, justifyContent: 'flex-end' }}>
            {
              data.roles && data.roles.length > 0 && (
                data.roles.map((role, index) => (
                  <Chip
                    key={index}
                    label={t(`roles.${role}`)}
                    color="primary"
                    icon={<Icon icon="mdi:key" />}
                  />
                ))
              )
            }
          </Stack>

          <Stack spacing={3}>
            <Stack direction={{ sm: 'column', md: 'row' }} spacing={3}>
              <Card sx={{ flex: 1, position: 'relative' }}>
                <IconButton
                  size="small"
                  aria-label="edit member info"
                  onClick={() => handleOpenEditModal('personalInfo')}
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    backgroundColor: 'background.paper',
                    boxShadow: 0,
                    '&:hover': { backgroundColor: 'background.default' }
                  }}
                >
                  <Icon icon="mdi:pencil" width={18} />
                </IconButton>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                    <Icon icon="mdi:account" style={{ marginRight: 8 }} />
                    {t('member.info')}
                  </Typography>

                  <Stack spacing={1.5}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ width: 100 }}>
                        {t('member.fullname')}:
                      </Typography>
                      <Typography variant="body1">{data.firstName} {data.lastName}</Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ width: 100 }}>
                        {t('member.email')}:
                      </Typography>
                      <Typography variant="body1">{data.email}</Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ width: 100 }}>
                        {t('member.phone')}:
                      </Typography>
                      <Typography variant="body1">{data.phoneNumber || 'N/A'}</Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ width: 100 }}>
                        {t('member.address')}:
                      </Typography>
                      <Typography variant="body1">
                        {[data.streetAddress, `${data.postcode || ''} ${data.townCity || ''}`]
                          .filter(Boolean)
                          .join(', ') || 'N/A'}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>

              <Card sx={{ flex: 1, position: 'relative' }}>
                <IconButton
                  size="small"
                  aria-label="edit emergency contact"
                  onClick={() => handleOpenEditModal('emergencyContact')}
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    backgroundColor: 'background.paper',
                    boxShadow: 0,
                    '&:hover': { backgroundColor: 'background.default' }
                  }}
                >
                  <Icon icon="mdi:pencil" width={18} />
                </IconButton>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                    <Icon icon="mdi:phone-alert" style={{ marginRight: 8 }} />
                    {t('member.emergencyContact')}
                  </Typography>

                  <Stack spacing={1.5}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ width: 150 }}>
                        {t('member.iceContact')}:
                      </Typography>
                      <Typography variant="body1">{data.iceContactName || 'N/A'}</Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ width: 150 }}>
                        {t('member.icePhone')}:
                      </Typography>
                      <Typography variant="body1">{data.iceContactPhoneNumber || 'N/A'}</Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>

            <Card>
              <CardContent>
                <Typography variant="h6">{t('member.trainingProgram')}</Typography>
                <Typography variant="body1">
                  {data.isTrainingProgramPilot ? 'Is a Training Program Pilot' : 'Not a Training Program Pilot'}
                </Typography>
              </CardContent>
            </Card>
          </Stack>

          <EditMemberModal
            open={editModalOpen}
            onClose={() => setEditModalOpen(false)}
            mode={editMode}
            memberData={data}
            onSave={handleSaveMemberData}
          />
        </>
      )}
    </Box>
  );
};

export default MyProfile;
