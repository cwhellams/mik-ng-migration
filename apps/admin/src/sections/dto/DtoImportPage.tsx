import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Title } from '@mik/ui/components/Title'
import useApi from '@mik/ui/hooks/useApi'
import type { TrainingProgram } from '@mik/contracts/dto'
import { importSyllabus } from '@mik/ui/api/dtoApi'

export default function DtoImportPage() {
  const { programId } = useParams<{ programId: string }>()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const { data: program } = useApi<TrainingProgram>({
    url: `v1/dto/programs/${programId}`,
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setError(null)
    setSuccess(false)
  }

  const handleImport = async () => {
    if (!file || !programId) return
    setImporting(true)
    setError(null)
    try {
      const result = await importSyllabus(programId, file)
      setSuccess(true)
      setTimeout(() => navigate(`/admin/dto/syllabi/${result.syllabusId}`), 1500)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Import failed'
      setError(msg)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Box>
      <Title label={`Import Syllabus JSON${program ? ` — ${program.name}` : ''}`} />
      <Typography
        variant='body1'
        sx={{
          color: 'text.secondary',
          mb: 3,
        }}
      >
        Upload a JSON file to create a new <strong>Draft</strong> syllabus version. The file is
        validated before import — no partial data will be created.
      </Typography>
      <Box
        sx={{
          mb: 2,
        }}
      >
        <Typography
          variant='subtitle2'
          sx={{
            mb: 1,
          }}
        >
          Expected JSON format:
        </Typography>
        <Box
          component='pre'
          sx={{
            background: 'action.hover',
            p: 2,
            borderRadius: 1,
            fontSize: '0.78rem',
            overflow: 'auto',
            maxHeight: 300,
          }}
        >
          {`{
  "title": "LAPL/PPL DTO Syllabus",
  "version": "2026.1",
  "description": "Optional description",
  "minBlockTimeMins": 2700,
  "flights": [
    {
      "code": "1",
      "name": "Basic handling",
      "tags": ["SOLO"],
      "description": "Straight & level, turns, climb/descend.",
      "recommendedBlockTimeMins": 60,
      "items": [
        { "name": "Steep turns", "mandatory": true },
        { "name": "Lookout technique", "mandatory": true }
      ]
    },
    {
      "code": "VT",
      "name": "Välitarkastuslento",
      "isInterimCheckpoint": true,
      "recommendedBlockTimeMins": 60,
      "items": [
        { "name": "Decision making", "mandatory": true }
      ]
    }
  ]
}`}
        </Box>
      </Box>
      <input
        type='file'
        accept='.json,application/json'
        ref={fileRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 2,
        }}
      >
        <Button
          variant='outlined'
          startIcon={<Icon icon='mdi:file-upload' />}
          onClick={() => fileRef.current?.click()}
        >
          {file ? file.name : 'Choose JSON file'}
        </Button>
        {file && (
          <Button
            variant='contained'
            startIcon={<Icon icon='mdi:upload' />}
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? <CircularProgress size={20} /> : 'Import'}
          </Button>
        )}
      </Box>
      {error && <Alert severity='error'>{error}</Alert>}
      {success && <Alert severity='success'>Import successful! Redirecting to editor…</Alert>}
      <Button
        startIcon={<Icon icon='mdi:arrow-left' />}
        onClick={() => navigate('/admin/dto')}
        sx={{ mt: 2 }}
      >
        Back to Programs
      </Button>
    </Box>
  )
}
