import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Title } from '../../../components/Title'
import useApi from '../../../hooks/useApi'
import { RemoteContent } from '../../../components/RemoteContent'
import type { TrainingProgram, Syllabus } from '@backend/routes/dto/models'
import {
  createProgram,
  updateProgram,
  createSyllabus,
  publishSyllabus,
  exportSyllabus,
  copySyllabusAsDraft,
} from '../../dto/dtoApi'

function ProgramDialog({
  open,
  program,
  onClose,
  onSaved,
}: Readonly<{
  open: boolean
  program: TrainingProgram | null
  onClose: () => void
  onSaved: () => void
}>) {
  const [name, setName] = useState(program?.name ?? '')
  const [description, setDescription] = useState(program?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(program?.name ?? '')
      setDescription(program?.description ?? '')
      setError(null)
    }
  }, [open, program])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (program) {
        await updateProgram(program.programId, {
          name,
          description: description || undefined,
        })
      } else {
        await createProgram({ name, description: description || undefined })
      }
      onSaved()
      onClose()
    } catch {
      setError('Failed to save program')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>
        {program ? 'Edit Training Program' : 'New Training Program'}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          label='Name'
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          sx={{ mt: 1, mb: 2 }}
          required
        />
        <TextField
          label='Description'
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          multiline
          rows={3}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant='contained'
          onClick={handleSave}
          disabled={saving || !name.trim()}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function SyllabiSection({
  program,
  onViewSyllabus,
}: Readonly<{
  program: TrainingProgram
  onViewSyllabus: (s: Syllabus) => void
}>) {
  const {
    data: syllabi,
    isLoading,
    error,
    mutation,
  } = useApi<Syllabus[]>({
    url: `v1/dto/programs/${program.programId}/syllabi`,
  })
  const [creating, setCreating] = useState(false)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [copying, setCopying] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleCreate = async () => {
    setCreating(true)
    try {
      await createSyllabus(program.programId, {})
      await mutation.trigger('GET')
    } finally {
      setCreating(false)
    }
  }

  const handlePublish = async (syllabusId: string) => {
    setPublishing(syllabusId)
    try {
      await publishSyllabus(syllabusId)
      await mutation.trigger('GET')
    } finally {
      setPublishing(null)
    }
  }

  const handleExport = async (s: Syllabus) => {
    setExporting(s.syllabusId)
    setExportError(null)
    try {
      await exportSyllabus(s.syllabusId, s.version)
    } catch {
      setExportError('Export failed. Please try again.')
    } finally {
      setExporting(null)
    }
  }

  const handleCopy = async (syllabusId: string) => {
    setCopying(syllabusId)
    try {
      await copySyllabusAsDraft(syllabusId)
      await mutation.trigger('GET')
    } finally {
      setCopying(null)
    }
  }

  if (isLoading) return <CircularProgress size={20} />
  if (error) return <Alert severity='error'>Failed to load syllabi</Alert>

  return (
    <Box>
      <Box
        display='flex'
        alignItems='center'
        justifyContent='space-between'
        mb={1}
      >
        <Typography variant='subtitle1' fontWeight={600}>
          Syllabus Versions
        </Typography>
        <Box display='flex' gap={1}>
          <Button
            size='small'
            startIcon={<Icon icon='mdi:upload' />}
            onClick={() =>
              navigate(`/admin/dto/programs/${program.programId}/import`)
            }
          >
            Import JSON
          </Button>
          <Button
            size='small'
            variant='outlined'
            startIcon={<Icon icon='mdi:plus' />}
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Creating…' : 'New Draft'}
          </Button>
        </Box>
      </Box>
      {exportError && (
        <Alert severity='error' sx={{ mb: 1 }}>
          {exportError}
        </Alert>
      )}
      {(syllabi?.length ?? 0) === 0 ? (
        <Typography variant='body2' color='text.secondary'>
          No syllabus versions yet.
        </Typography>
      ) : (
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>Version</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Published</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {syllabi!.map((s) => (
              <TableRow key={s.syllabusId}>
                <TableCell>{s.version}</TableCell>
                <TableCell>
                  <Chip
                    label={s.status}
                    color={s.status === 'PUBLISHED' ? 'success' : 'default'}
                    size='small'
                  />
                </TableCell>
                <TableCell>
                  {s.publishedAt
                    ? new Date(s.publishedAt).toLocaleDateString()
                    : '—'}
                </TableCell>
                <TableCell align='right'>
                  <Box display='flex' gap={0.5} justifyContent='flex-end'>
                    <Button size='small' onClick={() => onViewSyllabus(s)}>
                      Edit
                    </Button>
                    <Button
                      size='small'
                      startIcon={<Icon icon='mdi:download' />}
                      disabled={exporting === s.syllabusId}
                      onClick={() => handleExport(s)}
                    >
                      {exporting === s.syllabusId
                        ? 'Exporting…'
                        : 'Export JSON'}
                    </Button>
                    <Button
                      size='small'
                      startIcon={<Icon icon='mdi:content-copy' />}
                      disabled={copying === s.syllabusId}
                      onClick={() => handleCopy(s.syllabusId)}
                    >
                      {copying === s.syllabusId ? 'Copying…' : 'Copy as Draft'}
                    </Button>
                    {(s.status === 'DRAFT' ||
                      s.status === 'WAITING_FOR_APPROVAL') && (
                      <Button
                        size='small'
                        color='success'
                        disabled={publishing === s.syllabusId}
                        onClick={() => handlePublish(s.syllabusId)}
                      >
                        {publishing === s.syllabusId
                          ? 'Publishing…'
                          : 'Publish'}
                      </Button>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  )
}

export default function DtoProgramsAdminPage() {
  const navigate = useNavigate()
  const {
    data: programs,
    isLoading,
    error,
    mutation,
  } = useApi<TrainingProgram[]>({
    url: 'v1/dto/programs',
  })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProgram, setEditingProgram] = useState<TrainingProgram | null>(
    null
  )

  const handleEdit = (program: TrainingProgram) => {
    setEditingProgram(program)
    setDialogOpen(true)
  }

  const handleCreate = () => {
    setEditingProgram(null)
    setDialogOpen(true)
  }

  return (
    <Box>
      <Title label='DTO Training Programs' />
      <Box display='flex' justifyContent='flex-end' mb={2}>
        <Button
          variant='contained'
          startIcon={<Icon icon='mdi:plus' />}
          onClick={handleCreate}
        >
          New Program
        </Button>
      </Box>
      <RemoteContent isLoading={isLoading} error={error}>
        {(programs?.length ?? 0) === 0 ? (
          <Typography color='text.secondary'>
            No training programs yet.
          </Typography>
        ) : (
          programs!.map((program) => (
            <Box
              key={program.programId}
              sx={{
                mb: 4,
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
              }}
            >
              <Box
                display='flex'
                alignItems='center'
                justifyContent='space-between'
                mb={2}
              >
                <Typography variant='h6'>{program.name}</Typography>
                <IconButton size='small' onClick={() => handleEdit(program)}>
                  <Icon icon='mdi:pencil' />
                </IconButton>
              </Box>
              {program.description && (
                <Typography variant='body2' color='text.secondary' mb={2}>
                  {program.description}
                </Typography>
              )}
              <SyllabiSection
                program={program}
                onViewSyllabus={(s) =>
                  navigate(`/admin/dto/syllabi/${s.syllabusId}`)
                }
              />
            </Box>
          ))
        )}
      </RemoteContent>
      <ProgramDialog
        open={dialogOpen}
        program={editingProgram}
        onClose={() => setDialogOpen(false)}
        onSaved={() => mutation.trigger('GET')}
      />
    </Box>
  )
}
