import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import type { Defect } from '@mik/contracts/defects'
import { DefectMarker } from '../DefectMarker'

interface Props {
  defects: Defect[]
  aircraftRegistration?: string
  onChanged: () => void
}

// Defects already reported against this flight (e.g. via the old separate "Add
// in-flight defect" button, or a previous save of this same form) -- extracted out of
// NotesStep/FlightLogEntry so both share one copy of this block (#1226).
export const ExistingDefects = ({ defects, aircraftRegistration, onChanged }: Props) => {
  const { t } = useTranslation()

  if (defects.length === 0 || !aircraftRegistration) {
    return null
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant='h6'>{t('flightLog.defects.existingSectionTitle')}</Typography>
      {defects.map((defect) => (
        <DefectMarker
          key={defect.defectId}
          defect={defect}
          aircraftRegistration={aircraftRegistration}
          onChanged={onChanged}
        />
      ))}
    </Box>
  )
}
