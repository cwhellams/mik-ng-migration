import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Stack,
  Chip,
  FormControlLabel,
  Switch,
  Typography,
} from '@mui/material'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Document, DocumentUpdate } from '@mik/contracts/documents'
import useApi from '@mik/ui/hooks/useApi'
import { DocumentCategorySelect } from './components/DocumentCategorySelect'

interface EditDocumentModalProps {
  open: boolean
  document: Document
  onClose: () => void
  onSuccess: () => void
}

const EditDocumentModal = ({ open, document, onClose, onSuccess }: EditDocumentModalProps) => {
  const { t } = useTranslation()

  const [formData, setFormData] = useState<DocumentUpdate>({
    title: '',
    description: '',
    category: '',
    isArchived: false,
    tags: [],
  })
  const [tagInput, setTagInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { mutation } = useApi<DocumentUpdate>({
    url: 'v1/documents/' + (document ? `${document.documentId}` : ''),
    skipFetch: true,
  })

  useEffect(() => {
    if (document) {
      setFormData({
        title: document.title,
        description: document.description || '',
        category: document.category,
        isArchived: document.isArchived || false,
        tags: document.tags || [],
      })
      setTagInput((document.tags || []).join(', '))
    }
  }, [document])

  const handleSubmit = async () => {
    setIsSubmitting(true)

    try {
      // Parse tags from comma-separated string
      const tags = tagInput
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)

      const updateData = {
        ...formData,
        tags,
      }

      const response = await mutation.trigger('PATCH', updateData)

      if (response && response.error) console.error('Failed to update document')
      else {
        onSuccess()
        onClose()
      }
    } catch (error) {
      console.error('Error updating document:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    const currentTags = tagInput
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)

    const newTags = currentTags.filter((tag) => tag !== tagToRemove)
    setTagInput(newTags.join(', '))
  }

  const currentTags = tagInput
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)

  return (
    <Dialog open={open} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>{t('documents.upload.edit', 'Edit Document')}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <TextField
            fullWidth
            label={t('documents.edit.title', 'Title')}
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            required
          />

          <TextField
            fullWidth
            label={t('documents.edit.description', 'Description')}
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            multiline
            rows={3}
          />

          <DocumentCategorySelect
            value={formData.category}
            onChange={(e) => setFormData((prev) => ({ ...prev, category: e }))}
            required
            fullWidth
          />

          <Box>
            <TextField
              fullWidth
              label={t('documents.edit.tags', 'Tags')}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder={t('documents.tags.placeholder', 'Add tags (comma separated)...')}
              helperText={t('documents.tags.placeholder', 'Add tags (comma separated)...')}
            />

            {currentTags.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography
                  variant='body2'
                  sx={{
                    color: 'text.secondary',
                    mb: 1,
                  }}
                >
                  Current tags:
                </Typography>
                <Stack
                  direction='row'
                  spacing={1}
                  sx={{
                    flexWrap: 'wrap',
                    gap: 1,
                  }}
                >
                  {currentTags.map((tag, index) => (
                    <Chip
                      key={index}
                      label={tag}
                      onDelete={() => handleRemoveTag(tag)}
                      size='small'
                      color='primary'
                      variant='outlined'
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Box>

          <FormControlLabel
            control={
              <Switch
                checked={formData.isArchived}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    isArchived: e.target.checked,
                  }))
                }
                name='isArchived'
              />
            }
            label={t('documents.edit.archived', 'Archived')}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color='inherit'>
          {t('documents.edit.cancel', 'Cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          variant='contained'
          disabled={isSubmitting || !formData.title || !formData.category}
        >
          {isSubmitting
            ? t('documents.upload.uploading', 'Uploading...')
            : t('documents.edit.save', 'Save Changes')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default EditDocumentModal
