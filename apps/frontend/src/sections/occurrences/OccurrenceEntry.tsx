import { useEffect, useState } from 'react'
import {
  Paper,
  Typography,
  Button,
  Stack,
  Breadcrumbs,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Checkbox,
  TextField,
  FormControlLabel,
  Card,
  CardContent,
  Alert,
  IconButton,
} from '@mui/material'

import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Icon } from '@iconify/react'
import {
  useForm,
  Controller,
  Control,
  FieldErrors,
  UseFormWatch,
  UseFormSetValue,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Occurrence,
  OccurrenceCategory,
  OccurrenceUpsertSchema,
  OccurrenceStatus,
  OccurrenceUpsert,
  OccurrenceAccess,
  OccurrenceProcessedPayload,
  OccurrenceClosedPayload,
} from '@backend/routes/occurrences/models'
import useApi, { APIMutation, MutateMethods } from '../../hooks/useApi'
import { AircraftListResponse } from '@backend/routes/aircrafts/models'
import { RemoteContent } from '../../components/RemoteContent'
import { useRoles } from '../../hooks/useRoles'
import { SnackAlert } from '../../components/SnackAlert'
import { Problem } from '@backend/routes/response'
import { SaveButton } from '../../components/SaveButton'
import { Title } from '../../components/Title'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { Airfields } from '../../components/Airfields'
import { FormField } from '../../components/FormField'
import { formatDuration, getDurationInMinutes } from '../flightLog/utils/timeUtils'
import { OccurrenceStatusChip } from './components/OccurrenceStatusChip'
import { ConfirmButton } from '../../components/ConfirmDialog'
import { FormTitle } from '../../components/FormTitle'
import { SelectMember } from '../../components/SelectMember'
import { Member, MemberRole, MIKLang } from '@backend/routes/members/models'
import { EditButton } from '../../components/EditButton'
import { Box } from '@mui/system'
import { useTimezone } from '../../hooks/useTimezone'

const MAX_ATTACHMENT_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB, matches the backend's raw upload limit
const ACCEPTED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// role_id of the dedicated CAMO role, created in V1680__AddCamoRole.sql
const CAMO_ROLE_ID = 'CAMO'

interface SummaryFormProps {
  data?: Occurrence
  control: Control<OccurrenceUpsert>
  errors: FieldErrors<OccurrenceUpsert>
  isEditable: boolean
  isSMSManager: boolean
}

const SummaryForm = ({ data, control, errors, isEditable, isSMSManager }: SummaryFormProps) => {
  const { t } = useTranslation()
  const { formatDateTime, timezoneOffset, timezoneName } = useTimezone()

  return (
    <Grid
      container
      spacing={3}
      sx={{
        mb: 3,
      }}
    >
      <Grid size={12}>
        <Typography variant='h6'>{t('occurrences.summary')}</Typography>
      </Grid>

      {data && (
        <Grid size={{ xs: 12 }}>
          <FormField label={t('occurrences.reportDate')} sx={{ mb: 2 }}>
            {formatDateTime(data.reportDate)}
          </FormField>
          {data.deadLine && (
            <FormField label={t('occurrences.deadLine')} sx={{ mb: 2 }}>
              {formatDateTime(data.deadLine)}
            </FormField>
          )}

          {data.status !== OccurrenceStatus.RECEIVED && data.status !== OccurrenceStatus.CLOSED && (
            <FormField label={t('occurrences.reportAgePending')} sx={{ mb: 2 }}>
              {formatDuration(getDurationInMinutes(data.reportDate))}
            </FormField>
          )}
          {(data.status == OccurrenceStatus.RECEIVED || data.status == OccurrenceStatus.CLOSED) && (
            <FormField
              label={t(
                data.status == OccurrenceStatus.RECEIVED
                  ? 'occurrences.reportAgeReceived'
                  : 'occurrences.reportAgeClosed',
              )}
              sx={{ mb: 2 }}
            >
              {formatDuration(getDurationInMinutes(data.reportDate, data.updatedAt))}
            </FormField>
          )}
          {data.createdBy !== '-' && (
            <FormField label={t('occurrences.reporter')} sx={{ mb: 2 }}>
              <Link to={`/club/members/${data.createdBy}`}>{data?.createdBy}</Link>
            </FormField>
          )}
          <FormField label={t('occurrences.status')} sx={{ mb: 2 }}>
            <OccurrenceStatusChip status={data.status} />
          </FormField>

          {data?.linkedReportId && !isSMSManager && (
            <FormField label={t('occurrences.linkedReport')} sx={{ mb: 2 }}>
              <Link to={`/logs/occurrences/${data?.linkedReportId}`}>
                {data.status == OccurrenceStatus.RECEIVED
                  ? t('occurrences.anonymizedReport')
                  : t('occurrences.originalReport')}
              </Link>
            </FormField>
          )}
        </Grid>
      )}

      <Grid size={{ xs: 12, sm: 6 }}>
        <Controller
          name='occurrenceDate'
          control={control}
          render={({ field: { onChange, value } }) => (
            <DateTimePicker
              label={t('occurrences.occurrenceDateTz', {
                tz: timezoneOffset(value),
              })}
              value={value ? dayjs(value) : null}
              disabled={!isEditable}
              disableFuture={true}
              format='DD.MM.YYYY HH:mm'
              timezone={timezoneName}
              onChange={(date) => onChange(date?.toISOString())}
              slotProps={{
                textField: {
                  fullWidth: true,
                  required: true,
                  margin: 'normal',
                },
              }}
            />
          )}
        />
      </Grid>

      <Grid size={12}>
        <Controller
          name={'headline'}
          control={control}
          render={({ field, fieldState: { error } }) => (
            <TextField
              {...field}
              fullWidth
              required
              disabled={!isEditable}
              label={t('occurrences.headline')}
              error={!!error}
              helperText={error?.message?.toString()}
            />
          )}
        />
      </Grid>

      <Grid size={12}>
        <Controller
          name={'location'}
          control={control}
          render={({ field, fieldState: { error } }) => (
            <TextField
              {...field}
              fullWidth
              required
              disabled={!isEditable}
              label={t('occurrences.location')}
              error={!!error}
              helperText={error?.message?.toString()}
            />
          )}
        />
      </Grid>

      <Grid size={12}>
        <FormControl required error={!!errors.isDtoReport}>
          <FormControlLabel
            label={t('occurrences.isDtoReport')}
            labelPlacement='start'
            control={
              <Controller
                name='isDtoReport'
                control={control}
                disabled={!isEditable}
                render={({ field }) => (
                  <Checkbox
                    checked={field.value}
                    onChange={({ target }) => field.onChange(target.checked)}
                    disabled={!isEditable}
                  />
                )}
              />
            }
          />
        </FormControl>
      </Grid>
    </Grid>
  )
}

interface EventTypeFormProps {
  control: Control<OccurrenceUpsert>
  errors: FieldErrors<OccurrenceUpsert>
  isEditable: boolean
  watch: UseFormWatch<OccurrenceUpsert>
  setValue: UseFormSetValue<OccurrenceUpsert>
}

const EventTypeForm = ({ control, errors, isEditable, watch, setValue }: EventTypeFormProps) => {
  const { t } = useTranslation()
  const animals = watch('animalNumber')

  return (
    <Grid
      container
      spacing={3}
      sx={{
        mb: 3,
      }}
    >
      <Grid size={12}>
        <Typography variant='h6'>{t('occurrences.eventType')}</Typography>
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <FormControl required fullWidth error={!!errors.categories}>
          <InputLabel id='occurrence-categories-label'>{t('occurrences.categories')}</InputLabel>
          <Controller
            name='categories'
            control={control}
            render={({ field }) => (
              <Select
                {...field}
                labelId='occurrence-categories-label'
                label={`${t('occurrences.categories')}`}
                multiple
                disabled={!isEditable}
              >
                {Object.keys(OccurrenceCategory)
                  .filter((key) => isNaN(Number(key)))
                  .map((cat) => (
                    <MenuItem key={cat} value={cat}>
                      {t(`occurrences.categoryEnum.${cat}`)}
                    </MenuItem>
                  ))}
              </Select>
            )}
          />
          {errors.categories && (
            <FormHelperText>{errors.categories.message?.toString()}</FormHelperText>
          )}
        </FormControl>
      </Grid>
      <Grid size={12}>
        <FormControl required error={!!errors.isWeatherRelevant}>
          <FormControlLabel
            label={t('occurrences.isWeatherRelevant')}
            labelPlacement='start'
            control={
              <Controller
                name='isWeatherRelevant'
                control={control}
                disabled={!isEditable}
                render={({ field }) => (
                  <Checkbox
                    checked={!!field.value}
                    onChange={({ target }) => field.onChange(target.checked)}
                    disabled={!isEditable}
                  />
                )}
              />
            }
          />
        </FormControl>
      </Grid>
      <Grid size={12}>
        <FormControl required error={!!errors.animalNumber}>
          <FormControlLabel
            label={t('occurrences.animalsInvolved')}
            labelPlacement='start'
            control={
              <Checkbox
                checked={animals !== '0'}
                onChange={({ target }) => setValue('animalNumber', target.checked ? '1' : '0')}
                disabled={!isEditable}
              />
            }
          />
        </FormControl>
      </Grid>
      {animals !== '0' && (
        <Grid size={12} container spacing={3}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl required fullWidth error={!!errors.categories}>
              <InputLabel>{t('occurrences.animalNumber')}</InputLabel>
              <Controller
                name='animalNumber'
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    label={`${t('occurrences.animalNumber')}`}
                    disabled={!isEditable}
                  >
                    <MenuItem value={'unknown'}>{t('occurrences.options.unknown')}</MenuItem>
                    <MenuItem value={'0'}>0</MenuItem>
                    <MenuItem value={'1'}>1</MenuItem>
                    <MenuItem value={'2-10'}>2-10</MenuItem>
                    <MenuItem value={'10-100'}>10-100</MenuItem>
                    <MenuItem value={'100+'}>100+</MenuItem>
                  </Select>
                )}
              />
              {errors.categories && (
                <FormHelperText>{errors.categories.message?.toString()}</FormHelperText>
              )}
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl required fullWidth error={!!errors.categories}>
              <InputLabel>{t('occurrences.animalSize')}</InputLabel>
              <Controller
                name='animalSize'
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    label={`${t('occurrences.animalSize')}`}
                    disabled={!isEditable}
                  >
                    <MenuItem value={'unknown'}>{t('occurrences.options.unknown')}</MenuItem>
                    <MenuItem value={'S'}>{t('occurrences.options.small')}</MenuItem>
                    <MenuItem value={'M'}>{t('occurrences.options.medium')}</MenuItem>
                    <MenuItem value={'L'}>{t('occurrences.options.large')}</MenuItem>
                  </Select>
                )}
              />
              {errors.categories && (
                <FormHelperText>{errors.categories.message?.toString()}</FormHelperText>
              )}
            </FormControl>
          </Grid>

          <Grid size={12}>
            <Controller
              name={'animalSpecies'}
              control={control}
              render={({ field, fieldState: { error } }) => (
                <TextField
                  {...field}
                  fullWidth
                  disabled={!isEditable}
                  label={t('occurrences.animalSpecies')}
                  error={!!error}
                  helperText={error?.message?.toString()}
                />
              )}
            />
          </Grid>
        </Grid>
      )}
    </Grid>
  )
}

interface DetailsFormProps {
  control: Control<OccurrenceUpsert>
  errors: FieldErrors<OccurrenceUpsert>
  isEditable: boolean
  watch: UseFormWatch<OccurrenceUpsert>
  aircrafts: string[]
  hasAircraftList: boolean
  isSMSManager: boolean
  aircraftTechnicalFault?: boolean | null
}

const DetailsForm = ({
  control,
  errors,
  isEditable,
  watch,
  aircrafts,
  hasAircraftList,
  isSMSManager,
  aircraftTechnicalFault,
}: DetailsFormProps) => {
  const { t } = useTranslation()
  const aircraft = watch('aircraftRegistration')

  return (
    <Grid
      container
      spacing={3}
      sx={{
        mb: 3,
      }}
    >
      <Grid size={12}>
        <Typography variant='h6'>{t('occurrences.details')}</Typography>
      </Grid>
      <Grid size={{ xs: 12, sm: aircraft ? 6 : 12 }}>
        <FormControl
          fullWidth
          error={!!errors.aircraftRegistration}
          disabled={!isEditable || !hasAircraftList}
        >
          <InputLabel id='occurrence-aircraft-label'>{t('occurrences.aircraft')}</InputLabel>
          <Controller
            name='aircraftRegistration'
            control={control}
            render={({ field }) => (
              <Select
                {...field}
                labelId='occurrence-aircraft-label'
                label={t('occurrences.aircraft')}
              >
                <MenuItem key='empty' value={''}>
                  --
                </MenuItem>
                {aircrafts?.map((registration) => (
                  <MenuItem key={registration} value={registration}>
                    {registration}
                  </MenuItem>
                ))}
              </Select>
            )}
          />
          <FormHelperText>{t('occurrences.aircraftNote')}</FormHelperText>
        </FormControl>
      </Grid>
      {aircraft && (
        <Grid size={{ xs: 12, sm: 6 }}>
          <FormControl required error={!!errors.aircraftTechnicalFault}>
            <FormControlLabel
              label={t('occurrences.aircraftTechnicalFault')}
              labelPlacement='start'
              control={
                <Controller
                  name='aircraftTechnicalFault'
                  control={control}
                  disabled={!isEditable}
                  render={({ field }) => (
                    <Checkbox
                      checked={field.value ?? false}
                      onChange={({ target }) => field.onChange(target.checked)}
                      disabled={!isEditable}
                    />
                  )}
                />
              }
            />
            {isSMSManager && aircraftTechnicalFault && (
              <FormHelperText>
                {t('occurrences.aircraftTechnicalFaultAdminInfoText')}
              </FormHelperText>
            )}
          </FormControl>
        </Grid>
      )}
      <Grid size={{ xs: 12, sm: 6 }}>
        <Airfields
          name='departureAirport'
          label={t('occurrences.departureAirport')}
          control={control}
          disabled={!isEditable}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <Airfields
          name='arrivalAirport'
          label={t('occurrences.arrivalAirport')}
          control={control}
          disabled={!isEditable}
        />
      </Grid>
      <Grid size={12}>
        <Controller
          name={'description'}
          control={control}
          render={({ field, fieldState: { error } }) => (
            <TextField
              {...field}
              value={field.value ?? ''}
              onChange={({ target }) => {
                field.onChange(target.value)
              }}
              fullWidth
              disabled={!isEditable}
              label={t('occurrences.description')}
              error={!!error}
              helperText={error?.message?.toString()}
              multiline={true}
              minRows={10}
              maxRows={300}
            />
          )}
        />
      </Grid>
    </Grid>
  )
}

interface BeforeFormProps {
  isAdmin: boolean
  data?: Occurrence
  handleStateChange: (status: OccurrenceStatus, payload?: unknown) => Promise<void>
}

const BeforeForm = ({ isAdmin, data, handleStateChange }: BeforeFormProps) => {
  const { t } = useTranslation()
  const [handling, setHandling] = useState<OccurrenceProcessedPayload>(
    data?.handling.processed ?? {
      adversity: 0,
      probability: 0,
      forwardedToTraficom: false,
    },
  )

  const isEditable = isAdmin && data?.status == OccurrenceStatus.ANONYMIZED

  return (
    <Grid
      container
      spacing={3}
      sx={{
        mb: 3,
      }}
    >
      <Grid size={12}>
        <Typography variant='h6'>{t('occurrences.handling.before')}</Typography>
      </Grid>
      <Grid size={6}>
        <FormControl fullWidth required>
          <InputLabel>{t('occurrences.handling.adversity')}</InputLabel>
          <Select
            value={handling?.adversity || ''}
            onChange={({ target }) =>
              setHandling((prev) => ({
                ...prev,
                adversity: Number(target.value),
              }))
            }
            label={t('occurrences.handling.adversity')}
            disabled={!isEditable}
            fullWidth
          >
            {[0, 1, 2, 3, 4, 5].map((num) => (
              <MenuItem key={num} value={num}>
                {num > 0 ? num : '--'}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid size={6}>
        <FormControl fullWidth required>
          <InputLabel>{t('occurrences.handling.probability')}</InputLabel>
          <Select
            value={handling?.probability || ''}
            onChange={({ target }) =>
              setHandling((prev) => ({
                ...prev,
                probability: Number(target.value),
              }))
            }
            label={t('occurrences.handling.probability')}
            disabled={!isEditable}
            fullWidth
          >
            {[0, 1, 2, 3, 4, 5].map((num) => (
              <MenuItem key={num} value={num}>
                {num > 0 ? num : '--'}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid
        size={12}
        sx={{
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Typography
          variant='body2'
          sx={{
            color: 'text.secondary',
            width: 200,
          }}
        >
          {t('occurrences.handling.forwardedToTraficom')}
        </Typography>
        <Checkbox
          checked={handling.forwardedToTraficom ?? false}
          disabled={!isEditable}
          onChange={({ target }) => {
            setHandling((prev) => ({
              ...prev,
              forwardedToTraficom: target.checked,
            }))
          }}
        />
      </Grid>
      {isEditable && (
        <Grid
          size={12}
          sx={{
            display: 'flex',
            justifyContent: 'center',
            mt: 2,
          }}
        >
          <ConfirmButton
            onConfirm={() => handleStateChange(OccurrenceStatus.PROCESSED, handling)}
            title={t('occurrences.actions.processed')}
            message={t('occurrences.actions.confirmProcessed')}
            confirmText={t('general.save')}
            cancelText={t('general.cancel')}
            severity='error'
            buttonProps={{
              startIcon: <Icon icon='mdi:check' color='green' />,
              disabled: handling.adversity == 0 || handling.probability == 0,
            }}
          />
        </Grid>
      )}
    </Grid>
  )
}

interface AfterFormProps {
  isAdmin: boolean
  data?: Occurrence
  handleStateChange: (status: OccurrenceStatus, payload?: unknown) => Promise<void>
}

const AfterForm = ({ isAdmin, data, handleStateChange }: AfterFormProps) => {
  const { t } = useTranslation()
  const [handling, setHandling] = useState<OccurrenceClosedPayload>(
    data?.handling.closed ?? {
      adversity: 0,
      probability: 0,
      mitigatingAction: '',
    },
  )

  const isEditable = isAdmin && data?.status == OccurrenceStatus.PROCESSED

  return (
    <Grid
      container
      spacing={3}
      sx={{
        mb: 3,
      }}
    >
      <Grid size={12}>
        <Typography variant='h6'>{t('occurrences.handling.after')}</Typography>
      </Grid>
      <Grid
        size={12}
        sx={{
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <TextField
          value={handling?.mitigatingAction ?? ''}
          onChange={({ target }) =>
            setHandling((prev) => ({
              ...prev,
              mitigatingAction: target.value,
            }))
          }
          label={t('occurrences.handling.mitigatingAction')}
          disabled={!isEditable}
          fullWidth
        />
      </Grid>
      <Grid size={6}>
        <FormControl fullWidth required>
          <InputLabel>{t('occurrences.handling.adversity')}</InputLabel>
          <Select
            value={handling?.adversity ?? ''}
            onChange={({ target }) =>
              setHandling((prev) => ({
                ...prev,
                adversity: Number(target.value),
              }))
            }
            label={t('occurrences.handling.adversity')}
            disabled={!isEditable}
            fullWidth
          >
            {[0, 1, 2, 3, 4, 5].map((num) => (
              <MenuItem key={num} value={num}>
                {num > 0 ? num : '--'}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid size={6}>
        <FormControl fullWidth required>
          <InputLabel>{t('occurrences.handling.probability')}</InputLabel>
          <Select
            value={handling?.probability ?? ''}
            onChange={({ target }) =>
              setHandling((prev) => ({
                ...prev,
                probability: Number(target.value),
              }))
            }
            label={t('occurrences.handling.probability')}
            disabled={!isEditable}
            fullWidth
          >
            {[0, 1, 2, 3, 4, 5].map((num) => (
              <MenuItem key={num} value={num}>
                {num > 0 ? num : '--'}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      {isEditable && (
        <Grid
          size={12}
          sx={{
            display: 'flex',
            justifyContent: 'center',
            mt: 2,
          }}
        >
          <ConfirmButton
            onConfirm={() => handleStateChange(OccurrenceStatus.CLOSED, handling)}
            title={t('occurrences.actions.close')}
            message={t('occurrences.actions.confirmClose')}
            confirmText={t('general.save')}
            cancelText={t('general.cancel')}
            severity='error'
            buttonProps={{
              startIcon: <Icon icon='mdi:check' color='green' />,
              disabled:
                handling.adversity == 0 || handling.probability == 0 || !handling.mitigatingAction,
            }}
          />
        </Grid>
      )}
    </Grid>
  )
}

interface SMSFormContentProps {
  isAdmin: boolean
  isNew: boolean
  data?: Occurrence
  handleStateChange: (status: OccurrenceStatus, payload?: unknown) => Promise<void>
  handleSendToCamo: () => Promise<void>
}

const SMSFormContent = ({
  isAdmin,
  isNew,
  data,
  handleStateChange,
  handleSendToCamo,
}: SMSFormContentProps) => {
  const { t } = useTranslation()

  // isAdmin already reflects a verified SMS_MANAGER/SMS_PROCESSOR permission — do not
  // additionally gate on access.manage, since report authors also get manage: true on
  // their own report (so they can share it), which is unrelated to SMS admin rights.
  if (isAdmin) {
    switch (data?.status) {
      case OccurrenceStatus.NEW:
        return (
          <Button
            onClick={() => handleStateChange(OccurrenceStatus.RECEIVED)}
            variant='outlined'
            startIcon={<Icon icon='mdi:check' color='green' />}
            sx={{ ml: 5 }}
          >
            {t('occurrences.actions.receive')}
          </Button>
        )
      case OccurrenceStatus.ANONYMIZING:
        return (
          <ConfirmButton
            onConfirm={() => handleStateChange(OccurrenceStatus.ANONYMIZED)}
            title={t('occurrences.actions.anonymize')}
            message={t('occurrences.actions.confirmAnonymize')}
            confirmText={t('general.save')}
            cancelText={t('general.cancel')}
            severity='error'
            buttonProps={{
              startIcon: <Icon icon='mdi:check' color='green' />,
            }}
          />
        )

      case OccurrenceStatus.ANONYMIZED:
        return (
          <>
            {data?.aircraftTechnicalFault &&
              !data.access.some((a) => a.roleId === CAMO_ROLE_ID) && (
                <ConfirmButton
                  onConfirm={handleSendToCamo}
                  title={t('occurrences.actions.sendToCamo')}
                  message={t('occurrences.actions.confirmSendToCamo')}
                  confirmText={t('general.save')}
                  cancelText={t('general.cancel')}
                  severity='warning'
                  buttonProps={{
                    startIcon: <Icon icon='mdi:send' />,
                    sx: { ml: 5, mb: 3 },
                  }}
                />
              )}
            <BeforeForm isAdmin={isAdmin} data={data} handleStateChange={handleStateChange} />
          </>
        )

      default:
        return (
          <>
            <BeforeForm isAdmin={isAdmin} data={data} handleStateChange={handleStateChange} />
            <AfterForm isAdmin={isAdmin} data={data} handleStateChange={handleStateChange} />
          </>
        )
    }
  } else if (!isNew) {
    return (
      <>
        <BeforeForm isAdmin={isAdmin} data={data} handleStateChange={handleStateChange} />
        <AfterForm isAdmin={isAdmin} data={data} handleStateChange={handleStateChange} />
      </>
    )
  }
}

interface SharingFormProps {
  access?: OccurrenceAccess
  isSMSManager: boolean
  roles: MemberRole[]
  data?: Occurrence
  me?: Member | null
  handleAccessChange: (method: MutateMethods, access: OccurrenceAccess) => Promise<void>
}

const SharingForm = ({
  access,
  isSMSManager,
  roles,
  data,
  me,
  handleAccessChange,
}: SharingFormProps) => {
  const { t, i18n } = useTranslation()

  const canAddMembers = (access?.manage && access?.author) || isSMSManager
  const canAddRoles = access?.manage && !access?.author
  const canEditPermissions = access?.manage && isSMSManager

  return (
    <Card sx={{ mt: 4 }}>
      <CardContent>
        <FormTitle title={t('occurrences.access.title')} icon='mdi:account' />

        {canAddMembers && (
          <Grid size={{ xs: 12, md: 6 }}>
            <SelectMember
              value={''}
              onChange={async (member) => {
                if (member) {
                  await handleAccessChange('POST', {
                    memberId: member.type !== 'role' ? member.id : undefined,
                    roleId: member.type == 'role' ? member.id : undefined,
                    author: data?.status == OccurrenceStatus.NEW,
                    write: false,
                    manage: false,
                  })
                }
              }}
              entries={
                canAddRoles
                  ? roles.map((role) => ({
                      id: role.roleId,
                      type: 'role',
                      label: role.name[i18n.language as MIKLang],
                      group: 'Role',
                    }))
                  : []
              }
              exclude={
                // exclude all existing members and self
                [
                  ...(data?.access.map((a) => a.memberId ?? a.roleId ?? '') ?? []),
                  me?.memberId ?? '',
                ]
              }
              label={t(`occurrences.access.addMember`)}
              placeholder={t('occurrences.access.memberId')}
            />
          </Grid>
        )}

        <Stack spacing={1.5}>
          {data?.access.map((access, index) => (
            <FormField
              key={index}
              label={access.roleId ?? access.lastName ?? access.memberId ?? '-'}
            >
              {!canEditPermissions || access.author || access.manage ? (
                t(
                  `occurrences.access.${!access.author && access.manage ? 'manage' : access.write ? 'write' : 'read'}`,
                )
              ) : (
                <Select
                  value={access.write ? 'write' : !access.write ? 'read' : 'none'}
                  onChange={async ({ target: { value } }) => {
                    if (value == 'none') {
                      await handleAccessChange('DELETE', access)
                    } else {
                      await handleAccessChange('PUT', {
                        ...access,
                        write: value === 'write',
                      })
                    }
                  }}
                >
                  <MenuItem value='none'>{t('occurrences.access.none')}</MenuItem>
                  <MenuItem value='read'>{t('occurrences.access.read')}</MenuItem>
                  <MenuItem value={'write'}>{t('occurrences.access.write')}</MenuItem>
                </Select>
              )}
            </FormField>
          ))}
        </Stack>
      </CardContent>
    </Card>
  )
}

interface AttachmentsFormProps {
  attachments: Occurrence['attachments']
  canWrite: boolean
  mutation: APIMutation<Occurrence>
  setProblem: (problem?: Problem) => void
}

const AttachmentsForm = ({ attachments, canWrite, mutation, setProblem }: AttachmentsFormProps) => {
  const { t } = useTranslation()
  const [dragActive, setDragActive] = useState(false)

  const handleUpload = async (file: File) => {
    if (!ACCEPTED_ATTACHMENT_TYPES.includes(file.type)) {
      return setProblem({ status: 400, detail: t('occurrences.attachments.invalidType') })
    }
    if (file.size > MAX_ATTACHMENT_UPLOAD_BYTES) {
      return setProblem({ status: 400, detail: t('occurrences.attachments.tooLarge') })
    }

    const formData = new FormData()
    formData.append('file', file)
    const { error } = await mutation.trigger('POST', formData, 'attachments')
    if (error) {
      return setProblem(error)
    }
    setProblem({ status: 200, detail: t('general.savingSuccess') })
  }

  const handleDelete = async (attachmentId: number) => {
    const { error } = await mutation.trigger('DELETE', undefined, `attachments/${attachmentId}`)
    if (error) {
      return setProblem(error)
    }
    setProblem({ status: 200, detail: t('general.savingSuccess') })
  }

  const handleOpen = async (attachmentId: number) => {
    const { data: urlData, error } = await mutation.trigger<undefined, { url: string }>(
      'GET',
      undefined,
      `attachments/${attachmentId}/url`,
    )
    if (error) {
      return setProblem(error)
    }
    if (urlData?.url) window.open(urlData.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <Card sx={{ mt: 4 }}>
      <CardContent>
        <FormTitle title={t('occurrences.attachments.title')} icon='mdi:paperclip' />
        {canWrite ? (
          <Alert severity='info'>{t('occurrences.attachments.info')}</Alert>
        ) : (
          attachments.length === 0 && (
            <Alert severity='info'>{t('occurrences.attachments.none')}</Alert>
          )
        )}

        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {attachments.map((attachment) => (
            <Paper key={attachment.attachmentId} variant='outlined' sx={{ p: 2 }}>
              <Stack direction='row' sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant='body2'>{attachment.fileName}</Typography>
                  <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                    {Math.round(attachment.fileSize / 1024)} kB &middot;{' '}
                    {t(
                      attachment.originStatus === OccurrenceStatus.NEW
                        ? 'occurrences.attachments.fromOriginal'
                        : 'occurrences.attachments.addedLater',
                    )}
                  </Typography>
                </Box>
                <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                  <Button size='small' onClick={() => void handleOpen(attachment.attachmentId)}>
                    {t('occurrences.attachments.open')}
                  </Button>
                  {canWrite && (
                    <IconButton
                      size='small'
                      color='error'
                      onClick={() => void handleDelete(attachment.attachmentId)}
                    >
                      <Icon icon='mdi:delete-outline' />
                    </IconButton>
                  )}
                </Stack>
              </Stack>
            </Paper>
          ))}

          {canWrite && (
            <Paper
              variant='outlined'
              component='label'
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setDragActive(true)
              }}
              onDragEnter={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setDragActive(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setDragActive(false)
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setDragActive(false)
                const file = e.dataTransfer.files?.[0]
                if (file) void handleUpload(file)
              }}
              sx={{
                p: 3,
                textAlign: 'center',
                border: '2px dashed',
                borderColor: dragActive ? 'primary.main' : 'divider',
                bgcolor: dragActive ? 'action.hover' : 'transparent',
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
              }}
            >
              <Icon icon='mdi:upload' width={32} />
              <Typography variant='body2' sx={{ mt: 1 }}>
                {t('occurrences.attachments.dropOrClick')}
              </Typography>
              <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                {t('occurrences.attachments.acceptedFormats')}
              </Typography>
              <input
                type='file'
                hidden
                accept={ACCEPTED_ATTACHMENT_TYPES.join(',')}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleUpload(file)
                  e.target.value = ''
                }}
              />
            </Paper>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

interface CommentsFormProps {
  comments: Occurrence['comments']
  canWrite: boolean
  handleCommentChange: (comment: string) => Promise<void>
}

const CommentsForm = ({ comments, canWrite, handleCommentChange }: CommentsFormProps) => {
  const { t } = useTranslation()
  const { formatDateTime } = useTimezone()
  const [newComment, setNewComment] = useState('')

  return (
    <Card sx={{ mt: 4 }}>
      <CardContent>
        <FormTitle title={t('occurrences.handling.comments')} icon='mdi:information' />

        <Stack spacing={1.5}>
          {comments.map((audit, index) => (
            <FormField key={index} label={formatDateTime(audit.at)}>
              {audit.by} -{' '}
              {audit.status ? t(`occurrences.statuses.${audit.status}`) : audit.comment}
            </FormField>
          ))}

          {canWrite && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <TextField
                label={t('occurrences.handling.addComment')}
                value={newComment}
                fullWidth
                onChange={(e) => setNewComment(e.target.value)}
                onKeyUp={(e) => {
                  if (e.key === 'Enter' && newComment.trim().length > 0) {
                    handleCommentChange(newComment.trim())
                    setNewComment('')
                  }
                }}
              />
              <EditButton
                title={t('occurrences.handling.addComment')}
                icon='mdi:send'
                viewOnly={newComment.trim().length === 0}
                onClick={async () => {
                  await handleCommentChange(newComment.trim())
                  setNewComment('')
                }}
              />
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

export const OccurrenceEntry = () => {
  const { t } = useTranslation()

  const navigate = useNavigate()
  // preserve search filters when navigating back
  const location = useLocation()

  const { reportId } = useParams()

  const { isSMSProcessor, isSMSManager, me, roles } = useRoles()

  const isAdmin = isSMSManager || isSMSProcessor

  const isNew = reportId == 'new'

  const { data, mutation, isLoading, error } = useApi<Occurrence>({
    url: `v1/occurrences${isNew ? '' : `/${reportId}`}`,
    skipFetch: isNew,
  })

  const { data: aircraftData } = useApi<AircraftListResponse>(
    {
      url: 'v1/aircrafts',
      params: { activeOnly: true },
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
    },
  )
  // make sure old aircrafts are shown in the list
  const currentAircrafts = aircraftData?.aircrafts.map((a) => a.registration) ?? []
  const aircrafts =
    data?.aircraftRegistration && !currentAircrafts.includes(data.aircraftRegistration)
      ? [...currentAircrafts, data.aircraftRegistration]
      : currentAircrafts

  const access = data?.access
    .filter((a) =>
      isAdmin
        ? a.roleId && me?.roles.find((r) => r.roleId == a.roleId)
        : a.memberId === me?.memberId ||
          (a.roleId && me?.roles.find((r) => r.roleId == a.roleId && !a.manage)),
    )
    ?.sort((a, b) => {
      if (a.manage && !b.manage) return -1
      if (!a.manage && b.manage) return 1
      if (a.write && !b.write) return -1
      if (!a.write && b.write) return 1
      return 0
    })?.[0]

  const isEditable =
    isNew ||
    (access?.write &&
      (data?.status == OccurrenceStatus.NEW || data?.status == OccurrenceStatus.ANONYMIZING))

  const {
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
    setValue,
    reset,
  } = useForm<OccurrenceUpsert>({
    mode: 'onChange',
    resolver: zodResolver(OccurrenceUpsertSchema.strip() as any, {}),

    // defaults for new report
    defaultValues: {
      occurrenceDate: '',
      aircraftRegistration: '',
      aircraftTechnicalFault: null,
      animalNumber: '0',
      animalSize: '',
      animalSpecies: '',
      departureAirport: null,
      arrivalAirport: null,
      categories: [],
      location: '',
      headline: '',
      description: '',
      isDtoReport: me?.isTrainingProgramPilot ?? false,
      isWeatherRelevant: null,
    },
  })

  useEffect(() => {
    if (data) {
      reset(data)
      setProblem(undefined)
    }
  }, [data, reset])

  const [problem, setProblem] = useState<Problem | undefined>()

  const onSubmit = async (data: OccurrenceUpsert) => {
    console.log('Form submitted with data:', data)

    try {
      const { data: responseData, error } = await mutation.trigger(
        isNew ? 'POST' : 'PATCH',
        {
          ...data,
          aircraftRegistration: data.aircraftRegistration || null,
          departureAirport: data.departureAirport || null,
          arrivalAirport: data.arrivalAirport || null,
        },
        undefined,
        {
          // put returned payload to the cache
          revalidate: false,
          populateCache: (result) => result,
        },
      )
      if (error) {
        return setProblem(error)
      }

      setProblem({ status: 200, detail: t('general.savingSuccess') })

      if (isNew) {
        navigate(`/logs/occurrences/${responseData?.id}`)
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      setProblem({ status: 500, detail: t('general.savingError') })
    }
  }

  const handleCancel = () => navigate(`/logs/occurrences?${location.state}#${reportId}`)

  const handleStateChange = async (status: OccurrenceStatus, payload?: unknown) => {
    const { data, error } = await mutation.trigger<unknown, Occurrence>(
      'POST',
      payload ?? {},
      `status/${status}`,
    )
    if (error) {
      return setProblem(error)
    }

    setProblem({ status: 200, detail: t('general.savingSuccess') })
    if (status == OccurrenceStatus.RECEIVED) {
      // navigate to anonymized version
      navigate(`/logs/occurrences/${data?.id}`)
    } else if (status == OccurrenceStatus.ANONYMIZED) {
      // independent processor has no more access to the report
      navigate('/logs/occurrences')
    }
  }

  const handleAccessChange = async (method: MutateMethods, access: OccurrenceAccess) => {
    const { error } = await mutation.trigger<OccurrenceAccess, Occurrence>(
      method,
      access,
      method == 'POST' ? 'access' : `access/${access.accessId}`,
    )
    if (error) {
      return setProblem(error)
    }
    setProblem({ status: 200, detail: t('general.savingSuccess') })
  }

  const handleSendToCamo = async () => {
    const { error } = await mutation.trigger<unknown, Occurrence>('POST', {}, 'camo')
    if (error) {
      return setProblem(error)
    }
    setProblem({ status: 200, detail: t('general.savingSuccess') })
  }

  const handleCommentChange = async (comment: string) => {
    const { error } = await mutation.trigger<unknown, Occurrence>('POST', { comment }, 'comment')
    if (error) {
      return setProblem(error)
    }
    setProblem({ status: 200, detail: t('general.savingSuccess') })
  }

  // Check if form has validation errors
  const hasValidationErrors = Object.keys(errors).length > 0

  const title = isNew ? t('occurrences.newReport') : t('occurrences.existingReport')

  return (
    <>
      <RemoteContent isLoading={isLoading} error={error}>
        <SnackAlert problem={problem} />

        {/* Breadcrumb navigation */}
        <Breadcrumbs sx={{ my: 2 }}>
          <Link to='/logs/occurrences'>{t('occurrences.title')}</Link>
          <Typography
            sx={{
              color: 'text.primary',
            }}
          >
            {title}
          </Typography>
        </Breadcrumbs>

        <Title label={title} />

        <Paper sx={{ p: 3, mt: 2 }}>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <SummaryForm
              data={data}
              control={control}
              errors={errors}
              isEditable={!!isEditable}
              isSMSManager={isSMSManager}
            />
            <EventTypeForm
              control={control}
              errors={errors}
              isEditable={!!isEditable}
              watch={watch}
              setValue={setValue}
            />
            <DetailsForm
              control={control}
              errors={errors}
              isEditable={!!isEditable}
              watch={watch}
              aircrafts={aircrafts}
              hasAircraftList={!!aircraftData?.aircrafts}
              isSMSManager={isSMSManager}
              aircraftTechnicalFault={data?.aircraftTechnicalFault}
            />

            <Stack
              direction={{ xs: 'column-reverse', sm: 'row' }}
              spacing={2}
              sx={{
                justifyContent: 'flex-end',
                mt: 3,
              }}
            >
              <Button
                variant='outlined'
                onClick={handleCancel}
                startIcon={<Icon icon='mdi:close' />}
              >
                {t('general.cancel')}
              </Button>
              {isEditable && (
                <SaveButton
                  loading={mutation.isMutating || isSubmitting}
                  disabled={hasValidationErrors}
                />
              )}
            </Stack>
          </form>
        </Paper>

        {isNew && (
          <Card sx={{ mt: 4 }}>
            <CardContent>
              <FormTitle title={t('occurrences.attachments.title')} icon='mdi:paperclip' />
              <Alert severity='info'>{t('occurrences.attachments.saveFirst')}</Alert>
            </CardContent>
          </Card>
        )}

        {!isNew && (
          <>
            <Card sx={{ mt: 4 }}>
              <CardContent>
                <FormTitle title={t('occurrences.handling.title')} icon='mdi:information' />
                <SMSFormContent
                  isAdmin={isAdmin}
                  isNew={isNew}
                  data={data}
                  handleStateChange={handleStateChange}
                  handleSendToCamo={handleSendToCamo}
                />
              </CardContent>
            </Card>

            <SharingForm
              access={access}
              isSMSManager={isSMSManager}
              roles={roles}
              data={data}
              me={me}
              handleAccessChange={handleAccessChange}
            />

            {(access?.author || isAdmin) && (
              <AttachmentsForm
                attachments={data?.attachments ?? []}
                canWrite={!!access?.write}
                mutation={mutation}
                setProblem={setProblem}
              />
            )}

            {data?.status !== OccurrenceStatus.NEW && (
              <CommentsForm
                comments={data?.comments ?? []}
                canWrite={!!access?.write}
                handleCommentChange={handleCommentChange}
              />
            )}
          </>
        )}
      </RemoteContent>
    </>
  )
}
