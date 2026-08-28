import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import useApi from '@mik/ui/hooks/useApi'
import { useTimezone } from '@mik/ui/hooks/useTimezone'
import { FormTitle } from '@mik/ui/components/FormTitle'
import { SnackAlert } from '@mik/ui/components/SnackAlert'
import { Problem } from '@mik/contracts/problem'
import type { SessionListResponse } from '@mik/contracts/session'

import { endpoints } from '../../../api/endpoints'

interface SessionsCardProps {
  /** Either 'me' (own profile) or a memberId (admin viewing another member). */
  memberId: string
  /** True when the current user is viewing somebody else's profile as admin. */
  isAdmin: boolean
}

/**
 * The member's active login sessions (#1234).
 *
 * Sits beside PasskeysCard and follows it deliberately: same self-or-admin
 * mounting, same reliance on the backend's 403 rather than a second gate here,
 * same `globalThis.confirm` before anything destructive.
 *
 * The one thing this card must say out loud is that terminating is not instant.
 * Revocation is enforced when the other device next exchanges its refresh token,
 * so a terminated session keeps working for up to the remaining life of its
 * 15-minute access token. That caveat appears three times — under the list, and
 * in both confirmation prompts — because a member who terminates a session they
 * do not recognise and then watches it stay alive will reasonably conclude the
 * button is broken.
 */
export const SessionsCard = ({ memberId, isAdmin }: SessionsCardProps) => {
  const { t } = useTranslation()
  const { formatDateTime } = useTimezone()
  const apiPath =
    memberId === 'me' ? endpoints.members.mySessions : endpoints.members.sessions(memberId)

  const { data, isLoading, mutation, mutate } = useApi<SessionListResponse>({ url: apiPath })

  const [problem, setProblem] = useState<Problem | undefined>()

  // Matching PasskeysCard: a failed GET (a 403 for a non-admin on someone else's
  // profile, most of all) falls through to the empty state rather than being
  // reported. Doing something cleverer here would make the two cards on the same
  // profile behave differently for the same cause.
  const sessions = data?.sessions ?? []
  const otherSessions = sessions.filter((s) => !s.isCurrent)

  const handleTerminate = async (id: string, device: string) => {
    setProblem(undefined)
    const confirmKey = isAdmin
      ? 'member.sessions.terminateAdminConfirm'
      : 'member.sessions.terminateConfirm'
    if (!globalThis.confirm(t(confirmKey, { device }))) return

    const { error } = await mutation.trigger('DELETE', undefined, id)
    if (error) {
      setProblem(error)
      return
    }
    await mutate()
  }

  const handleRevokeOthers = async () => {
    setProblem(undefined)
    const confirmKey = isAdmin
      ? 'member.sessions.revokeOthersAdminConfirm'
      : 'member.sessions.revokeOthersConfirm'
    if (!globalThis.confirm(t(confirmKey))) return

    const { error } = await mutation.trigger('POST', undefined, 'revoke-others')
    if (error) {
      setProblem(error)
      return
    }
    await mutate()
  }

  return (
    <Card>
      <CardContent>
        <SnackAlert problem={problem} />
        <FormTitle title={t('member.sessions.title')} icon='mdi:devices' />

        {isLoading ? (
          <CircularProgress size={20} />
        ) : sessions.length === 0 ? (
          <Typography variant='body2' sx={{ color: 'text.secondary', mb: 2 }}>
            {t('member.sessions.empty')}
          </Typography>
        ) : (
          <List dense disablePadding>
            {sessions.map((s) => (
              <ListItem key={s.id} divider>
                <ListItemText
                  primary={
                    <Box component='span' sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {s.device}
                      {s.isCurrent && (
                        <Chip
                          label={t('member.sessions.thisDevice')}
                          size='small'
                          color='primary'
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box component='span' sx={{ display: 'block' }}>
                      <Typography
                        component='span'
                        variant='caption'
                        sx={{ color: 'text.secondary' }}
                      >
                        {s.ipAddress ?? t('member.sessions.unknownIp')}
                        {` · ${t('member.sessions.created')} ${formatDateTime(s.createdAt)}`}
                        {` · ${t('member.sessions.lastActive')} ${formatDateTime(s.lastUsedAt)}`}
                      </Typography>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip
                    title={
                      s.isCurrent
                        ? t('member.sessions.terminateCurrent')
                        : t('member.sessions.terminate')
                    }
                  >
                    {/* A disabled IconButton fires no events, so the Tooltip needs a
                        wrapper element of its own to stay hoverable on the current row. */}
                    <Box component='span'>
                      <IconButton
                        edge='end'
                        size='small'
                        disabled={s.isCurrent}
                        aria-label={t('member.sessions.terminate')}
                        onClick={() => handleTerminate(s.id, s.device)}
                      >
                        <Icon icon='mdi:logout-variant' />
                      </IconButton>
                    </Box>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}

        {sessions.length > 0 && (
          <Typography variant='caption' sx={{ color: 'text.secondary', display: 'block', mt: 2 }}>
            {t('member.sessions.delayNotice')}
          </Typography>
        )}

        {otherSessions.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Button
              variant='outlined'
              color='warning'
              size='small'
              startIcon={<Icon icon='mdi:logout' />}
              onClick={handleRevokeOthers}
              loading={mutation.isMutating}
            >
              {t('member.sessions.revokeOthers')}
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}
