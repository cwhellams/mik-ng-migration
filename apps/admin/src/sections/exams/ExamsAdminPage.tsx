import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
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
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Title } from '@mik/ui/components/Title'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import type { Exam, ExamVersion } from '@mik/contracts/exams'
import {
  adminCreateExam,
  adminUpdateExam,
  adminCreateVersion,
  adminGetVersions,
  adminPublishVersion,
  adminDeleteVersion,
} from '@mik/ui/api/examApi'
import { EXAM_LANGUAGES, type ExamLanguage } from '@mik/ui/utils/examLanguage'

type ExamType = 'AFM' | 'SELF_STUDY' | 'DTO' | 'OTHER'

interface ExamDialogProps {
  open: boolean
  exam: Exam | null
  onClose: () => void
  onSaved: () => void
}

function ExamDialog({ open, exam, onClose, onSaved }: Readonly<ExamDialogProps>) {
  const { t } = useTranslation()
  const [name, setName] = useState(exam?.name ?? '')
  const [examType, setExamType] = useState<ExamType>((exam?.examType as ExamType) ?? 'OTHER')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(exam?.name ?? '')
      setExamType((exam?.examType as ExamType) ?? 'OTHER')
      setError(null)
    }
  }, [open, exam?.examId, exam?.name, exam?.examType])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (exam?.examId) {
        await adminUpdateExam(exam.examId, { name, examType })
      } else {
        await adminCreateExam({ name, examType })
      }
      onSaved()
    } catch {
      setError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{exam ? t('exams.admin.editExam') : t('exams.admin.createExam')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          label={t('common.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          required
          sx={{ mb: 2, mt: 1 }}
        />
        <FormControl fullWidth>
          <InputLabel>{t('exams.admin.examType')}</InputLabel>
          <Select
            value={examType}
            label={t('exams.admin.examType')}
            onChange={(e) => setExamType(e.target.value as ExamType)}
          >
            {['AFM', 'SELF_STUDY', 'DTO', 'OTHER'].map((et) => (
              <MenuItem key={et} value={et}>
                {et}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={handleSave} disabled={saving || !name} variant='contained'>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

interface NewVersionDialogProps {
  open: boolean
  examId: string
  onClose: () => void
  onCreated: (v: ExamVersion) => void
}

function NewVersionDialog({ open, examId, onClose, onCreated }: Readonly<NewVersionDialogProps>) {
  const { t } = useTranslation()
  const [defaultLanguage, setDefaultLanguage] = useState<ExamLanguage>('en')
  const [supportedLanguages, setSupportedLanguages] = useState<ExamLanguage[]>(['en'])
  const [passPercent, setPassPercent] = useState(75)
  const [cloneFromPublished, setCloneFromPublished] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    setSaving(true)
    setError(null)
    try {
      const ver = await adminCreateVersion(examId, {
        defaultLanguage,
        supportedLanguages,
        passPercent,
        cloneFromPublished,
      })
      onCreated(ver)
    } catch {
      setError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{t('exams.admin.newVersion')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <FormControl fullWidth sx={{ mb: 2, mt: 1 }}>
          <InputLabel>{t('exams.admin.supportedLanguages')}</InputLabel>
          <Select
            multiple
            value={supportedLanguages}
            label={t('exams.admin.supportedLanguages')}
            renderValue={(selected) =>
              (selected as string[]).map((lang) => t(`exams.languages.${lang}`)).join(', ')
            }
            onChange={(e) => {
              const nextLanguages = (
                typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value
              ) as ExamLanguage[]
              setSupportedLanguages(nextLanguages)
              if (!nextLanguages.includes(defaultLanguage) && nextLanguages[0]) {
                setDefaultLanguage(nextLanguages[0])
              }
            }}
          >
            {EXAM_LANGUAGES.map((lang) => (
              <MenuItem key={lang} value={lang}>
                <Checkbox checked={supportedLanguages.includes(lang)} />
                <ListItemText primary={t(`exams.languages.${lang}`)} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>{t('exams.admin.defaultLanguage')}</InputLabel>
          <Select
            value={defaultLanguage}
            label={t('exams.admin.defaultLanguage')}
            onChange={(e) => setDefaultLanguage(e.target.value as ExamLanguage)}
            disabled={supportedLanguages.length === 0}
          >
            {supportedLanguages.map((lang) => (
              <MenuItem key={lang} value={lang}>
                {t(`exams.languages.${lang}`)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label={t('exams.admin.passPercent')}
          type='number'
          value={passPercent}
          onChange={(e) => setPassPercent(Number(e.target.value))}
          fullWidth
          sx={{ mb: 2 }}
          slotProps={{
            htmlInput: { min: 0, max: 100 },
          }}
        />
        <FormControl fullWidth>
          <InputLabel>{t('exams.admin.cloneFromPublished')}</InputLabel>
          <Select
            value={cloneFromPublished ? 'yes' : 'no'}
            label={t('exams.admin.cloneFromPublished')}
            onChange={(e) => setCloneFromPublished(e.target.value === 'yes')}
          >
            <MenuItem value='no'>{t('common.no')}</MenuItem>
            <MenuItem value='yes'>{t('common.yes')}</MenuItem>
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          onClick={handleCreate}
          disabled={saving || supportedLanguages.length === 0}
          variant='contained'
        >
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

interface VersionsRowProps {
  exam: Exam
  onEditExam: (exam: Exam) => void
  onEditVersion: (versionId: string) => void
}

function VersionsRow({ exam, onEditExam, onEditVersion }: Readonly<VersionsRowProps>) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [versions, setVersions] = useState<ExamVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newVersionOpen, setNewVersionOpen] = useState(false)

  const loadVersions = async () => {
    setLoading(true)
    setError(null)
    try {
      const v = await adminGetVersions(exam.examId)
      setVersions(v)
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  const handleExpand = () => {
    if (!expanded) loadVersions()
    setExpanded(!expanded)
  }

  const handlePublish = async (versionId: string) => {
    setError(null)
    try {
      await adminPublishVersion(versionId)
      await loadVersions()
    } catch {
      setError(t('common.error'))
    }
  }

  const handleDeleteVersion = async (versionId: string) => {
    if (!confirm(t('common.confirmDelete'))) return
    setError(null)
    try {
      await adminDeleteVersion(versionId)
      await loadVersions()
    } catch {
      setError(t('common.error'))
    }
  }

  const statusColor = (status: string) => {
    if (status === 'PUBLISHED') return 'success'
    if (status === 'RETIRED') return 'default'
    return 'warning'
  }

  return (
    <>
      <TableRow>
        <TableCell>
          <IconButton size='small' onClick={handleExpand}>
            <Icon icon={expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
          </IconButton>
        </TableCell>
        <TableCell>{exam.examId}</TableCell>
        <TableCell>{exam.name}</TableCell>
        <TableCell>{exam.examType}</TableCell>
        <TableCell>
          <Button
            size='small'
            startIcon={<Icon icon='mdi:pencil' />}
            onClick={() => onEditExam(exam)}
            sx={{ mr: 1 }}
          >
            {t('exams.admin.editExam')}
          </Button>
          <Button
            size='small'
            startIcon={<Icon icon='mdi:plus' />}
            onClick={() => {
              setNewVersionOpen(true)
            }}
          >
            {t('exams.admin.newVersion')}
          </Button>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow>
          <TableCell colSpan={5} sx={{ py: 0, bgcolor: 'action.hover' }}>
            <Box sx={{ p: 2 }}>
              {error && (
                <Alert severity='error' sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              {loading && <Typography>{t('common.loading')}</Typography>}
              {versions.map((v) => (
                <Box
                  key={v.versionId}
                  sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}
                >
                  <Chip
                    label={v.status}
                    size='small'
                    color={statusColor(v.status) as 'success' | 'warning' | 'default'}
                  />
                  <Typography variant='body2'>
                    v{v.versionNumber} — {v.defaultLanguage} — {v.passPercent}%
                  </Typography>
                  {v.status === 'DRAFT' && (
                    <Button
                      size='small'
                      startIcon={<Icon icon='mdi:pencil' />}
                      onClick={() => onEditVersion(v.versionId)}
                    >
                      {t('exams.admin.editVersion')}
                    </Button>
                  )}
                  {v.status === 'DRAFT' && (
                    <Button
                      size='small'
                      color='success'
                      startIcon={<Icon icon='mdi:publish' />}
                      onClick={() => handlePublish(v.versionId)}
                    >
                      {t('exams.admin.publish')}
                    </Button>
                  )}
                  {v.status === 'DRAFT' && (
                    <IconButton
                      size='small'
                      color='error'
                      onClick={() => handleDeleteVersion(v.versionId)}
                    >
                      <Icon icon='mdi:delete' />
                    </IconButton>
                  )}
                </Box>
              ))}
            </Box>
          </TableCell>
        </TableRow>
      )}

      <NewVersionDialog
        open={newVersionOpen}
        examId={exam.examId}
        onClose={() => setNewVersionOpen(false)}
        onCreated={(v) => {
          setNewVersionOpen(false)
          queueMicrotask(() => {
            onEditVersion(v.versionId)
          })
        }}
      />
    </>
  )
}

export default function ExamsAdminPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: exams, isLoading, error, mutate } = useApi<Exam[]>({ url: 'v1/exams/admin/exams' })

  const [examDialogOpen, setExamDialogOpen] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)

  const handleSaved = () => {
    setExamDialogOpen(false)
    setEditingExam(null)
    mutate()
  }

  return (
    <Box>
      <Title label={t('exams.admin.title')} />

      <Button
        variant='contained'
        startIcon={<Icon icon='mdi:plus' />}
        onClick={() => {
          setEditingExam(null)
          setExamDialogOpen(true)
        }}
        sx={{ mb: 2 }}
      >
        {t('exams.admin.createExam')}
      </Button>

      <RemoteContent isLoading={isLoading} error={error}>
        {!exams?.length ? (
          <Alert severity='info'>{t('exams.noExams')}</Alert>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>ID</TableCell>
                <TableCell>{t('common.name')}</TableCell>
                <TableCell>{t('exams.admin.examType')}</TableCell>
                <TableCell>{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {exams.map((exam) => (
                <VersionsRow
                  key={exam.examId}
                  exam={exam}
                  onEditExam={(e) => {
                    setEditingExam(e)
                    setExamDialogOpen(true)
                  }}
                  onEditVersion={(versionId) => {
                    navigate(`/admin/exams/versions/${versionId}`)
                  }}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </RemoteContent>

      <ExamDialog
        open={examDialogOpen}
        exam={editingExam}
        onClose={() => setExamDialogOpen(false)}
        onSaved={handleSaved}
      />
    </Box>
  )
}
