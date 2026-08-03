import { Alert, Button, Stack, Typography } from '@mui/material'

interface WizardDraftChooserBannerProps {
  title: string
  body: string
  resumeLabel: string
  startFreshLabel: string
  onResumeMostRecent: () => void
  onStartFresh: () => void
}

// Shown instead of a wizard's normal content when useWizardDraftGate finds more than
// one orphaned draft for a logical key (e.g. several old, abandoned tabs each left one
// behind) — deliberately just two buttons rather than a full per-candidate picker.
export const WizardDraftChooserBanner = ({
  title,
  body,
  resumeLabel,
  startFreshLabel,
  onResumeMostRecent,
  onStartFresh,
}: WizardDraftChooserBannerProps) => (
  <Alert severity='info' sx={{ mb: 2 }}>
    <Typography variant='subtitle2' sx={{ fontWeight: 700 }}>
      {title}
    </Typography>
    <Typography variant='body2' sx={{ mb: 1 }}>
      {body}
    </Typography>
    <Stack direction='row' spacing={1}>
      <Button variant='contained' size='small' onClick={onResumeMostRecent}>
        {resumeLabel}
      </Button>
      <Button variant='outlined' size='small' onClick={onStartFresh}>
        {startFreshLabel}
      </Button>
    </Stack>
  </Alert>
)
