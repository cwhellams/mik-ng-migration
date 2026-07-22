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
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Title } from '../../components/Title'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { SelectMember } from '../../components/SelectMember'
import { useRoles } from '../../hooks/useRoles'
import { MIKPermissions, MIKMemberTypes } from '@backend/routes/members/models'
import type { StudentProgress, TrainingProgram } from '@backend/routes/dto/models'
import { assignSyllabus } from './dtoApi'

function formatMins(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

function AssignSyllabusDialog({
  open,
  onClose,
  onAssigned,
  excludeMembers,
}: Readonly<{
  open: boolean
  onClose: () => void
  onAssigned: () => void
  excludeMembers?: string[]
}>) {
  const [memberId, setMemberId] = useState<string | null>(null)
  const [programId, setProgramId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: programs } = useApi<TrainingProgram[]>({
    url: 'v1/dto/programs',
    skipFetch: !open,
  })

  const handleClose = () => {
    setMemberId(null)
    setProgramId('')
    setError(null)
    onClose()
  }

  const handleAssign = async () => {
    if (!memberId || !programId) return
    setSaving(true)
    setError(null)
    try {
      await assignSyllabus(memberId, programId)
      onAssigned()
      handleClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to assign syllabus'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='sm' fullWidth>
      <DialogTitle>Assign Syllabus to Student</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity='error'>{error}</Alert>}
          <SelectMember
            value={memberId}
            onChange={(m) => setMemberId(m?.id ?? null)}
            label='Student'
            placeholder='Select member…'
            memberType={[MIKMemberTypes.FLYING, MIKMemberTypes.JUNIOR, MIKMemberTypes.HONORARY]}
            exclude={excludeMembers}
          />
          <FormControl fullWidth>
            <InputLabel>Training Program</InputLabel>
            <Select
              value={programId}
              label='Training Program'
              onChange={(e) => setProgramId(e.target.value)}
            >
              {(programs ?? []).map((p) => (
                <MenuItem key={p.programId} value={p.programId}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant='contained'
          onClick={handleAssign}
          disabled={saving || !memberId || !programId}
        >
          {saving ? <CircularProgress size={20} /> : 'Assign'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default function DtoProgressPage() {
  const navigate = useNavigate()
  const { hasAccess } = useRoles()
  const [assignOpen, setAssignOpen] = useState(false)
  const isDtoAdmin = hasAccess(MIKPermissions.DTO_ADMIN)

  const {
    data: progress,
    isLoading,
    error,
    mutation,
  } = useApi<StudentProgress[]>({
    url: 'v1/dto/progress',
  })

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <Title label='DTO Student Progress' />
        {isDtoAdmin && (
          <Button
            variant='contained'
            startIcon={<Icon icon='mdi:account-plus' />}
            onClick={() => setAssignOpen(true)}
          >
            Assign Syllabus
          </Button>
        )}
      </Box>
      <RemoteContent isLoading={isLoading} error={error}>
        {(progress?.length ?? 0) === 0 ? (
          <Alert severity='info'>No DTO students with an active syllabus assignment.</Alert>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Student</TableCell>
                <TableCell>Syllabus</TableCell>
                <TableCell>Flights</TableCell>
                <TableCell>Block Time</TableCell>
                <TableCell>Interim Check</TableCell>
                <TableCell>Last Flight</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {progress!.map((p) => {
                const pct =
                  p.totalFlights > 0 ? Math.round((p.completedFlights / p.totalFlights) * 100) : 0
                const hasTimeReq = p.minBlockTimeMins != null
                const timePct = hasTimeReq
                  ? Math.min(100, Math.round((p.totalBlockTimeMins / p.minBlockTimeMins!) * 100))
                  : null

                return (
                  <TableRow
                    key={p.memberId}
                    hover
                    sx={{ cursor: p.memberSyllabusId ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (p.memberSyllabusId) {
                        navigate(`/dto/progress/${p.memberSyllabusId}`)
                      }
                    }}
                  >
                    <TableCell>{p.memberName}</TableCell>
                    <TableCell>
                      {p.syllabusTitle && (
                        <Typography variant='body2'>
                          {p.syllabusTitle} v{p.syllabusVersion}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ minWidth: 180 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                        }}
                      >
                        <LinearProgress
                          variant='determinate'
                          value={pct}
                          sx={{ flex: 1, borderRadius: 1, height: 8 }}
                        />
                        <Typography variant='body2' sx={{ minWidth: 50 }}>
                          {p.completedFlights}/{p.totalFlights}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ minWidth: 200 }}>
                      {hasTimeReq ? (
                        <Tooltip
                          title={
                            p.meetsTimeRequirement
                              ? 'Minimum time requirement met'
                              : `Requires ${formatMins(p.minBlockTimeMins!)} total`
                          }
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            <LinearProgress
                              variant='determinate'
                              value={timePct!}
                              color={p.meetsTimeRequirement ? 'success' : 'warning'}
                              sx={{ flex: 1, borderRadius: 1, height: 8 }}
                            />
                            <Typography
                              variant='body2'
                              sx={{
                                minWidth: 90,
                                color: p.meetsTimeRequirement ? 'success.main' : 'warning.main',
                                fontWeight: p.meetsTimeRequirement ? 600 : 400,
                              }}
                            >
                              {formatMins(p.totalBlockTimeMins)} / {formatMins(p.minBlockTimeMins!)}
                            </Typography>
                          </Box>
                        </Tooltip>
                      ) : (
                        <Typography
                          variant='body2'
                          sx={{
                            color: 'text.secondary',
                          }}
                        >
                          {formatMins(p.totalBlockTimeMins)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.interimCheckpointCompleted ? (
                        <Chip
                          size='small'
                          icon={<Icon icon='mdi:check-circle' />}
                          label='Done'
                          color='success'
                        />
                      ) : (
                        <Chip size='small' label='Pending' />
                      )}
                    </TableCell>
                    <TableCell>
                      {p.lastDtoFlightDate
                        ? new Date(p.lastDtoFlightDate).toLocaleDateString()
                        : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </RemoteContent>
      {isDtoAdmin && (
        <AssignSyllabusDialog
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          onAssigned={() => mutation.trigger('GET')}
          excludeMembers={progress?.map((p) => p.memberId)}
        />
      )}
    </Box>
  )
}
