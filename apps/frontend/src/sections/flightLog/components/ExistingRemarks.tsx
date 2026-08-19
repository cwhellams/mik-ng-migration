import { Box, List, ListItem, ListItemText, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { Remark } from '@mik/contracts/remarks'

interface Props {
  remarks: Remark[]
}

// Remarks already logged against this flight (e.g. a previous save of this same
// entry). Unlike DefectMarker, there is nothing to click or change here -- a remark
// has no status and nothing to resolve, it's purely "for your information" (#1226).
export const ExistingRemarks = ({ remarks }: Props) => {
  const { t } = useTranslation()

  if (remarks.length === 0) {
    return null
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant='h6'>{t('flightLog.remarks.existingSectionTitle')}</Typography>
      <List dense disablePadding>
        {remarks.map((remark) => (
          <ListItem key={remark.remarkId} disableGutters>
            <ListItemText primary={remark.description} />
          </ListItem>
        ))}
      </List>
    </Box>
  )
}
