import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs, { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import type { AircraftHil, AircraftHilDetail } from '@mik/contracts/aircraft-hil'
import type { Problem } from '@mik/contracts/problem'
import { EditDialogTitle } from '../../../../components/EditDialogTitle'
import { SaveButton } from '../../../../components/SaveButton'
import { SnackAlert } from '@mik/ui/components/SnackAlert'
import useApi from '../../../../hooks/useApi'
import { useDefects } from '../../../../hooks/useDefects'
import { useMaintenanceNotes } from '../../../../hooks/useMaintenanceNotes'
import { refreshAircraftHil } from './useAircraftHil'

export type HilEditMode = 'new' | 'edit'

const toDateOnlyIso = (date: Dayjs): string => `${date.format('YYYY-MM-DD')}T00:00:00.000Z`

interface EditHilModalProps {
  mode: HilEditMode | undefined
  aircraftRegistration: string
  hil?: AircraftHilDetail
  /** Pre-fills a new entry from the flight-log defect being deferred */
  defect?: { defectId: string; description: string }
  onClose: () => void
}

export const EditHilModal = ({
  mode,
  aircraftRegistration,
  hil,
  defect,
  onClose,
}: EditHilModalProps) => {
  const { t } = useTranslation()
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const isNew = mode === 'new'
  const isEdit = mode === 'edit'

  const api = useApi({
    url: isNew ? 'v1/aircraft-hil' : `v1/aircraft-hil/${hil?.hilId}`,
    skipFetch: true,
  })

  const [hilNumber, setHilNumber] = useState('')
  const [description, setDescription] = useState('')
  const [defectCat, setDefectCat] = useState('')
  const [restrictions, setRestrictions] = useState('')
  const [sourceRef, setSourceRef] = useState('')
  const [name, setName] = useState('')
  const [openDate, setOpenDate] = useState<Dayjs | null>(null)
  const [dueDate, setDueDate] = useState<Dayjs | null>(null)
  const [resolvedNoteId, setResolvedNoteId] = useState('')
  const [selectedDefectId, setSelectedDefectId] = useState('')
  const [deferredDefectIds, setDeferredDefectIds] = useState<string[]>([])
  const [problem, setProblem] = useState<Problem | undefined>()

  const { data: maintenanceNotes } = useMaintenanceNotes(
    isEdit && !hil?.resolvedNoteId ? aircraftRegistration : undefined,
  )

  // A hold item can only be opened from an existing, active flight-log defect.
  // When arriving without one pre-selected (the HIL page's own "Add" button),
  // the plane captain must pick which defect this entry defers.
  const needsDefectPicker = isNew && !defect
  // In edit mode the same list backs the "deferred defects" picker, so a hold
  // item opened against the wrong defect can be pointed at the right one.
  const canEditDefects = isEdit && !hil?.resolvedNoteId
  const { data: aircraftDefects } = useDefects(
    needsDefectPicker || canEditDefects ? aircraftRegistration : undefined,
  )
  const activeDefects = aircraftDefects?.filter((d) => d.status === 'ACTIVE') ?? []
  // A defect can be resolved directly while its hold item is still open; leave
  // those out, since a resolved defect must not be unlinked and reactivated.
  const linkedDefects = hil?.defects.filter((d) => d.status !== 'RESOLVED') ?? []
  // Linked defects are MOVED_TO_HIL, not ACTIVE, so add them explicitly —
  // otherwise the current selection would have no matching option.
  const selectableDefects = [...linkedDefects, ...activeDefects].filter(
    (d, index, all) => all.findIndex((other) => other.defectId === d.defectId) === index,
  )

  // Suggests the next free number as a starting point, but the plane captain
  // can overwrite it to match the number on the paper hold item list.
  const { data: existingHil } = useApi<AircraftHil[]>({
    url: 'v1/aircraft-hil',
    params: { aircraftRegistration },
    skipFetch: !isNew,
  })

  useEffect(() => {
    if (!isNew || !existingHil || hilNumber) return
    const next = existingHil.length ? Math.max(...existingHil.map((h) => h.hilNumber)) + 1 : 1
    setHilNumber(String(next))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, existingHil])

  const handleSelectDefect = (defectId: string) => {
    setSelectedDefectId(defectId)
    const selected = activeDefects.find((d) => d.defectId === defectId)
    if (selected) {
      setDescription(selected.description)
    }
  }

  useEffect(() => {
    setProblem(undefined)
    setResolvedNoteId('')
    setSelectedDefectId('')
    if (hil && mode === 'edit') {
      setHilNumber(String(hil.hilNumber))
      setDescription(hil.description)
      setDefectCat(hil.defectCat ?? '')
      setRestrictions(hil.restrictions ?? '')
      setSourceRef(hil.sourceRef ?? '')
      setName(hil.name)
      setOpenDate(dayjs(hil.openDate))
      setDueDate(hil.dueDate ? dayjs(hil.dueDate) : null)
      setDeferredDefectIds(
        hil.defects.filter((d) => d.status !== 'RESOLVED').map((d) => d.defectId),
      )
    } else {
      setHilNumber('')
      setDescription(defect?.description ?? '')
      setDefectCat('')
      setRestrictions('')
      setSourceRef('')
      setName('')
      setOpenDate(dayjs())
      setDueDate(null)
      setDeferredDefectIds([])
    }
  }, [hil, mode, defect])

  const validationProblem = (detail: string): Problem => ({
    type: 'validation-error',
    title: 'Validation Error',
    detail,
    status: 400,
  })

  const handleSave = async () => {
    const defectId = defect?.defectId ?? selectedDefectId
    if (isNew && !defectId) {
      setProblem(validationProblem(t('aircraft.hil.defectRequired')))
      return
    }
    // Defect category, source ref and due date are optional (issue #1120)
    if (!hilNumber.trim() || !description.trim() || !name.trim()) {
      setProblem(validationProblem(t('aircraft.hil.requiredFields')))
      return
    }
    const hilNumberValue = Number(hilNumber)
    if (!Number.isInteger(hilNumberValue) || hilNumberValue <= 0) {
      setProblem(validationProblem(t('aircraft.hil.hilNumberInvalid')))
      return
    }
    if (!openDate) {
      setProblem(validationProblem(t('aircraft.hil.datesRequired')))
      return
    }
    if (dueDate && dueDate.isBefore(openDate, 'day')) {
      setProblem(validationProblem(t('aircraft.hil.dueBeforeOpen')))
      return
    }
    // Only sent when the plane captain actually changed which defects this hold
    // item defers, so an unrelated edit never touches the defect statuses.
    const defectsChanged =
      canEditDefects &&
      (deferredDefectIds.length !== linkedDefects.length ||
        deferredDefectIds.some((id) => !linkedDefects.some((d) => d.defectId === id)))

    // A hold item must defer a defect at all times, but it can be changed
    if (defectsChanged && deferredDefectIds.length === 0) {
      setProblem(validationProblem(t('aircraft.hil.defectRequired')))
      return
    }

    setProblem(undefined)

    const common = {
      hilNumber: hilNumberValue,
      description: description.trim(),
      defectCat: defectCat.trim() || null,
      restrictions: restrictions.trim() || null,
      sourceRef: sourceRef.trim() || null,
      name: name.trim(),
      // openDate/dueDate are date pickers, not date-times: serialize the
      // calendar day the user picked as UTC midnight rather than
      // toISOString(), which shifts by the local UTC offset and can roll
      // the date across midnight.
      openDate: toDateOnlyIso(openDate),
      dueDate: dueDate ? toDateOnlyIso(dueDate) : null,
    }

    const { error } = isNew
      ? await api.mutation.trigger('POST', {
          ...common,
          aircraftRegistration,
          defectId,
        })
      : await api.mutation.trigger('PATCH', {
          ...common,
          ...(resolvedNoteId.trim() ? { resolvedNoteId: resolvedNoteId.trim() } : {}),
          ...(defectsChanged ? { defectIds: deferredDefectIds } : {}),
        })

    if (error) {
      setProblem(error)
      return
    }

    await refreshAircraftHil()
    onClose()
  }

  if (!mode) return null

  return (
    <Dialog open={!!mode} onClose={onClose} maxWidth='sm' fullWidth fullScreen={isXs}>
      <EditDialogTitle
        title={isNew ? t('aircraft.hil.add') : t('aircraft.hil.edit')}
        onClose={onClose}
      />
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <SnackAlert problem={problem} />

          {needsDefectPicker && (
            <FormControl fullWidth required>
              <InputLabel>{t('aircraft.hil.selectDefect')}</InputLabel>
              <Select
                value={selectedDefectId}
                label={t('aircraft.hil.selectDefect')}
                onChange={(e) => handleSelectDefect(e.target.value)}
              >
                {activeDefects.length === 0 && (
                  <MenuItem value='' disabled>
                    <em>{t('aircraft.hil.noActiveDefects')}</em>
                  </MenuItem>
                )}
                {activeDefects.map((d) => (
                  <MenuItem key={d.defectId} value={d.defectId}>
                    {d.description}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <TextField
            label={t('aircraft.hil.hilNumber')}
            value={hilNumber}
            onChange={(e) => setHilNumber(e.target.value)}
            required
            fullWidth
            helperText={t('aircraft.hil.hilNumberHelp')}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />

          <TextField
            label={t('aircraft.hil.defect')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            fullWidth
            multiline
            minRows={2}
            helperText={t('aircraft.hil.defectHelp')}
          />

          {canEditDefects && (
            <FormControl fullWidth>
              <InputLabel>{t('aircraft.hil.deferredDefects')}</InputLabel>
              <Select
                multiple
                value={deferredDefectIds}
                label={t('aircraft.hil.deferredDefects')}
                onChange={(e) =>
                  setDeferredDefectIds(
                    typeof e.target.value === 'string' ? [e.target.value] : e.target.value,
                  )
                }
                renderValue={(selected) =>
                  selected
                    .map(
                      (id) => selectableDefects.find((d) => d.defectId === id)?.description ?? id,
                    )
                    .join(', ')
                }
              >
                {selectableDefects.map((d) => (
                  <MenuItem key={d.defectId} value={d.defectId}>
                    {d.description}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>{t('aircraft.hil.deferredDefectsHelp')}</FormHelperText>
            </FormControl>
          )}

          <TextField
            label={t('aircraft.hil.defectCat')}
            value={defectCat}
            onChange={(e) => setDefectCat(e.target.value)}
            fullWidth
            helperText={t('aircraft.hil.defectCatHelp')}
          />

          <TextField
            label={t('aircraft.hil.restrictions')}
            value={restrictions}
            onChange={(e) => setRestrictions(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            helperText={t('aircraft.hil.restrictionsHelp')}
          />

          <TextField
            label={t('aircraft.hil.sourceRef')}
            value={sourceRef}
            onChange={(e) => setSourceRef(e.target.value)}
            fullWidth
            helperText={t('aircraft.hil.sourceRefHelp')}
          />

          <TextField
            label={t('aircraft.hil.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            helperText={t('aircraft.hil.nameHelp')}
          />

          <DatePicker
            label={t('aircraft.hil.openDate')}
            value={openDate}
            onChange={setOpenDate}
            slotProps={{ textField: { fullWidth: true, required: true } }}
          />

          <DatePicker
            label={t('aircraft.hil.dueDate')}
            value={dueDate}
            onChange={setDueDate}
            minDate={openDate ?? undefined}
            slotProps={{
              textField: {
                fullWidth: true,
                helperText: t('aircraft.hil.dueDateHelp'),
              },
              // Optional (issue #1120): let the plane captain empty the field again
              field: { clearable: true, onClear: () => setDueDate(null) },
            }}
          />

          {!isNew && !hil?.resolvedNoteId && (
            <FormControl fullWidth>
              <InputLabel>{t('aircraft.hil.resolvedNoteId')}</InputLabel>
              <Select
                value={resolvedNoteId}
                label={t('aircraft.hil.resolvedNoteId')}
                onChange={(e) => setResolvedNoteId(e.target.value)}
              >
                <MenuItem value=''>
                  <em>{t('aircraft.hil.noNote')}</em>
                </MenuItem>
                {maintenanceNotes?.map((note) => (
                  <MenuItem key={note.noteId} value={note.noteId}>
                    {note.description} — {note.performedBy}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('general.cancel')}</Button>
        <SaveButton onClick={handleSave} disabled={api.mutation.isMutating} />
      </DialogActions>
    </Dialog>
  )
}
