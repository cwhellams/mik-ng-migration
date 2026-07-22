import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Title } from '../../../components/Title'
import useApi from '../../../hooks/useApi'
import type { SyllabusWithFlights, SyllabusFlight } from '@backend/routes/dto/models'
import { updateSyllabus, updateSyllabusFlights, publishSyllabus } from '../../dto/dtoApi'

type ItemDraft = { name: string; description: string; mandatory: boolean }
type FlightDraft = {
  code: string
  name: string
  description: string
  tags: string[]
  isInterimCheckpoint: boolean
  recommendedBlockTimeMins: string
  items: ItemDraft[]
}

function flightToJson(flight: SyllabusFlight): FlightDraft {
  return {
    code: flight.code,
    name: flight.name,
    description: flight.description ?? '',
    tags: flight.tags,
    isInterimCheckpoint: flight.isInterimCheckpoint,
    recommendedBlockTimeMins: flight.recommendedBlockTimeMins?.toString() ?? '',
    items: (flight.items ?? []).map((i) => ({
      name: i.name,
      description: i.description ?? '',
      mandatory: i.mandatory,
    })),
  }
}

export default function DtoSyllabusEditorPage() {
  const { syllabusId } = useParams<{ syllabusId: string }>()
  const navigate = useNavigate()

  const {
    data: syllabus,
    isLoading,
    error,
    mutation,
  } = useApi<SyllabusWithFlights>({
    url: `v1/dto/syllabi/${syllabusId}`,
  })

  const [description, setDescription] = useState('')
  const [minBlockTimeMins, setMinBlockTimeMins] = useState('')
  const [flights, setFlights] = useState<FlightDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    if (syllabus) {
      setDescription(syllabus.description ?? '')
      setMinBlockTimeMins(syllabus.minBlockTimeMins?.toString() ?? '')
      setFlights((syllabus.flights ?? []).map(flightToJson))
    }
  }, [syllabus?.syllabusId])

  const isEditable = syllabus?.status === 'DRAFT' || syllabus?.status === 'WAITING_FOR_APPROVAL'

  const handleSave = async () => {
    if (!syllabusId) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const parsedMin = minBlockTimeMins.trim() ? parseInt(minBlockTimeMins, 10) : null
      if (parsedMin !== null && (isNaN(parsedMin) || parsedMin <= 0)) {
        setSaveError('Minimum block time must be a positive whole number')
        setSaving(false)
        return
      }
      await updateSyllabus(syllabusId, {
        description,
        minBlockTimeMins: parsedMin,
      })
      await updateSyllabusFlights(
        syllabusId,
        flights.map((f) => {
          const rec = f.recommendedBlockTimeMins.trim()
            ? parseInt(f.recommendedBlockTimeMins, 10)
            : null
          return {
            ...f,
            recommendedBlockTimeMins: rec && rec > 0 ? rec : null,
          } as unknown as SyllabusFlight
        }),
      )
      await mutation.trigger('GET')
      setSaveSuccess(true)
    } catch (e: unknown) {
      setSaveError(
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          'Failed to save',
      )
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!syllabusId) return
    setPublishing(true)
    setSaveError(null)
    try {
      await publishSyllabus(syllabusId)
      await mutation.trigger('GET')
    } catch {
      setSaveError('Failed to publish')
    } finally {
      setPublishing(false)
    }
  }

  const addFlight = () => {
    setFlights((prev) => [
      ...prev,
      {
        code: '',
        name: '',
        description: '',
        tags: [],
        isInterimCheckpoint: false,
        recommendedBlockTimeMins: '',
        items: [],
      },
    ])
  }

  const removeFlight = (idx: number) => {
    setFlights((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateFlight = (idx: number, patch: Partial<FlightDraft>) => {
    setFlights((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  }

  const addItem = (flightIdx: number) => {
    setFlights((prev) =>
      prev.map((f, i) =>
        i === flightIdx
          ? {
              ...f,
              items: [...f.items, { name: '', description: '', mandatory: false }],
            }
          : f,
      ),
    )
  }

  const removeItem = (flightIdx: number, itemIdx: number) => {
    setFlights((prev) =>
      prev.map((f, i) =>
        i === flightIdx ? { ...f, items: f.items.filter((_, j) => j !== itemIdx) } : f,
      ),
    )
  }

  const updateItem = (flightIdx: number, itemIdx: number, patch: Partial<ItemDraft>) => {
    setFlights((prev) =>
      prev.map((f, i) =>
        i === flightIdx
          ? {
              ...f,
              items: f.items.map((it, j) => (j === itemIdx ? { ...it, ...patch } : it)),
            }
          : f,
      ),
    )
  }

  if (isLoading) return <CircularProgress />
  if (error || !syllabus) return <Alert severity='error'>Syllabus not found</Alert>

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 2,
        }}
      >
        <IconButton onClick={() => navigate('/admin/dto')}>
          <Icon icon='mdi:arrow-left' />
        </IconButton>
        <Title label={`Syllabus v${syllabus.version}`} />
        <Chip
          label={syllabus.status}
          color={syllabus.status === 'PUBLISHED' ? 'success' : 'default'}
          size='small'
        />
      </Box>
      {!isEditable && (
        <Alert severity='info' sx={{ mb: 2 }}>
          This syllabus is published and cannot be edited.
        </Alert>
      )}
      {saveError && (
        <Alert severity='error' sx={{ mb: 2 }}>
          {saveError}
        </Alert>
      )}
      {saveSuccess && (
        <Alert severity='success' sx={{ mb: 2 }}>
          Saved successfully.
        </Alert>
      )}
      <TextField
        label='Description'
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        fullWidth
        multiline
        rows={3}
        disabled={!isEditable}
        sx={{ mb: 2 }}
      />
      <TextField
        label='Minimum total block time (minutes)'
        value={minBlockTimeMins}
        onChange={(e) => setMinBlockTimeMins(e.target.value)}
        type='number'
        helperText='Training completion gate — leave blank for no requirement'
        disabled={!isEditable}
        sx={{ mb: 3, maxWidth: 340 }}
        slotProps={{
          htmlInput: { min: 1 },
        }}
      />
      <Typography
        variant='h6'
        sx={{
          mb: 1,
        }}
      >
        Flights ({flights.length})
      </Typography>
      {flights.map((flight, fi) => (
        <Box
          key={fi}
          sx={{
            mb: 3,
            p: 2,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mb: 1,
            }}
          >
            <Typography variant='subtitle2' sx={{ minWidth: 80 }}>
              Flight {fi + 1}
            </Typography>
            {isEditable && (
              <IconButton size='small' color='error' onClick={() => removeFlight(fi)}>
                <Icon icon='mdi:delete' />
              </IconButton>
            )}
          </Box>
          <Stack spacing={1.5}>
            <Box
              sx={{
                display: 'flex',
                gap: 2,
              }}
            >
              <TextField
                label='Code *'
                value={flight.code}
                onChange={(e) => updateFlight(fi, { code: e.target.value })}
                size='small'
                disabled={!isEditable}
                sx={{ width: 120 }}
              />
              <TextField
                label='Name *'
                value={flight.name}
                onChange={(e) => updateFlight(fi, { name: e.target.value })}
                size='small'
                disabled={!isEditable}
                fullWidth
              />
            </Box>
            <TextField
              label='Description'
              value={flight.description}
              onChange={(e) => updateFlight(fi, { description: e.target.value })}
              size='small'
              disabled={!isEditable}
              multiline
              rows={2}
              fullWidth
            />
            <TextField
              label='Tags (comma-separated)'
              value={flight.tags.join(', ')}
              onChange={(e) =>
                updateFlight(fi, {
                  tags: e.target.value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
              size='small'
              disabled={!isEditable}
              fullWidth
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={flight.isInterimCheckpoint}
                  onChange={(e) => updateFlight(fi, { isInterimCheckpoint: e.target.checked })}
                  disabled={!isEditable}
                />
              }
              label='Interim Checkpoint (Välitarkastuslento)'
            />
            <TextField
              label='Recommended block time (minutes)'
              value={flight.recommendedBlockTimeMins}
              onChange={(e) => updateFlight(fi, { recommendedBlockTimeMins: e.target.value })}
              type='number'
              size='small'
              disabled={!isEditable}
              helperText='Advisory — shown to instructor, not enforced'
              sx={{ maxWidth: 260 }}
              slotProps={{
                htmlInput: { min: 1 },
              }}
            />
          </Stack>

          <Divider sx={{ my: 1.5 }} />
          <Typography
            variant='subtitle2'
            sx={{
              mb: 1,
            }}
          >
            Items ({flight.items.length})
          </Typography>
          {flight.items.map((item, ii) => (
            <Box
              key={ii}
              sx={{
                display: 'flex',
                gap: 1,
                alignItems: 'flex-start',
                mb: 1,
              }}
            >
              <TextField
                label='Item name *'
                value={item.name}
                onChange={(e) => updateItem(fi, ii, { name: e.target.value })}
                size='small'
                disabled={!isEditable}
                sx={{ flex: 2 }}
              />
              <TextField
                label='Description'
                value={item.description}
                onChange={(e) => updateItem(fi, ii, { description: e.target.value })}
                size='small'
                disabled={!isEditable}
                sx={{ flex: 2 }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={item.mandatory}
                    onChange={(e) => updateItem(fi, ii, { mandatory: e.target.checked })}
                    disabled={!isEditable}
                    size='small'
                  />
                }
                label='Mandatory'
              />
              {isEditable && (
                <IconButton size='small' color='error' onClick={() => removeItem(fi, ii)}>
                  <Icon icon='mdi:delete' />
                </IconButton>
              )}
            </Box>
          ))}
          {isEditable && (
            <Button size='small' startIcon={<Icon icon='mdi:plus' />} onClick={() => addItem(fi)}>
              Add Item
            </Button>
          )}
        </Box>
      ))}
      {isEditable && (
        <Button
          variant='outlined'
          startIcon={<Icon icon='mdi:plus' />}
          onClick={addFlight}
          sx={{ mb: 3 }}
        >
          Add Flight
        </Button>
      )}
      {isEditable && (
        <Box
          sx={{
            display: 'flex',
            gap: 2,
          }}
        >
          <Button
            variant='contained'
            onClick={handleSave}
            disabled={saving}
            startIcon={<Icon icon='mdi:content-save' />}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            variant='outlined'
            color='success'
            onClick={handlePublish}
            disabled={publishing}
            startIcon={<Icon icon='mdi:check-circle' />}
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </Button>
        </Box>
      )}
    </Box>
  )
}
