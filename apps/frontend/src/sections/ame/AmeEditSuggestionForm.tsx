import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Title } from '../../components/Title'
import { RemoteContent } from '../../components/RemoteContent'
import useApi from '../../hooks/useApi'
import { AME_MEDICAL_TYPES } from '@mik/contracts/ame'
import type { AmeListResponse, SuggestAmeEdit } from '@mik/contracts/ame'

const MEDICAL_TYPE_LABELS: Record<string, string> = {
  EASA_CLASS_1: 'EASA Class 1',
  EASA_CLASS_2: 'EASA Class 2',
  LAPL: 'LAPL',
  FAA: 'FAA',
}

export default function AmeEditSuggestionForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const {
    data,
    isLoading,
    error: loadError,
  } = useApi<AmeListResponse>({
    url: 'v1/ame',
    params: { pageSize: 100 },
  })
  const entry = data?.entries.find((e) => e.id === id)

  const { mutation } = useApi({ url: 'v1/ame', skipFetch: true })

  const [name, setName] = useState('')
  const [medicalCentre, setMedicalCentre] = useState('')
  const [location, setLocation] = useState('')
  const [price, setPrice] = useState('')
  const [medicalTypes, setMedicalTypes] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [reportDate, setReportDate] = useState<Dayjs | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!entry) return
    setName(entry.name)
    setMedicalCentre(entry.medicalCentre)
    setLocation(entry.location)
    setPrice(entry.price != null ? String(entry.price) : '')
    setMedicalTypes(entry.medicalTypes)
    setNotes(entry.notes ?? '')
    setReportDate(dayjs(entry.reportDate))
  }, [entry])

  const toggleMedicalType = (type: string) => {
    setMedicalTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )
  }

  const handleSubmit = async () => {
    if (!id) return
    setError(null)

    if (!name.trim() || !medicalCentre.trim() || !location.trim()) {
      setError('Name, medical centre, and location are required.')
      return
    }
    if (medicalTypes.length === 0) {
      setError('Select at least one medical type.')
      return
    }
    if (!reportDate?.isValid()) {
      setError('Report date is required.')
      return
    }

    const payload: SuggestAmeEdit = {
      name: name.trim(),
      medicalCentre: medicalCentre.trim(),
      location: location.trim(),
      price: price ? parseFloat(price) : null,
      medicalTypes: medicalTypes as SuggestAmeEdit['medicalTypes'],
      notes: notes.trim() || null,
      reportDate: reportDate.format('YYYY-MM-DD'),
    }

    const result = await mutation.trigger('POST', payload, `${id}/edit-suggestion`)
    if (result.error) {
      setError(result.error.detail ?? 'Submission failed. Please try again.')
    } else {
      navigate('/club/ame-list')
    }
  }

  return (
    <Box sx={{ maxWidth: 600 }}>
      <Title label='Suggest AME Edit' />

      <RemoteContent isLoading={isLoading} error={loadError}>
        {!entry ? (
          <Typography color='text.secondary'>AME entry not found.</Typography>
        ) : (
          <>
            <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
              Your suggested changes will be reviewed by a committee member before they replace the
              current entry.
            </Typography>

            {error && (
              <Alert severity='error' sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label='AME Name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                fullWidth
              />

              <TextField
                label='Medical Centre / Group'
                value={medicalCentre}
                onChange={(e) => setMedicalCentre(e.target.value)}
                required
                fullWidth
              />

              <TextField
                label='Location (City / Country)'
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
                fullWidth
              />

              <TextField
                label='Approximate Price'
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                type='number'
                slotProps={{
                  input: { startAdornment: <InputAdornment position='start'>€</InputAdornment> },
                }}
                fullWidth
              />

              <FormControl
                component='fieldset'
                required
                error={medicalTypes.length === 0 && !!error}
              >
                <FormLabel component='legend'>Medical Types</FormLabel>
                <FormGroup row>
                  {AME_MEDICAL_TYPES.map((type) => (
                    <FormControlLabel
                      key={type}
                      control={
                        <Checkbox
                          checked={medicalTypes.includes(type)}
                          onChange={() => toggleMedicalType(type)}
                        />
                      }
                      label={MEDICAL_TYPE_LABELS[type]}
                    />
                  ))}
                </FormGroup>
                {medicalTypes.length === 0 && error && (
                  <FormHelperText>Select at least one</FormHelperText>
                )}
              </FormControl>

              <DatePicker
                label='Report Date'
                value={reportDate}
                onChange={(d) => setReportDate(d)}
                slotProps={{ textField: { fullWidth: true, required: true } }}
              />

              <TextField
                label='Notes (optional)'
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                multiline
                rows={3}
                fullWidth
              />

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button variant='contained' onClick={handleSubmit} disabled={mutation.isMutating}>
                  Submit suggestion
                </Button>
                <Button variant='outlined' onClick={() => navigate('/club/ame-list')}>
                  Cancel
                </Button>
              </Box>
            </Box>
          </>
        )}
      </RemoteContent>
    </Box>
  )
}
