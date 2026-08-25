import React, { useRef, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Slider,
  Stack,
  Typography,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import Cropper, { type Area, type Point } from 'react-easy-crop'

import { getCroppedImageBlob } from './cropImage'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
// Matches IMAGE_UPLOAD_RAW_BYTES on the backend (util/imageUpload.ts) — the raw upload
// ceiling shared by every image route in this codebase, not the final stored size. The
// browser crops/downsamples before anything is sent, so this only guards against picking
// an unreasonably large file to begin with.
const MAX_SOURCE_BYTES = 40 * 1024 * 1024

interface AvatarUploadProps {
  hasAvatar: boolean
  isLoading?: boolean
  onUpload: (blob: Blob) => Promise<void>
  onDelete: () => Promise<void>
}

export const AvatarUpload: React.FC<AvatarUploadProps> = ({
  hasAvatar,
  isLoading = false,
  onUpload,
  onDelete,
}) => {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string>('')

  const [imageSrc, setImageSrc] = useState<string>('')
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [saving, setSaving] = useState(false)

  const closeCropDialog = () => {
    if (imageSrc) URL.revokeObjectURL(imageSrc)
    setImageSrc('')
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError('')

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(t('member.avatarUpload.invalidFileType'))
    } else if (file.size > MAX_SOURCE_BYTES) {
      setError(t('member.avatarUpload.fileTooLarge'))
    } else {
      setImageSrc(URL.createObjectURL(file))
    }

    // Clear the input so re-selecting the same file (e.g. after cancelling the crop) fires onChange again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSave = async () => {
    if (!croppedAreaPixels) return
    setSaving(true)
    setError('')
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels)
      await onUpload(blob)
      closeCropDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('member.avatarUpload.uploadFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(t('member.avatarUpload.removeConfirm'))) return
    setError('')
    try {
      await onDelete()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('member.avatarUpload.deleteFailed'))
    }
  }

  return (
    <Stack spacing={0.5}>
      <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
        <Button
          variant='outlined'
          size='small'
          startIcon={<Icon icon='mdi:camera' />}
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
          {t('member.avatarUpload.changePhoto')}
        </Button>

        {hasAvatar && (
          <Button
            variant='text'
            size='small'
            color='error'
            onClick={handleDelete}
            disabled={isLoading}
          >
            {t('member.avatarUpload.removePhoto')}
          </Button>
        )}
      </Stack>

      <Typography variant='caption' color='text.secondary'>
        {t('member.avatarUpload.consent')}
      </Typography>

      <input
        ref={fileInputRef}
        type='file'
        accept={ACCEPTED_TYPES.join(',')}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {error && (
        <Typography variant='caption' color='error'>
          {error}
        </Typography>
      )}

      <Dialog open={!!imageSrc} onClose={closeCropDialog} maxWidth='xs' fullWidth>
        <DialogTitle>{t('member.avatarUpload.dialogTitle')}</DialogTitle>
        <DialogContent>
          <Box sx={{ position: 'relative', width: '100%', height: 320, bgcolor: 'black' }}>
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape='round'
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_area, areaPixels) => setCroppedAreaPixels(areaPixels)}
              />
            )}
          </Box>
          <Stack direction='row' spacing={2} sx={{ alignItems: 'center', mt: 2 }}>
            <Icon icon='mdi:magnify-minus' />
            <Slider
              aria-label={t('member.avatarUpload.zoom')}
              value={zoom}
              min={1}
              max={3}
              step={0.01}
              onChange={(_event, value) => setZoom(value as number)}
            />
            <Icon icon='mdi:magnify-plus' />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCropDialog} disabled={saving}>
            {t('member.avatarUpload.cancel')}
          </Button>
          <Button onClick={handleSave} variant='contained' disabled={saving || !croppedAreaPixels}>
            {t('member.avatarUpload.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

export default AvatarUpload
