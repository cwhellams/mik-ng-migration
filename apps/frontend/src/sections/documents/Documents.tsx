import {
  Typography,
  Box,
  TextField,
  InputAdornment,
  Stack,
  Chip,
  IconButton,
  Link as MuiLink,
  FormControlLabel,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Grid,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { EditButton } from '../../components/EditButton'
import { useRoles } from '../../hooks/useRoles'
import dayjs from 'dayjs'
import UploadDocumentModal from './UploadDocumentModal'
import EditDocumentModal from './EditDocumentModal'

// Import types from backend
import type {
  DocumentFilters,
  DocumentListResponse,
  Document,
  DownloadDocument,
} from '@backend/routes/documents/models'
import { Title } from '../../components/Title'
import { ResponsiveTable } from '../../components/ResponsiveTable'

const Documents = () => {
  const { t } = useTranslation()
  const { isDocumentAdmin } = useRoles()

  // Use a local array for selected categories, but keep filters.category as a comma-separated string for API compatibility
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [filters, setFilters] = useState<DocumentFilters>({
    category: '',
    search: '',
    tags: '',
    showArchived: false,
    limit: 50,
    offset: 0,
  })
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingDocument, setEditingDocument] = useState<Document | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingDocument, setDeletingDocument] = useState<Document | null>(
    null
  )

  const { mutation: downloadMutation } = useApi<DownloadDocument>(
    {
      method: 'GET',
      url: 'v1/documents/download',
      skipFetch: true,
    },
    { keepPreviousData: false }
  )

  const { data, isLoading, error, mutate } = useApi<DocumentListResponse>(
    {
      method: 'GET',
      url: 'v1/documents',
      params: filters,
    },
    {
      keepPreviousData: true,
    }
  )

  const { mutation: deleteMutation } = useApi<DocumentListResponse>({
    method: 'DELETE',
    url: 'v1/documents/' + deletingDocument?.documentId,
    skipFetch: true,
  })

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, search: event.target.value }))
  }

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) => {
      const newCategories = prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
      // Update filters.category as a comma-separated string
      setFilters((filters) => ({
        ...filters,
        category: newCategories.join(','),
      }))
      return newCategories
    })
  }

  const handleDownloadDocument = async (document: Document) => {
    if (!document.documentId) {
      console.error('Document ID is undefined')
      return
    }

    const res = await downloadMutation.trigger('GET', {
      id: document.documentId,
    })
    const url = res.data?.presignedUrl ?? ''

    if (url) {
      window.open(url, '_blank') // Opens the URL in a new tab
    }
  }

  const handleTagsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, tags: event.target.value }))
  }

  const handleShowArchivedChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFilters((prev) => ({ ...prev, showArchived: event.target.checked }))
  }

  const handleEditDocument = (document: Document) => {
    setEditingDocument(document)
    setEditModalOpen(true)
  }

  const handleDeleteDocument = (document: Document) => {
    setDeletingDocument(document)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!deletingDocument) return

    await deleteMutation.trigger('DELETE', {})
    mutate() // Refresh the data
    setDeleteDialogOpen(false)
    setDeletingDocument(null)
  }

  const getCategoryLabel = (category: string) => {
    const categoryMap: Record<string, string> = {
      financial: t('documents.category.financial', 'Financial'),
      audit: t('documents.category.audit', 'Audit'),
      minutes: t('documents.category.minutes', 'Minutes'),
      policy: t('documents.category.policy', 'Policy'),
      safety: t('documents.category.safety', 'Safety'),
      news: t('documents.category.news', 'News'),
      airfields: t('documents.category.airfields', 'Airfields'),
      other: t('documents.category.other', 'Other'),
    }
    return categoryMap[category] || category
  }

  const getCategoryColor = (category: string) => {
    const colorMap: Record<
      string,
      'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'
    > = {
      financial: 'primary',
      audit: 'error',
      minutes: 'info',
      policy: 'warning',
      safety: 'error',
      news: 'success',
      airfields: 'info',
      other: 'secondary',
    }
    return colorMap[category] || 'secondary'
  }

  return (
    <Box>
      <Title label={t('documents.title')}>
        {isDocumentAdmin && (
          <EditButton
            title={t('documents.add')}
            icon='mdi:plus'
            onClick={() => setUploadModalOpen(true)}
          />
        )}
      </Title>

      <Typography variant='body1' color='text.secondary' mb={4}>
        {t(
          'documents.description',
          'Access historical club documents including financial statements, audit reports, meeting minutes, and other administrative documents.'
        )}
      </Typography>

      {/* Filters */}
      <Stack spacing={2} mb={3} alignItems='center'>
        {/* Search row */}
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          width='100%'
          alignItems='center'
          justifyContent='center'
        >
          <TextField
            fullWidth
            placeholder={t(
              'documents.search.placeholder',
              'Search documents...'
            )}
            value={filters.search}
            onChange={handleSearchChange}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position='start'>
                    <Icon icon='mdi:magnify' />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ flexGrow: 2, minWidth: 220 }}
          />
          <TextField
            fullWidth
            placeholder={t('documents.tags.search', 'Search by tags...')}
            value={filters.tags}
            onChange={handleTagsChange}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position='start'>
                    <Icon icon='mdi:tag-multiple' />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ flexGrow: 1, minWidth: 180 }}
          />
        </Stack>

        {/* Category chips and archived toggle row */}
        <Stack
          direction='row'
          spacing={2}
          alignItems='center'
          justifyContent='space-between'
          width='100%'
        >
          <Stack
            direction='row'
            spacing={1}
            display='inline-flex'
            sx={{
              flexWrap: 'wrap',
            }}
          >
            {[
              'financial',
              'audit',
              'minutes',
              'policy',
              'safety',
              'news',
              'airfields',
              'other',
            ].map((cat) => (
              <Chip
                key={cat}
                label={getCategoryLabel(cat)}
                color={selectedCategories.includes(cat) ? 'primary' : 'default'}
                variant={
                  selectedCategories.includes(cat) ? 'filled' : 'outlined'
                }
                onClick={() => handleCategoryToggle(cat)}
                sx={{ cursor: 'pointer', fontWeight: 500 }}
              />
            ))}
          </Stack>
          <FormControlLabel
            control={
              <Switch
                checked={filters.showArchived}
                onChange={handleShowArchivedChange}
                name='showArchived'
              />
            }
            label={t('documents.archive.show', 'Show archived documents')}
            sx={{ ml: 2 }}
          />
        </Stack>
      </Stack>

      <RemoteContent isLoading={isLoading} error={error}>
        <ResponsiveTable
          header={
            <>
              <Grid size={1.5}>{t('documents.table.title')}</Grid>
              <Grid size={2}>{t('documents.table.category')}</Grid>
              <Grid size={2}>{t('documents.table.tags')}</Grid>
              <Grid size={2}>{t('documents.table.published')}</Grid>
              <Grid size={3.3}>{t('documents.table.description')}</Grid>
              <Grid size={1}>{t('documents.table.actions')}</Grid>
            </>
          }
          notFoundMsg={
            filters.search || filters.category || filters.tags
              ? t(
                  'documents.noResults',
                  'No documents found matching your criteria.'
                )
              : t('documents.empty', 'No documents available.')
          }
          rows={data?.documents}
          row={(document) => (
            <>
              <Grid size={{ xs: 6, sm: 1.5 }}>
                <Stack direction='row' spacing={1} alignItems='center'>
                  <Typography variant='body2' fontWeight='medium'>
                    {document.title}
                  </Typography>
                  {document.isArchived && (
                    <Chip
                      label={t('documents.archive.archived', 'Archived')}
                      color='default'
                      size='small'
                      variant='outlined'
                    />
                  )}
                </Stack>
              </Grid>
              <Grid size={{ xs: 6, sm: 2 }}>
                <Chip
                  label={getCategoryLabel(document.category)}
                  color={getCategoryColor(document.category)}
                  size='small'
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 2 }}>
                <Stack direction='row' spacing={0.5} flexWrap='wrap' gap={0.5}>
                  {document.tags?.map((tag, index) => (
                    <Chip
                      key={index}
                      label={tag}
                      size='small'
                      variant='outlined'
                      color='primary'
                    />
                  ))}
                  {(!document.tags || document.tags.length === 0) && (
                    <Typography variant='body2' color='text.secondary'>
                      -
                    </Typography>
                  )}
                </Stack>
              </Grid>

              <Grid size={{ xs: 6, sm: 2 }}>
                <Typography variant='body2' color='text.secondary'>
                  {dayjs(document.publishedDate).format('DD.MM.YYYY')}
                </Typography>
              </Grid>
              <Grid size={{ xs: 6, sm: 3.3 }}>
                <Typography variant='body2' color='text.secondary'>
                  {document.description || '-'}
                </Typography>
              </Grid>
              <Grid textAlign='center'>
                <Stack direction='row' spacing={1} justifyContent='center'>
                  <IconButton
                    size='small'
                    component={MuiLink}
                    onClick={() => handleDownloadDocument(document)}
                    //target='_blank'
                    rel='noopener noreferrer'
                    title={t('documents.action.open', 'Open Document')}
                  >
                    <Icon icon='mdi:open-in-new' />
                  </IconButton>

                  {isDocumentAdmin && (
                    <>
                      <IconButton
                        size='small'
                        onClick={() => handleEditDocument(document)}
                        title={t('documents.action.edit', 'Edit Document')}
                      >
                        <Icon icon='mdi:pencil' />
                      </IconButton>
                      <IconButton
                        size='small'
                        onClick={() => handleDeleteDocument(document)}
                        title={t('documents.action.delete', 'Delete Document')}
                        color='error'
                      >
                        <Icon icon='mdi:delete' />
                      </IconButton>
                    </>
                  )}
                </Stack>
              </Grid>
            </>
          )}
        />

        {data?.total !== undefined && data.total > 0 && (
          <Box mt={2}>
            <Typography variant='body2' color='text.secondary'>
              {t('documents.totalCount', 'Showing {{count}} documents', {
                count: data.total,
              })}
            </Typography>
          </Box>
        )}
      </RemoteContent>

      {/* Upload Modal */}
      <UploadDocumentModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={() => mutate()}
      />

      {/* Edit Modal */}
      {editingDocument && (
        <EditDocumentModal
          open={editModalOpen}
          document={editingDocument}
          onClose={() => {
            setEditModalOpen(false)
            setEditingDocument(null)
          }}
          onSuccess={() => mutate()}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        aria-labelledby='delete-dialog-title'
        aria-describedby='delete-dialog-description'
      >
        <DialogTitle id='delete-dialog-title'>
          {t('documents.delete.confirmTitle', 'Delete Document')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id='delete-dialog-description'>
            {t(
              'documents.delete.confirmText',
              'This action cannot be undone. The document will be permanently removed from the archive.'
            )}
          </DialogContentText>
          {deletingDocument && (
            <Typography variant='body2' sx={{ mt: 2, fontWeight: 'bold' }}>
              {deletingDocument.title}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} color='inherit'>
            {t('documents.delete.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={confirmDelete}
            color='error'
            variant='contained'
            autoFocus
          >
            {t('documents.delete.delete', 'Delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Documents
