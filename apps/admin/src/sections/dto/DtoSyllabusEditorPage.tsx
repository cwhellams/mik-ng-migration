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
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Title } from '@mik/ui/components/Title'
import { MarkdownContent } from '@mik/ui/components/MarkdownContent'
import useApi from '../../hooks/useApi'
import type { SyllabusWithFlights, SyllabusFlight } from '@mik/contracts/dto'
import {
  updateSyllabus,
  updateSyllabusFlights,
  submitSyllabusForApproval,
  withdrawSyllabus,
  publishSyllabus,
  patchSyllabusText,
  statusChipColor,
  FLIGHT_TYPE_OPTIONS,
} from '@mik/ui/api/dtoApi'
import PublishSyllabusDialog from './PublishSyllabusDialog'

type ItemDraft = { itemId?: string; name: string; description: string; mandatory: boolean }
type FlightDraft = {
  flightId?: string
  code: string
  name: string
  description: string
  tags: string[]
  isInterimCheckpoint: boolean
  recommendedBlockTimeMins: string
  flightType: string
  easaFclReference: string
  items: ItemDraft[]
}

function flightToJson(flight: SyllabusFlight): FlightDraft {
  return {
    flightId: flight.flightId,
    code: flight.code,
    name: flight.name,
    description: flight.description ?? '',
    tags: flight.tags,
    isInterimCheckpoint: flight.isInterimCheckpoint,
    recommendedBlockTimeMins: flight.recommendedBlockTimeMins?.toString() ?? '',
    flightType: flight.flightType ?? '',
    easaFclReference: flight.easaFclReference ?? '',
    items: (flight.items ?? []).map((i) => ({
      itemId: i.itemId,
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
  const [generalInformation, setGeneralInformation] = useState('')
  const [requirementsExperienceCredit, setRequirementsExperienceCredit] = useState('')
  const [minBlockTimeMins, setMinBlockTimeMins] = useState('')
  const [flights, setFlights] = useState<FlightDraft[]>([])
  const [typoFixMode, setTypoFixMode] = useState(false)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [submittingForApproval, setSubmittingForApproval] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const resetDraftFromSyllabus = (source: SyllabusWithFlights | null | undefined = syllabus) => {
    if (!source) return
    setDescription(source.description ?? '')
    setGeneralInformation(source.generalInformation ?? '')
    setRequirementsExperienceCredit(source.requirementsExperienceCredit ?? '')
    setMinBlockTimeMins(source.minBlockTimeMins?.toString() ?? '')
    setFlights((source.flights ?? []).map(flightToJson))
  }

  useEffect(() => {
    resetDraftFromSyllabus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syllabus?.syllabusId])

  const isDraftEditable = syllabus?.status === 'DRAFT'
  const isTextEditable = isDraftEditable || (syllabus?.status === 'PUBLISHED' && typoFixMode)

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
        requirementsExperienceCredit,
        generalInformation,
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
            flightType: f.flightType || null,
            easaFclReference: f.easaFclReference.trim() || null,
          } as unknown as SyllabusFlight
        }),
      )
      const { data: fresh } = await mutation.trigger('GET')
      // upsertSyllabusFlights deletes+reinserts flights/items with brand new
      // IDs — re-sync local draft state so stale flightId/itemId values
      // never linger into a later Fix Typos session.
      resetDraftFromSyllabus(fresh)
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

  const handleSaveTypoFixes = async () => {
    if (!syllabusId) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await patchSyllabusText(syllabusId, {
        description,
        requirementsExperienceCredit,
        generalInformation,
        flights: flights
          .filter((f) => f.flightId)
          .map((f) => ({
            flightId: f.flightId!,
            name: f.name,
            description: f.description,
            items: f.items
              .filter((i) => i.itemId)
              .map((i) => ({
                itemId: i.itemId!,
                name: i.name,
                description: i.description,
              })),
          })),
      })
      const { data: fresh } = await mutation.trigger('GET')
      resetDraftFromSyllabus(fresh)
      setTypoFixMode(false)
      setSaveSuccess(true)
    } catch (e: unknown) {
      setSaveError(
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          'Failed to save typo fixes',
      )
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitForApproval = async () => {
    if (!syllabusId) return
    setSubmittingForApproval(true)
    setSaveError(null)
    try {
      await submitSyllabusForApproval(syllabusId)
      const { data: fresh } = await mutation.trigger('GET')
      resetDraftFromSyllabus(fresh)
    } catch {
      setSaveError('Failed to submit for approval')
    } finally {
      setSubmittingForApproval(false)
    }
  }

  const handleWithdraw = async () => {
    if (!syllabusId) return
    setWithdrawing(true)
    setSaveError(null)
    try {
      await withdrawSyllabus(syllabusId)
      const { data: fresh } = await mutation.trigger('GET')
      resetDraftFromSyllabus(fresh)
    } catch {
      setSaveError('Failed to withdraw')
    } finally {
      setWithdrawing(false)
    }
  }

  const handlePublish = async (approvalReference: string | null) => {
    if (!syllabusId) return
    setPublishing(true)
    setSaveError(null)
    try {
      await publishSyllabus(syllabusId, approvalReference)
      const { data: fresh } = await mutation.trigger('GET')
      resetDraftFromSyllabus(fresh)
      setPublishDialogOpen(false)
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
        flightType: '',
        easaFclReference: '',
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
        <Chip label={syllabus.status} color={statusChipColor(syllabus.status)} size='small' />
      </Box>
      {syllabus.status === 'WAITING_FOR_APPROVAL' && (
        <Alert severity='info' sx={{ mb: 2 }}>
          Awaiting authority approval
          {syllabus.submittedForApprovalAt
            ? ` — submitted ${new Date(syllabus.submittedForApprovalAt).toLocaleDateString()}`
            : ''}
          . Editing is locked; withdraw to make further changes.
        </Alert>
      )}
      {syllabus.status === 'PUBLISHED' && !typoFixMode && (
        <Alert severity='info' sx={{ mb: 2 }}>
          This syllabus is published and cannot be structurally edited.
          {syllabus.approvalReference && ` Approval reference: ${syllabus.approvalReference}.`} Use
          &quot;Fix Typos&quot; for text-only corrections.
        </Alert>
      )}
      {syllabus.status === 'ARCHIVED' && (
        <Alert severity='warning' sx={{ mb: 2 }}>
          This syllabus version is archived (superseded by a newer published version).
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
      {isTextEditable ? (
        <TextField
          label='Description'
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          multiline
          rows={3}
          helperText='Markdown supported'
          sx={{ mb: 2 }}
        />
      ) : (
        syllabus.descriptionHtml && (
          <Box sx={{ mb: 2 }}>
            <Typography variant='overline' color='text.secondary'>
              Description
            </Typography>
            <MarkdownContent html={syllabus.descriptionHtml} />
          </Box>
        )
      )}

      {isTextEditable ? (
        <TextField
          label='General information'
          value={generalInformation}
          onChange={(e) => setGeneralInformation(e.target.value)}
          fullWidth
          multiline
          rows={3}
          helperText='Markdown supported'
          sx={{ mb: 2 }}
        />
      ) : (
        syllabus.generalInformationHtml && (
          <Box sx={{ mb: 2 }}>
            <Typography variant='overline' color='text.secondary'>
              General information
            </Typography>
            <MarkdownContent html={syllabus.generalInformationHtml} />
          </Box>
        )
      )}

      {isTextEditable ? (
        <TextField
          label='Requirements & Experience credit'
          value={requirementsExperienceCredit}
          onChange={(e) => setRequirementsExperienceCredit(e.target.value)}
          fullWidth
          multiline
          rows={3}
          helperText='Markdown supported'
          sx={{ mb: 2 }}
        />
      ) : (
        syllabus.requirementsExperienceCreditHtml && (
          <Box sx={{ mb: 2 }}>
            <Typography variant='overline' color='text.secondary'>
              Requirements &amp; Experience credit
            </Typography>
            <MarkdownContent html={syllabus.requirementsExperienceCreditHtml} />
          </Box>
        )
      )}
      <TextField
        label='Minimum total block time (minutes)'
        value={minBlockTimeMins}
        onChange={(e) => setMinBlockTimeMins(e.target.value)}
        type='number'
        helperText='Training completion gate — leave blank for no requirement'
        disabled={!isDraftEditable}
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
            {isDraftEditable && (
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
                disabled={!isDraftEditable}
                sx={{ width: 120 }}
              />
              <TextField
                label='Name *'
                value={flight.name}
                onChange={(e) => updateFlight(fi, { name: e.target.value })}
                size='small'
                disabled={!isTextEditable}
                fullWidth
              />
            </Box>
            <TextField
              label='Description'
              value={flight.description}
              onChange={(e) => updateFlight(fi, { description: e.target.value })}
              size='small'
              disabled={!isTextEditable}
              multiline
              rows={2}
              fullWidth
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                select
                label='Flight type'
                value={flight.flightType}
                onChange={(e) => updateFlight(fi, { flightType: e.target.value })}
                size='small'
                disabled={!isDraftEditable}
                sx={{ minWidth: 160 }}
              >
                <MenuItem value=''>—</MenuItem>
                {FLIGHT_TYPE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label='EASA FCL reference'
                value={flight.easaFclReference}
                onChange={(e) => updateFlight(fi, { easaFclReference: e.target.value })}
                size='small'
                disabled={!isDraftEditable}
                fullWidth
              />
            </Box>
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
              disabled={!isDraftEditable}
              fullWidth
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={flight.isInterimCheckpoint}
                  onChange={(e) => updateFlight(fi, { isInterimCheckpoint: e.target.checked })}
                  disabled={!isDraftEditable}
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
              disabled={!isDraftEditable}
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
                disabled={!isTextEditable}
                sx={{ flex: 2 }}
              />
              <TextField
                label='Description'
                value={item.description}
                onChange={(e) => updateItem(fi, ii, { description: e.target.value })}
                size='small'
                disabled={!isTextEditable}
                sx={{ flex: 2 }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={item.mandatory}
                    onChange={(e) => updateItem(fi, ii, { mandatory: e.target.checked })}
                    disabled={!isDraftEditable}
                    size='small'
                  />
                }
                label='Mandatory'
              />
              {isDraftEditable && (
                <IconButton size='small' color='error' onClick={() => removeItem(fi, ii)}>
                  <Icon icon='mdi:delete' />
                </IconButton>
              )}
            </Box>
          ))}
          {isDraftEditable && (
            <Button size='small' startIcon={<Icon icon='mdi:plus' />} onClick={() => addItem(fi)}>
              Add Item
            </Button>
          )}
        </Box>
      ))}
      {isDraftEditable && (
        <Button
          variant='outlined'
          startIcon={<Icon icon='mdi:plus' />}
          onClick={addFlight}
          sx={{ mb: 3 }}
        >
          Add Flight
        </Button>
      )}
      {isDraftEditable && (
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
            onClick={handleSubmitForApproval}
            disabled={submittingForApproval}
            startIcon={<Icon icon='mdi:send' />}
          >
            {submittingForApproval ? 'Submitting…' : 'Submit for Approval'}
          </Button>
        </Box>
      )}

      {syllabus.status === 'WAITING_FOR_APPROVAL' && (
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant='outlined'
            onClick={handleWithdraw}
            disabled={withdrawing}
            startIcon={<Icon icon='mdi:undo' />}
          >
            {withdrawing ? 'Withdrawing…' : 'Withdraw to Draft'}
          </Button>
          <Button
            variant='outlined'
            color='success'
            onClick={() => setPublishDialogOpen(true)}
            disabled={publishing}
            startIcon={<Icon icon='mdi:check-circle' />}
          >
            Publish (record approval)
          </Button>
        </Box>
      )}

      {syllabus.status === 'PUBLISHED' && (
        <Box sx={{ display: 'flex', gap: 2 }}>
          {!typoFixMode ? (
            <Button
              variant='outlined'
              onClick={() => setTypoFixMode(true)}
              startIcon={<Icon icon='mdi:pencil' />}
            >
              Fix Typos
            </Button>
          ) : (
            <>
              <Button
                variant='contained'
                onClick={handleSaveTypoFixes}
                disabled={saving}
                startIcon={<Icon icon='mdi:content-save' />}
              >
                {saving ? 'Saving…' : 'Save Typo Fixes'}
              </Button>
              <Button
                onClick={() => {
                  setTypoFixMode(false)
                  resetDraftFromSyllabus()
                }}
              >
                Cancel
              </Button>
            </>
          )}
        </Box>
      )}

      <PublishSyllabusDialog
        open={publishDialogOpen}
        onClose={() => setPublishDialogOpen(false)}
        onConfirm={handlePublish}
      />
    </Box>
  )
}
