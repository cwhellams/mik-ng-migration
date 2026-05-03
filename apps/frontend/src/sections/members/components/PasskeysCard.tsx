import {
  Box,
  Button,
  Card,
  CardContent,
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
import useApi from '../../../hooks/useApi'
import { FormTitle } from '../../../components/FormTitle'
import { SnackAlert } from '../../../components/SnackAlert'
import { Problem } from '@backend/routes/response'
import {
  isSecureContextForPasskeys,
  passkeySupported,
  registerPasskey,
} from '../../../utils/passkey'

type Passkey = {
  id: string
  name: string | null
  deviceType: string | null
  backedUp: boolean
  transports: string[]
  lastUsedAt: string | null
  createdAt: string
}

type PasskeysResponse = { passkeys: Passkey[] }

interface PasskeysCardProps {
  // Either 'me' (own profile) or a numeric memberId (admin viewing another).
  memberId: string
  // True when the current user is viewing somebody else's profile as admin.
  isAdmin: boolean
}

/**
 * Passkey management card.
 *
 * - On the user's own profile, shows their registered passkeys and lets them
 *   register a new one or remove an existing one.
 * - On an admin-viewed member profile, lists the member's passkeys and lets
 *   the admin remove any of them with confirmation. Admins do not register
 *   passkeys on behalf of other members.
 */
export const PasskeysCard = ({ memberId, isAdmin }: PasskeysCardProps) => {
  const { t } = useTranslation()
  const apiPath =
    memberId === 'me'
      ? 'v1/members/me/passkeys'
      : `v1/members/${memberId}/passkeys`

  const { data, isLoading, mutation, mutate } = useApi<PasskeysResponse>({
    url: apiPath,
  })

  const [problem, setProblem] = useState<Problem | undefined>()
  const [registering, setRegistering] = useState(false)

  const handleRegister = async () => {
    setProblem(undefined)
    const name = globalThis.prompt(t('member.passkeys.namePrompt')) ?? null
    if (name === null) return // user cancelled the prompt
    setRegistering(true)
    const result = await registerPasskey(name.trim() || null)
    setRegistering(false)
    if (!result.ok) {
      const detail =
        result.reason === 'unsupported-browser'
          ? t('member.passkeys.unsupportedBrowser')
          : result.reason === 'cancelled'
            ? result.message
            : undefined
      setProblem({
        status: 400,
        title: t('member.passkeys.registerFailed'),
        detail,
      })
      return
    }
    await mutate()
  }

  const handleRemove = async (id: string, name: string | null) => {
    setProblem(undefined)
    const label = name || t('member.passkeys.unnamed')
    const confirmKey = isAdmin
      ? 'member.passkeys.removeAdminConfirm'
      : 'member.passkeys.removeConfirm'
    if (!globalThis.confirm(t(confirmKey, { name: label }))) return

    const { error } = await mutation.trigger('DELETE', undefined, id)
    if (error) {
      setProblem(error)
      return
    }
    await mutate()
  }

  const passkeys = data?.passkeys ?? []

  return (
    <Card>
      <CardContent>
        <SnackAlert problem={problem} />
        <FormTitle title={t('member.passkeys.title')} icon='mdi:fingerprint' />

        {isLoading ? (
          <CircularProgress size={20} />
        ) : passkeys.length === 0 ? (
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            {t('member.passkeys.empty')}
          </Typography>
        ) : (
          <List dense disablePadding>
            {passkeys.map((p) => (
              <ListItem key={p.id} divider>
                <ListItemText
                  primary={p.name || t('member.passkeys.unnamed')}
                  secondary={
                    <Box component='span' sx={{ display: 'block' }}>
                      <Typography
                        component='span'
                        variant='caption'
                        color='text.secondary'
                      >
                        {t('member.passkeys.added')}{' '}
                        {new Date(p.createdAt).toLocaleDateString()}
                        {p.lastUsedAt &&
                          ` · ${t('member.passkeys.lastUsed')} ${new Date(
                            p.lastUsedAt
                          ).toLocaleDateString()}`}
                        {p.transports.length > 0 &&
                          ` · ${p.transports.join(', ')}`}
                      </Typography>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title={t('member.passkeys.remove')}>
                    <IconButton
                      edge='end'
                      onClick={() => handleRemove(p.id, p.name)}
                      size='small'
                    >
                      <Icon icon='mdi:delete' />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}

        {!isAdmin && passkeySupported() && (
          <Box sx={{ mt: 2 }}>
            <Button
              variant='outlined'
              startIcon={<Icon icon='mdi:plus' />}
              onClick={handleRegister}
              loading={registering}
              size='small'
            >
              {t('member.passkeys.add')}
            </Button>
          </Box>
        )}
        {!isAdmin && !passkeySupported() && (
          <Typography variant='caption' color='text.secondary'>
            {!isSecureContextForPasskeys()
              ? t('member.passkeys.insecureContext')
              : t('member.passkeys.unsupportedBrowser')}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
