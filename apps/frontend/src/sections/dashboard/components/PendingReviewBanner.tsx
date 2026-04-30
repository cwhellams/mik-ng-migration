import {
  Alert,
  Box,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import { Stack } from '@mui/system'

export function PendingReviewBanner() {
  const { t } = useTranslation()

  const onboardingSteps = [
    {
      icon: 'mdi:email-open',
      title: t('registrationVerify.onboardingSteps.step1.title'),
      description: t('registrationVerify.onboardingSteps.step1.description'),
    },
    {
      icon: 'mdi:currency-eur',
      title: t('registrationVerify.onboardingSteps.step2.title'),
      description: t('registrationVerify.onboardingSteps.step2.description'),
    },
    {
      icon: 'mdi:file-document-check',
      title: t('registrationVerify.onboardingSteps.step3.title'),
      description: t('registrationVerify.onboardingSteps.step3.description'),
    },
    {
      icon: 'mdi:school',
      title: t('registrationVerify.onboardingSteps.step4.title'),
      description: t('registrationVerify.onboardingSteps.step4.description'),
    },
    {
      icon: 'mdi:account-group',
      title: t('registrationVerify.onboardingSteps.step5.title'),
      description: t('registrationVerify.onboardingSteps.step5.description'),
    },
    {
      icon: 'mdi:airplane-check',
      title: t('registrationVerify.onboardingSteps.step6.title'),
      description: t('registrationVerify.onboardingSteps.step6.description'),
    },
  ]

  return (
    <Stack spacing={2} mb={4}>
      <Alert severity='info' sx={{ mt: 2 }}>
        {t('registrationVerify.pendingReview', {})}
      </Alert>

      <Card elevation={2} sx={{ mb: 4 }}>
        <CardContent>
          <Typography
            variant='h6'
            sx={{ mb: 2, display: 'flex', alignItems: 'center' }}
          >
            <Icon icon='mdi:timeline' style={{ marginRight: 8 }} />
            {t('registrationVerify.nextStepsTitle')}
          </Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
            {t('registrationVerify.nextStepsDescription')}
          </Typography>

          <List>
            {onboardingSteps.map((step, index) => (
              <div key={index}>
                <ListItem alignItems='flex-start'>
                  <ListItemIcon>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        backgroundColor: 'primary.main',
                        color: 'white',
                        fontSize: '0.875rem',
                        fontWeight: 'bold',
                        mr: 1,
                      }}
                    >
                      {index + 1}
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          mb: 0.5,
                        }}
                      >
                        <Icon icon={step.icon} style={{ marginRight: 8 }} />
                        <Typography variant='subtitle1' fontWeight='medium'>
                          {step.title}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Typography variant='body2' color='text.secondary'>
                        {step.description}
                      </Typography>
                    }
                  />
                </ListItem>
                {index < onboardingSteps.length - 1 && (
                  <Divider component='li' />
                )}
              </div>
            ))}
          </List>
        </CardContent>
      </Card>
    </Stack>
  )
}
