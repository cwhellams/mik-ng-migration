import { useTranslation } from 'react-i18next'
import { Box, Button, IconButton, Stack, Typography } from '@mui/material'
import { Icon } from '@iconify/react'

/**
 * Optional receipt capture for a self-paid fuelling, staged locally until the
 * record itself is saved (there is no record id to upload against yet — see
 * `LiquidReportForm`'s `handleSubmit`).
 *
 * Two separate hidden inputs rather than one: `capture="environment"` forces a
 * mobile browser straight to the camera, which is what "take a new photo of
 * the receipt" wants, while the plain picker (no `capture`) is what "attach an
 * existing file/image" wants — combining them into one input leaves the choice
 * to the browser instead of the member.
 */

// Mirrors the backend's MAX_ATTACHMENTS_PER_RECORD (apps/backend/src/db/liquid-attachment-queries.ts).
const MAX_RECEIPT_FILES = 5

interface Props {
  files: File[]
  onChange: (files: File[]) => void
}

export function ReceiptCaptureField({ files, onChange }: Props) {
  const { t } = useTranslation()

  const addFiles = (added: FileList | null) => {
    if (!added?.length) return
    onChange([...files, ...Array.from(added)].slice(0, MAX_RECEIPT_FILES))
  }
  const removeFile = (index: number) => onChange(files.filter((_, i) => i !== index))

  const atLimit = files.length >= MAX_RECEIPT_FILES

  return (
    <Box>
      <Typography variant='body2' sx={{ mb: 1 }}>
        {t('liquid.form.receiptOptional')}
      </Typography>
      <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button
          component='label'
          size='small'
          variant='outlined'
          disabled={atLimit}
          startIcon={<Icon icon='mdi:paperclip' />}
        >
          {t('liquid.form.attachFile')}
          <input
            type='file'
            hidden
            multiple
            accept='image/*,application/pdf'
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </Button>
        <Button
          component='label'
          size='small'
          variant='outlined'
          disabled={atLimit}
          startIcon={<Icon icon='mdi:camera-outline' />}
        >
          {t('liquid.form.takePhoto')}
          <input
            type='file'
            hidden
            accept='image/*'
            capture='environment'
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </Button>
      </Stack>

      {files.length > 0 && (
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          {files.map((file, index) => (
            <Stack
              key={`${file.name}-${index}`}
              direction='row'
              spacing={1}
              sx={{ alignItems: 'center' }}
            >
              <Icon icon='mdi:file-outline' />
              <Typography variant='body2' sx={{ flexGrow: 1, wordBreak: 'break-all' }}>
                {file.name}
              </Typography>
              <IconButton
                size='small'
                aria-label={t('liquid.form.removeFile', { name: file.name })}
                onClick={() => removeFile(index)}
              >
                <Icon icon='mdi:close' />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  )
}
