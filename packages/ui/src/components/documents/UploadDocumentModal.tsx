import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  LinearProgress,
  Alert,
  Stack,
  Switch,
  FormControlLabel,
} from '@mui/material'
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useDropzone } from 'react-dropzone'
import { Icon } from '@iconify/react'
import dayjs from 'dayjs'
import useApi from '@mik/ui/hooks/useApi'
import { DocumentCategorySelect } from './DocumentCategorySelect'

interface UploadDocumentModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface FileWithPreview extends File {
  preview?: string
}

const UploadDocumentModal = ({ open, onClose, onSuccess }: UploadDocumentModalProps) => {
  const { t } = useTranslation()
  const [file, setFile] = useState<FileWithPreview | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [publishedDate, setPublishedDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [isPublic, setIsPublic] = useState(true)
  const [tags, setTags] = useState('')
  const [isArchived, setIsArchived] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const selectedFile = acceptedFiles[0] as FileWithPreview
      if (selectedFile) {
        selectedFile.preview = URL.createObjectURL(selectedFile)
        setFile(selectedFile)
        setUploadError(null)

        // Auto-populate title from filename if not already set
        if (!title) {
          const nameWithoutExtension = selectedFile.name.replace(/\.[^/.]+$/, '')
          setTitle(nameWithoutExtension)
        }
      }
    },
    [title],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
  })

  const { mutation } = useApi<Document>({
    method: 'POST',
    url: 'v1/documents',
    skipFetch: true,
    headers: { 'Content-Type': 'multipart/form-data' },
  })

  const handleSubmit = async () => {
    if (!file || !title || !category) {
      setUploadError('Please fill in all required fields and select a file.')
      return
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title)
      formData.append('description', description)
      formData.append('category', category)
      formData.append('publishedDate', publishedDate)
      formData.append('isPublic', isPublic.toString())
      formData.append('isArchived', isArchived.toString())

      // Parse tags and send as JSON
      const tagArray = tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
      formData.append('tags', JSON.stringify(tagArray))

      // `trigger` resolves with `{ error }` rather than throwing, so this has to
      // be checked explicitly — without it a failed upload reported success and
      // closed the dialog, leaving the member believing the document was stored.
      const { error } = await mutation.trigger('POST', formData)
      if (error) {
        setUploadError(error.detail ?? 'Failed to upload document. Please try again.')
        return
      }

      onSuccess()
      handleClose()
    } catch (error) {
      console.error('Upload error:', error)
      setUploadError('Failed to upload document. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setTitle('')
    setDescription('')
    setCategory('')
    setPublishedDate(dayjs().format('YYYY-MM-DD'))
    setIsPublic(true)
    setTags('')
    setIsArchived(false)
    setUploadError(null)
    if (file?.preview) {
      URL.revokeObjectURL(file.preview)
    }
    onClose()
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return 'mdi:file-pdf-box'
    if (mimeType.includes('word')) return 'mdi:file-word-box'
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'mdi:file-excel-box'
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation'))
      return 'mdi:file-powerpoint-box'
    if (mimeType.includes('image')) return 'mdi:file-image-box'
    if (mimeType.includes('text')) return 'mdi:file-document-box'
    return 'mdi:file-box'
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth='md' fullWidth>
      <DialogTitle>{t('documents.upload.title', 'Upload Document')}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {uploadError && (
            <Alert severity='error' onClose={() => setUploadError(null)}>
              {uploadError}
            </Alert>
          )}

          {/* File Upload Area */}
          <Box>
            <Typography variant='subtitle2' gutterBottom>
              {t('documents.upload.file', 'File')} *
            </Typography>
            <Box
              {...getRootProps()}
              sx={{
                border: '2px dashed',
                borderColor: isDragActive ? 'primary.main' : 'grey.300',
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: isDragActive ? 'action.hover' : 'transparent',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                },
              }}
            >
              <input {...getInputProps()} />
              {file ? (
                <Stack
                  direction='row'
                  spacing={2}
                  sx={{
                    alignItems: 'center',
                  }}
                >
                  <Icon icon={getFileIcon(file.type)} width={32} height={32} />
                  <Box sx={{ flexGrow: 1, textAlign: 'left' }}>
                    <Typography
                      variant='body1'
                      sx={{
                        fontWeight: 'medium',
                      }}
                    >
                      {file.name}
                    </Typography>
                    <Typography
                      variant='body2'
                      sx={{
                        color: 'text.secondary',
                      }}
                    >
                      {formatFileSize(file.size)}
                    </Typography>
                  </Box>
                  <Button
                    size='small'
                    onClick={(e) => {
                      e.stopPropagation()
                      if (file.preview) {
                        URL.revokeObjectURL(file.preview)
                      }
                      setFile(null)
                    }}
                  >
                    {t('documents.upload.remove', 'Remove')}
                  </Button>
                </Stack>
              ) : (
                <Stack
                  spacing={1}
                  sx={{
                    alignItems: 'center',
                  }}
                >
                  <Icon icon='mdi:cloud-upload' width={48} height={48} color='grey' />
                  <Typography variant='body1'>
                    {isDragActive
                      ? t('documents.upload.dropHere', 'Drop the file here...')
                      : t(
                          'documents.upload.dragDrop',
                          'Drag & drop a file here, or click to select',
                        )}
                  </Typography>
                  <Typography
                    variant='body2'
                    sx={{
                      color: 'text.secondary',
                    }}
                  >
                    {t(
                      'documents.upload.supportedFormats',
                      'Supported: PDF, Word, Excel, PowerPoint, Text, Images (Max 50MB)',
                    )}
                  </Typography>
                </Stack>
              )}
            </Box>
          </Box>

          {/* Form Fields */}
          <TextField
            label={t('documents.form.title', 'Title')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            fullWidth
          />

          <TextField
            label={t('documents.form.description', 'Description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            rows={3}
            fullWidth
          />

          <DocumentCategorySelect value={category} onChange={setCategory} required fullWidth />

          <TextField
            label={t('documents.form.publishedDate', 'Published Date')}
            value={publishedDate}
            onChange={(e) => setPublishedDate(e.target.value)}
            type='date'
            required
            fullWidth
            slotProps={{
              inputLabel: { shrink: true },
            }}
          />

          <Stack
            direction={'row'}
            spacing={2}
            sx={{
              alignItems: 'center',
            }}
          >
            <FormControl fullWidth>
              <InputLabel>{t('documents.form.visibility', 'Visibility')}</InputLabel>
              <Select
                value={isPublic ? 'public' : 'private'}
                onChange={(e) => setIsPublic(e.target.value === 'public')}
                label={t('documents.form.visibility', 'Visibility')}
              >
                <MenuItem value='public'>{t('documents.form.public', 'Public')}</MenuItem>
                <MenuItem value='private'>{t('documents.form.private', 'Private')}</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Switch
                  checked={isArchived}
                  onChange={(e) => setIsArchived(e.target.checked)}
                  name='isArchived'
                />
              }
              label={t('documents.archive.archived', 'Archived')}
              sx={{ ml: 2 }}
            />
          </Stack>

          <TextField
            label={t('documents.tags.label', 'Tags')}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t('documents.tags.placeholder', 'Add tags (comma separated)...')}
            helperText={t('documents.tags.placeholder', 'Add tags (comma separated)...')}
            fullWidth
          />

          {isUploading && (
            <Box>
              <Typography
                variant='body2'
                gutterBottom
                sx={{
                  color: 'text.secondary',
                }}
              >
                {t('documents.upload.uploading', 'Uploading...')}
              </Typography>
              <LinearProgress />
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isUploading}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          variant='contained'
          disabled={!file || !title || !category || isUploading}
        >
          {t('documents.upload.submit', 'Upload Document')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default UploadDocumentModal
