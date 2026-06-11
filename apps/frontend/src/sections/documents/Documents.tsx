import {
  Typography,
  Box,
  TextField,
  InputAdornment,
  Stack,
  Chip,
  IconButton,
  FormControlLabel,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Grid,
  Snackbar,
} from '@mui/material'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import useApi from '../../hooks/useApi'
import { RemoteContent } from '../../components/RemoteContent'
import { EditButton } from '../../components/EditButton'
import { useRoles } from '../../hooks/useRoles'
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
import { useTimezone } from '../../hooks/useTimezone'

// Express serializes Buffer as { type: 'Buffer', data: number[] }
const bufferToDataUrl = (buf: any): string | null => {
  if (!buf) return null
  const bytes = buf.type === 'Buffer' && Array.isArray(buf.data) ? buf.data : buf
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`
}

const Documents = () => {
  const { t } = useTranslation()
  const { isDocumentAdmin } = useRoles()
  const { formatDate } = useTimezone()
  const [searchParams, setSearchParams] = useSearchParams()

  // searchParams is the single source of truth for all filter state.
  // useSearchParams re-renders the component on URL changes (including
  // browser back/forward), so these derived values are always in sync.
  const search = searchParams.get('search') ?? ''
  const tags = searchParams.get('tags') ?? ''
  const categoryString = searchParams.get('category') ?? ''
  const showArchived = searchParams.get('showArchived') === 'true'
  const selectedCategories = categoryString
    ? categoryString
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
    : []

  const filters: DocumentFilters = {
    category: categoryString,
    search,
    tags,
    showArchived,
    limit: 50,
    offset: 0,
  }

  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState('')
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false)
  const [downloadData, setDownloadData] = useState<{
    tinyUrl: string | null
    qrCode: string | null
  } | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingDocument, setEditingDocument] = useState<Document | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingDocument, setDeletingDocument] = useState<Document | null>(null)

  const { mutation: downloadMutation } = useApi<DownloadDocument>(
    {
      method: 'GET',
      url: 'v1/documents/download',
      skipFetch: true,
    },
    { keepPreviousData: false },
  )

  const { data, isLoading, error, mutate } = useApi<DocumentListResponse>(
    {
      method: 'GET',
      url: 'v1/documents',
      params: filters,
    },
    {
      keepPreviousData: true,
    },
  )

  const { mutation: deleteMutation } = useApi<DocumentListResponse>({
    method: 'DELETE',
    url: 'v1/documents/' + deletingDocument?.documentId,
    skipFetch: true,
  })

  const setParam = (key: string, value: string) => {
    setSearchParams(
      (prev) => {
        if (value) {
          prev.set(key, value)
        } else {
          prev.delete(key)
        }
        return prev
      },
      { replace: true },
    )
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setParam('search', event.target.value)
  }

  const handleTagsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setParam('tags', event.target.value)
  }

  const handleShowArchivedChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setParam('showArchived', event.target.checked ? 'true' : '')
  }

  const handleCategoryToggle = (category: string) => {
    const newCategories = selectedCategories.includes(category)
      ? selectedCategories.filter((c) => c !== category)
      : [...selectedCategories, category]
    setParam('category', newCategories.join(','))
  }

  const handleDownloadDocument = async (document: Document) => {
    if (!document.documentId) {
      console.error('Document ID is undefined')
      return
    }

    // Open a blank tab within the user gesture to avoid popup blocking,
    // then redirect it to the actual URL once the async request completes.
    const tab = window.open('', '_blank')

    const res = await downloadMutation.trigger('GET', {
      id: document.documentId,
    })

    const tinyUrl = res.data?.tinyUrl ?? null
    const qrCode = bufferToDataUrl(res.data?.qrCode)

    setDownloadData({ tinyUrl, qrCode })

    if (tinyUrl && tab) {
      tab.location.href = tinyUrl
    } else {
      tab?.close()
    }
  }

  const handleShowTinyUrl = async (document: Document) => {
    if (!document.documentId) return

    const res = await downloadMutation.trigger('GET', {
      id: document.documentId,
    })

    const tinyUrl = res.data?.tinyUrl ?? null
    const qrCode = bufferToDataUrl(res.data?.qrCode)

    setDownloadData({ tinyUrl, qrCode })
    setDownloadDialogOpen(true)
  }

  const handleDirectDownload = () => {
    if (downloadData?.tinyUrl) {
      window.open(downloadData.tinyUrl, '_blank')
      setDownloadDialogOpen(false)
    }
  }

  const handleCopyFilterLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setSnackbarMessage(t('documents.filterLinkCopied', 'Filter link copied to clipboard!'))
      setSnackbarOpen(true)
    } catch (error) {
      console.error('Failed to copy filter link:', error)
    }
  }

  const handleCopyTinyUrl = async () => {
    if (downloadData?.tinyUrl) {
      try {
        await navigator.clipboard.writeText(downloadData.tinyUrl)
        setSnackbarMessage(t('documents.tinyUrlCopied', 'Tiny URL copied to clipboard!'))
        setSnackbarOpen(true)
      } catch (error) {
        console.error('Failed to copy tiny URL:', error)
      }
    }
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
          'Access historical club documents including financial statements, audit reports, meeting minutes, and other administrative documents.',
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
            placeholder={t('documents.search.placeholder', 'Search documents...')}
            value={search}
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
            value={tags}
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
                variant={selectedCategories.includes(cat) ? 'filled' : 'outlined'}
                onClick={() => handleCategoryToggle(cat)}
                sx={{ cursor: 'pointer', fontWeight: 500 }}
              />
            ))}
          </Stack>
          <Stack direction='row' alignItems='center' spacing={1}>
            <FormControlLabel
              control={
                <Switch
                  checked={showArchived}
                  onChange={handleShowArchivedChange}
                  name='showArchived'
                />
              }
              label={t('documents.archive.show', 'Show archived documents')}
            />
            <IconButton
              size='small'
              onClick={handleCopyFilterLink}
              title={t('documents.copyFilterLink', 'Copy link to current view')}
            >
              <Icon icon='mdi:share-variant' />
            </IconButton>
          </Stack>
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
            search || categoryString || tags || showArchived
              ? t('documents.noResults', 'No documents found matching your criteria.')
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
                    <Chip key={index} label={tag} size='small' variant='outlined' color='primary' />
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
                  {formatDate(document.publishedDate)}
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
                    onClick={() => handleDownloadDocument(document)}
                    title={t('documents.action.open', 'Open Document')}
                  >
                    <Icon icon='mdi:open-in-new' />
                  </IconButton>
                  <IconButton
                    size='small'
                    onClick={() => handleShowTinyUrl(document)}
                    title={t('documents.action.tinyUrl', 'Show Tiny URL')}
                  >
                    <Icon icon='mdi:link-variant' />
                  </IconButton>
                  <IconButton
                    size='small'
                    onClick={() => handleShowTinyUrl(document)}
                    title={t('documents.action.qrCode', 'Show QR Code')}
                  >
                    <Icon icon='mdi:qrcode' />
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

      {/* Download Options Dialog */}
      <Dialog
        open={downloadDialogOpen}
        onClose={() => setDownloadDialogOpen(false)}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>{t('documents.downloadOptions', 'Download Options')}</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            {downloadData?.tinyUrl && (
              <Box>
                <Typography variant='subtitle2' gutterBottom>
                  {t('documents.tinyUrl', 'Tiny URL')}
                </Typography>
                <TextField
                  fullWidth
                  value={downloadData.tinyUrl}
                  InputProps={{
                    readOnly: true,
                    endAdornment: (
                      <InputAdornment position='end'>
                        <IconButton onClick={handleCopyTinyUrl} edge='end'>
                          <Icon icon='mdi:content-copy' />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  size='small'
                />
              </Box>
            )}

            {downloadData?.qrCode && (
              <Box>
                <Typography variant='subtitle2' gutterBottom>
                  {t('documents.qrCode', 'QR Code')}
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <img
                    src={downloadData.qrCode}
                    alt='Document QR Code'
                    style={{ maxWidth: '250px', width: '100%' }}
                  />
                </Box>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDownloadDialogOpen(false)}>{t('common.close', 'Close')}</Button>
          <Button
            variant='contained'
            onClick={handleDirectDownload}
            startIcon={<Icon icon='mdi:open-in-new' />}
          >
            {t('documents.openDocument', 'Open Document')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Modal */}
      <UploadDocumentModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={() => mutate()}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
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
              'This action cannot be undone. The document will be permanently removed from the archive.',
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
          <Button onClick={confirmDelete} color='error' variant='contained' autoFocus>
            {t('documents.delete.delete', 'Delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Documents
