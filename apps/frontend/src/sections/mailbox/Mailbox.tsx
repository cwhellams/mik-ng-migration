import { Alert, AlertTitle, Box, Button, Chip, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Title } from '../../components/Title'
import { useMailbox } from '../../hooks/useMailbox'

export default function Mailbox() {
  const { t } = useTranslation()
  const { messages, unreadCount, isLoading, markRead, markAllRead } = useMailbox()

  return (
    <Box>
      <Title label={t('mailbox.title')}>
        <Button variant='outlined' disabled={unreadCount === 0} onClick={() => markAllRead()}>
          {t('mailbox.markAllRead')}
        </Button>
      </Title>

      {!isLoading && messages.length === 0 && (
        <Typography color='text.secondary'>{t('mailbox.noMessages')}</Typography>
      )}

      <Stack spacing={2}>
        {messages.map((message) => (
          <Alert
            key={message.id}
            severity={message.severity}
            variant={message.readAt ? 'outlined' : 'filled'}
            onClick={() => {
              if (!message.readAt) {
                markRead(message.id)
              }
            }}
            sx={{ cursor: message.readAt ? 'default' : 'pointer' }}
            action={
              !message.readAt ? (
                <Chip label={t('mailbox.unread')} size='small' color='default' />
              ) : undefined
            }
          >
            <AlertTitle>{message.title}</AlertTitle>
            {message.body && <Typography variant='body2'>{message.body}</Typography>}
            <Typography variant='caption' sx={{ display: 'block', mt: 0.5, opacity: 0.8 }}>
              {dayjs(message.createdAt).format('DD.MM.YYYY HH:mm')}
            </Typography>
          </Alert>
        ))}
      </Stack>
    </Box>
  )
}
