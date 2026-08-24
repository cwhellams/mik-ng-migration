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
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Title } from '@mik/ui/components/Title'
import useApi from '../../hooks/useApi'
import { AME_MEDICAL_TYPES } from '@mik/contracts/ame'
import type { CreateAmeEntry } from '@mik/contracts/ame'

const MEDICAL_TYPE_LABELS: Record<string, string> = {
  EASA_CLASS_1: 'EASA Class 1',
  EASA_CLASS_2: 'EASA Class 2',
  LAPL: 'LAPL',
  FAA: 'FAA',
}

export default function AmeSubmitForm() {
  const navigate = useNavigate()
  const { mutation } = useApi<CreateAmeEntry>({ url: 'v1/ame', skipFetch: true })

  const [name, setName] = useState('')
  const [medicalCentre, setMedicalCentre] = useState('')
  const [location, setLocation] = useState('')
  const [price, setPrice] = useState('')
  const [medicalTypes, setMedicalTypes] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [reportDate, setReportDate] = useState<Dayjs | null>(dayjs())
  const [error, setError] = useState<string | null>(null)

  const toggleMedicalType = (type: string) => {
    setMedicalTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )
  }

  const handleSubmit = async () => {
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

    const payload: CreateAmeEntry = {
      name: name.trim(),
      medicalCentre: medicalCentre.trim(),
      location: location.trim(),
      price: price ? parseFloat(price) : null,
      medicalTypes: medicalTypes as CreateAmeEntry['medicalTypes'],
      notes: notes.trim() || null,
      reportDate: reportDate.format('YYYY-MM-DD'),
    }

    const result = await mutation.trigger('POST', payload)
    if (result.error) {
      setError(result.error.detail ?? 'Submission failed. Please try again.')
    } else {
      navigate('/club/ame-list')
    }
  }

  return (
    <Box sx={{ maxWidth: 600 }}>
      <Title label='Submit AME Recommendation' />

      <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
        Your submission will be reviewed by a committee member before appearing in the directory.
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

        <FormControl component='fieldset' required error={medicalTypes.length === 0 && !!error}>
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
            Submit
          </Button>
          <Button variant='outlined' onClick={() => navigate('/club/ame-list')}>
            Cancel
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
