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

import useApi, { type MutateMethods } from '@mik/ui/hooks/useApi'
import { useTimezone } from '@mik/ui/hooks/useTimezone'
import { FormTitle } from '@mik/ui/components/FormTitle'
import { SnackAlert } from '@mik/ui/components/SnackAlert'
import { Problem } from '@mik/contracts/problem'
import type { SessionListResponse } from '@mik/contracts/session'

import { endpoints } from '../../../api/endpoints'

/** The bulk action's path segment, and the `pending` value that marks it in
 * flight. A session id is a UUID, so the two key spaces cannot collide. */
const REVOKE_OTHERS = 'revoke-others'

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

  // Which action is in flight, as the session id it targets or REVOKE_OTHERS.
  // `mutation.isMutating` cannot answer this: one useApi() call serves both
  // buttons, so it is true for whichever action is running and says nothing
  // about which. Reading it per row made every Terminate button and the bulk
  // button spin together, and left the row that was already being revoked
  // clickable — a second click there lands on an already-revoked session and
  // comes back a 404 the member has no way to make sense of.
  const [pending, setPending] = useState<string | null>(null)

  // Matching PasskeysCard: a failed GET (a 403 for a non-admin on someone else's
  // profile, most of all) falls through to the empty state rather than being
  // reported. Doing something cleverer here would make the two cards on the same
  // profile behave differently for the same cause.
  const sessions = data?.sessions ?? []
  const otherSessions = sessions.filter((s) => !s.isCurrent)

  /**
   * Both destructive actions on this card are the same sequence — clear the last
   * problem, confirm with the wording that matches who is looking, fire the
   * request, then either report the failure or reload the list — differing only
   * in the confirm key and the request itself. Keeping one copy is what stops
   * the two drifting the next time either end of it changes.
   */
  const confirmAndMutate = async (
    action: string,
    confirmKey: string,
    confirmVars: Record<string, string> | undefined,
    method: MutateMethods,
    path: string,
  ) => {
    setProblem(undefined)
    if (!globalThis.confirm(t(confirmKey, confirmVars))) return

    setPending(action)
    try {
      const { error } = await mutation.trigger(method, undefined, path)
      if (error) {
        setProblem(error)
        return
      }
      await mutate()
    } finally {
      setPending(null)
    }
  }

  const handleTerminate = (id: string, device: string) =>
    confirmAndMutate(
      id,
      isAdmin ? 'member.sessions.terminateAdminConfirm' : 'member.sessions.terminateConfirm',
      { device },
      'DELETE',
      id,
    )

  const handleRevokeOthers = () =>
    confirmAndMutate(
      REVOKE_OTHERS,
      isAdmin ? 'member.sessions.revokeOthersAdminConfirm' : 'member.sessions.revokeOthersConfirm',
      undefined,
      'POST',
      REVOKE_OTHERS,
    )

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
                        disabled={s.isCurrent || pending !== null}
                        aria-label={t('member.sessions.terminate')}
                        onClick={() => handleTerminate(s.id, s.device)}
                      >
                        {pending === s.id ? (
                          <CircularProgress size={16} />
                        ) : (
                          <Icon icon='mdi:logout-variant' />
                        )}
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
              disabled={pending !== null}
              loading={pending === REVOKE_OTHERS}
            >
              {t('member.sessions.revokeOthers')}
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}
