import { Box, Typography, TextField, IconButton, Button, Alert, Stack } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import type { Defect } from '@mik/contracts/defects'
import type { Remark } from '@mik/contracts/remarks'
import { FleetManagerContacts } from './FleetManagerContacts'
import { ExistingDefects } from './ExistingDefects'
import { ExistingRemarks } from './ExistingRemarks'

interface Props {
  reportedDefects: string[]
  onReportedDefectsChange: (descriptions: string[]) => void
  // The flight this defect would be tied to must still be unvalidated, mirroring the
  // backend's own rule (see apps/backend/src/routes/defects/api.ts) -- hidden rather
  // than shown-then-rejected once a flight has been validated.
  canReportDefects: boolean
  existingDefects: Defect[]
  aircraftRegistration?: string
  onExistingDefectsChanged: () => void

  reportedRemarks: string[]
  onReportedRemarksChange: (descriptions: string[]) => void
  // Same editability rule as canReportDefects.
  canReportRemarks: boolean
  existingRemarks: Remark[]

  disabled?: boolean
}

interface DescriptionRowsProps {
  descriptions: string[]
  onChange: (descriptions: string[]) => void
  fieldLabel: string
  blankError: string
  disabled?: boolean
}

// One text-row-per-item editor, shared by the defect and remark lists below --
// identical shape, differing only in field label and blank-row error text.
const DescriptionRows = ({
  descriptions,
  onChange,
  fieldLabel,
  blankError,
  disabled,
}: DescriptionRowsProps) => {
  const { t } = useTranslation()

  const updateAt = (index: number, value: string) => {
    const next = [...descriptions]
    next[index] = value
    onChange(next)
  }

  const removeAt = (index: number) => {
    onChange(descriptions.filter((_, i) => i !== index))
  }

  return (
    <>
      {descriptions.map((description, index) => {
        const isBlank = description.length > 0 && description.trim().length === 0
        return (
          // The rows have no stable id until saved, so the index is the key.
          <Stack key={index} direction='row' spacing={1} sx={{ alignItems: 'flex-start' }}>
            <TextField
              value={description}
              onChange={(e) => updateAt(index, e.target.value)}
              label={fieldLabel}
              error={isBlank}
              helperText={isBlank ? blankError : undefined}
              disabled={disabled}
              multiline
              minRows={2}
              fullWidth
              autoFocus
            />
            <IconButton
              aria-label={t('general.delete')}
              onClick={() => removeAt(index)}
              disabled={disabled}
              sx={{ mt: 1 }}
            >
              <Icon icon='mdi:delete' width={20} />
            </IconButton>
          </Stack>
        )
      })}
    </>
  )
}

// Aircraft defects and remarks (#1226): one combined section for reporting both, with
// the "Add Defect" / "Add Remark" buttons next to each other. A reported defect grounds
// the aircraft until closed or transferred to HIL; a remark is purely informational --
// see ExistingRemarks and ReportRemarksSection's history for why they carry no such
// consequence.
export const DefectsAndRemarksSection = ({
  reportedDefects,
  onReportedDefectsChange,
  canReportDefects,
  existingDefects,
  aircraftRegistration,
  onExistingDefectsChanged,
  reportedRemarks,
  onReportedRemarksChange,
  canReportRemarks,
  existingRemarks,
  disabled,
}: Props) => {
  const { t } = useTranslation()

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Alert severity='warning'>
        <Typography variant='body2'>{t('flightLog.defectsAndRemarks.intro1')}</Typography>
        <Typography variant='body2' sx={{ mt: 1 }}>
          {t('flightLog.defectsAndRemarks.intro2')}
        </Typography>
        <FleetManagerContacts />
      </Alert>

      <ExistingDefects
        defects={existingDefects}
        aircraftRegistration={aircraftRegistration}
        onChanged={onExistingDefectsChanged}
      />
      <ExistingRemarks remarks={existingRemarks} />

      {(canReportDefects || canReportRemarks) && (
        <Stack direction='row' spacing={1.5}>
          {canReportDefects && (
            <Button
              variant='outlined'
              startIcon={<Icon icon='mdi:plus' width={18} />}
              onClick={() => onReportedDefectsChange([...reportedDefects, ''])}
              disabled={disabled}
            >
              {t('flightLog.defects.addDefectRow')}
            </Button>
          )}
          {canReportRemarks && (
            <Button
              variant='outlined'
              startIcon={<Icon icon='mdi:plus' width={18} />}
              onClick={() => onReportedRemarksChange([...reportedRemarks, ''])}
              disabled={disabled}
            >
              {t('flightLog.remarks.addRemarkRow')}
            </Button>
          )}
        </Stack>
      )}

      {canReportDefects && (
        <DescriptionRows
          descriptions={reportedDefects}
          onChange={onReportedDefectsChange}
          fieldLabel={t('flightLog.defects.description')}
          blankError={t('flightLog.defects.blankDescriptionError')}
          disabled={disabled}
        />
      )}
      {canReportRemarks && (
        <DescriptionRows
          descriptions={reportedRemarks}
          onChange={onReportedRemarksChange}
          fieldLabel={t('flightLog.remarks.description')}
          blankError={t('flightLog.remarks.blankDescriptionError')}
          disabled={disabled}
        />
      )}
    </Box>
  )
}
