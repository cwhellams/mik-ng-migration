import React, { useState, useCallback } from 'react'
import {
  Box,
  Typography,
  Stack,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  Tooltip,
  Menu,
  MenuItem,
  Divider,
  Badge,
  Switch,
  FormControlLabel,
  TextField,
  FormControl,
  InputLabel,
  Select,
  InputAdornment,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import dayjs from 'dayjs'
import { DocumentUploadArea } from './AircraftDocumentUploadArea'
import useApi from '../../../hooks/useApi'
import { SNACKBAR_ANCHOR_BOTTOM_CENTER, useSnackbar } from '../../../hooks/useSnackbar'
import {
  AircraftDocument,
  AircraftDocumentAuditable,
  AircraftDocumentType,
} from '@mik/contracts/aircraft-documents'
import { DownloadDocument } from '@mik/contracts/documents'
import { DOCUMENT_CONSTANTS, getFileIcon, formatFileSize } from '../../../utils/documentHelpers'
import { useTimezone } from '../../../hooks/useTimezone'

const EXPIRING_DAYS_THRESHOLD = DOCUMENT_CONSTANTS.EXPIRING_DAYS_THRESHOLD

interface AircraftDocumentListProps {
  aircraftRegistration: string
  documents: AircraftDocumentAuditable[]
  onDocumentUpdate?: () => void
  isAdmin?: boolean
  showUpload?: boolean
}

type DocumentStatus = 'valid' | 'expiring' | 'expired' | 'missing' | 'inactive'

// Get document status
const getDocumentStatus = (doc: AircraftDocument): DocumentStatus => {
  if (!doc) return 'missing'
  if (!doc.isActive) return 'inactive'

  if (doc.validTo) {
    const daysUntilExpiry = dayjs(doc.validTo).diff(dayjs(), 'day')
    if (daysUntilExpiry < 0) return 'expired'
    if (daysUntilExpiry <= EXPIRING_DAYS_THRESHOLD) return 'expiring'
  }

  return 'valid'
}

// Get status color
const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'default' => {
  const colorMap: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    valid: 'success',
    expiring: 'warning',
    expired: 'error',
    inactive: 'default',
  }
  return colorMap[status] || 'default'
}

const getAircraftDocumentStatus = (documents: AircraftDocument[]) => {
  if (documents.length === 0) return []

  const statusCounts: Record<string, number> = {}

  documents.forEach((doc) => {
    const status = getDocumentStatus(doc)
    statusCounts[status] = (statusCounts[status] || 0) + 1
  })

  return Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
  }))
}

interface DocumentItemProps {
  document: AircraftDocumentAuditable
  onDelete?: (documentId: number) => void
  onEdit?: (document: AircraftDocument) => void
  onDownload?: (document: AircraftDocument) => void
  onShowTinyUrl?: (document: AircraftDocument) => void
  onShowQRCode?: (document: AircraftDocument) => void
  isAdmin?: boolean
}

const DocumentItem: React.FC<DocumentItemProps> = ({
  document,
  onDelete,
  onEdit,
  onDownload,
  onShowTinyUrl,
  onShowQRCode,
  isAdmin = false,
}) => {
  const { t } = useTranslation()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const { formatISODate } = useTimezone()

  const status = getDocumentStatus(document)
  const statusColor = getStatusColor(status)

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget)
  }

  const handleMenuClose = () => {
    setMenuAnchor(null)
  }

  const handleDelete = () => {
    if (document.documentId) {
      onDelete?.(document.documentId)
      handleMenuClose()
    }
  }

  const handleEdit = () => {
    onEdit?.(document)
    handleMenuClose()
  }

  const handleDownload = () => {
    onDownload?.(document)
    handleMenuClose()
  }

  const handleShowTinyUrl = () => {
    onShowTinyUrl?.(document)
    handleMenuClose()
  }

  const handleShowQRCode = () => {
    onShowQRCode?.(document)
    handleMenuClose()
  }

  return (
    <ListItem sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <Stack direction='row' spacing={2} sx={{ width: '100%', mb: 1 }}>
        <ListItemIcon sx={{ minWidth: 'auto' }}>
          <Icon icon={getFileIcon(document.mimeType)} width={24} height={24} />
        </ListItemIcon>
        <Box sx={{ flex: 1 }}>
          <Stack
            direction='row'
            spacing={1}
            sx={{
              alignItems: 'center',
              mb: 0.5,
            }}
          >
            <Typography
              variant='body2'
              sx={{
                fontWeight: 'medium',
              }}
            >
              {document.title}
            </Typography>
            <Chip
              label={t(`aircraft.document.status.${status}`)}
              size='small'
              color={statusColor}
            />
          </Stack>
          <Stack spacing={0.5}>
            <Typography
              variant='caption'
              sx={{
                color: 'text.secondary',
              }}
            >
              {document.description}
            </Typography>
            <Stack
              direction='row'
              spacing={2}
              sx={{
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              {document.validFrom && document.validTo && (
                <Typography
                  variant='caption'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {t('aircraft.document.validity')}: {document.validFrom} - {document.validTo}
                </Typography>
              )}
              {document.fileSize && (
                <Typography
                  variant='caption'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {formatFileSize(document.fileSize)}
                </Typography>
              )}
              {document.updatedAt && (
                <Typography
                  variant='caption'
                  sx={{
                    color: 'text.secondary',
                  }}
                >
                  {t('aircraft.document.lastUpdated')}: {formatISODate(document.updatedAt)}
                </Typography>
              )}
            </Stack>
          </Stack>
        </Box>
      </Stack>
      {/* Action buttons row */}
      <Stack direction='row' spacing={1} sx={{ pl: 5 }}>
        {document.documentUrl && (
          <>
            <Tooltip title={t('aircraft.document.open', 'Open Document')}>
              <IconButton size='small' onClick={handleDownload}>
                <Icon icon='mdi:open-in-new' />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('aircraft.document.tinyUrl', 'Show Tiny URL')}>
              <IconButton size='small' onClick={handleShowTinyUrl}>
                <Icon icon='mdi:link-variant' />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('aircraft.document.qrCode', 'Show QR Code')}>
              <IconButton size='small' onClick={handleShowQRCode}>
                <Icon icon='mdi:qrcode' />
              </IconButton>
            </Tooltip>
          </>
        )}
        {isAdmin && (
          <>
            <Tooltip title={t('aircraft.document.actions')}>
              <IconButton size='small' onClick={handleMenuOpen}>
                <Icon icon='mdi:dots-vertical' />
              </IconButton>
            </Tooltip>
            <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose}>
              <MenuItem onClick={handleEdit}>
                <ListItemIcon>
                  <Icon icon='mdi:pencil' />
                </ListItemIcon>
                <ListItemText primary={t('aircraft.document.edit')} />
              </MenuItem>
              <MenuItem onClick={handleDownload}>
                <ListItemIcon>
                  <Icon icon='mdi:download' />
                </ListItemIcon>
                <ListItemText primary={t('aircraft.document.download')} />
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
                <ListItemIcon>
                  <Icon icon='mdi:delete' color='error' />
                </ListItemIcon>
                <ListItemText primary={t('aircraft.document.delete.delete')} />
              </MenuItem>
            </Menu>
          </>
        )}
      </Stack>
    </ListItem>
  )
}

export const AircraftDocumentList: React.FC<AircraftDocumentListProps> = ({
  aircraftRegistration,
  documents,
  onDocumentUpdate,
  isAdmin = false,
  showUpload = false,
}) => {
  const { t } = useTranslation()
  const { showSnackbar } = useSnackbar()
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [documentToDelete, setDocumentToDelete] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | undefined>()
  const [showUploadArea, setShowUploadArea] = useState(false)
  const [showExpired, setShowExpired] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false)
  const [downloadData, setDownloadData] = useState<{
    tinyUrl: string | null
    qrCode: string | null
  } | null>(null)
  const [documentToEdit, setDocumentToEdit] = useState<AircraftDocumentAuditable | undefined>(
    undefined,
  )
  const [editFormData, setEditFormData] = useState<Partial<AircraftDocument>>({})

  // Create a map of all document types with their corresponding documents
  const documentMap = documents.reduce(
    (map, doc) => {
      if (!map[doc.documentType]) {
        map[doc.documentType] = []
      }
      map[doc.documentType].push(doc)
      return map
    },
    {} as Record<AircraftDocumentType, AircraftDocumentAuditable[]>,
  )

  // Ensure all document types are represented
  const allDocumentTypes = AircraftDocumentType.options.map((type) => ({
    type,
    documents: documentMap[type] || [],
  }))

  // Get overall status for the header
  const acDocStatus = getAircraftDocumentStatus(documents)

  const { mutation } = useApi<DownloadDocument>({
    method: 'GET',
    url: 'v1/aircraft-documents/download/',
    skipFetch: true,
  })

  // Handle document deletion
  const handleDeleteConfirm = useCallback(async () => {
    if (!documentToDelete) return

    // `trigger` resolves with `{ error }` rather than throwing, so a failure has
    // to be inspected — it used to be swallowed, closing the dialog as though
    // the document had been deleted.
    const { error } = await mutation.trigger(
      'DELETE',
      {},
      `/v1/aircraft-documents/${documentToDelete}`,
    )
    if (error) {
      setActionError(error.detail ?? t('general.savingError'))
      return
    }

    setActionError(undefined)
    onDocumentUpdate?.()
    setDeleteConfirmOpen(false)
    setDocumentToDelete(null)
  }, [mutation, documentToDelete, onDocumentUpdate, t])

  // Handle document download (open directly)
  const handleDownload = useCallback(
    async (document: AircraftDocument) => {
      if (!document.documentId) {
        console.error('Document ID is undefined')
        return
      }

      const res = await mutation.trigger('GET', { id: document.documentId }, undefined)

      const tinyUrl = res.data?.tinyUrl ?? null

      // Open document directly
      if (tinyUrl) {
        window.open(tinyUrl, '_blank')
      }
    },
    [mutation],
  )

  // Handle showing tiny URL dialog
  const handleShowTinyUrl = useCallback(
    async (document: AircraftDocument) => {
      if (!document.documentId) return

      const res = await mutation.trigger('GET', { id: document.documentId }, undefined)

      const tinyUrl = res.data?.tinyUrl ?? null
      const qrCodeBuffer = res.data?.qrCode

      let qrCode: string | null = null
      if (qrCodeBuffer) {
        // When Express sends a Buffer via JSON, it gets serialized as { type: 'Buffer', data: number[] }
        const bufferData = qrCodeBuffer as any
        const bytes =
          bufferData.type === 'Buffer' && Array.isArray(bufferData.data)
            ? bufferData.data
            : qrCodeBuffer

        const base64 = btoa(String.fromCharCode(...bytes))
        qrCode = `data:image/png;base64,${base64}`
      }

      setDownloadData({ tinyUrl, qrCode })
      setDownloadDialogOpen(true)
    },
    [mutation],
  )

  // Handle showing QR code dialog
  const handleShowQRCode = useCallback(
    async (document: AircraftDocument) => {
      await handleShowTinyUrl(document)
    },
    [handleShowTinyUrl],
  )

  const handleDirectDownload = useCallback(() => {
    if (downloadData?.tinyUrl) {
      window.open(downloadData.tinyUrl, '_blank')
      setDownloadDialogOpen(false)
    }
  }, [downloadData])

  const handleCopyTinyUrl = useCallback(async () => {
    if (downloadData?.tinyUrl) {
      try {
        await navigator.clipboard.writeText(downloadData.tinyUrl)
        showSnackbar(t('aircraft.document.tinyUrlCopied', 'Tiny URL copied to clipboard!'), {
          severity: 'success',
          autoHideDuration: 4000,
          anchorOrigin: SNACKBAR_ANCHOR_BOTTOM_CENTER,
        })
      } catch (error) {
        console.error('Failed to copy tiny URL:', error)
      }
    }
  }, [downloadData, t])

  // Handle document edit
  const handleEdit = useCallback((document: AircraftDocument) => {
    setDocumentToEdit(document as AircraftDocumentAuditable)
    setEditFormData({
      documentType: document.documentType,
      title: document.title,
      description: document.description,
      validFrom: document.validFrom,
      validTo: document.validTo,
    })
    setEditDialogOpen(true)
  }, [])

  const handleEditSave = useCallback(async () => {
    if (!documentToEdit?.documentId) return

    const { error } = await mutation.trigger(
      'PATCH',
      editFormData,
      `/v1/aircraft-documents/${documentToEdit.documentId}`,
    )
    if (error) {
      setActionError(error.detail ?? t('general.savingError'))
      return
    }

    setActionError(undefined)
    onDocumentUpdate?.()
    setEditDialogOpen(false)
    setDocumentToEdit(undefined)
    setEditFormData({})
  }, [mutation, documentToEdit, editFormData, onDocumentUpdate, t])

  // `documentToDelete` is `number | null`, so it resets to null rather than
  // undefined — unlike `documentToEdit`, which is optional.
  const closeDeleteDialog = useCallback(() => {
    setDeleteConfirmOpen(false)
    setDocumentToDelete(null)
    setActionError(undefined)
  }, [])

  const handleDeleteRequest = useCallback((documentId: number) => {
    setDocumentToDelete(documentId)
    setDeleteConfirmOpen(true)
  }, [])

  const handleUploadComplete = useCallback(() => {
    onDocumentUpdate?.()
    setShowUploadArea(false)
  }, [onDocumentUpdate])

  return (
    <Box>
      {/* Header with title and status */}
      <Stack
        direction='row'
        spacing={3}
        sx={{
          alignItems: 'center',
          mb: 2,
        }}
      >
        {documents.length > 0 ? (
          acDocStatus
            .filter(({ count }) => count > 0)
            .map(({ status, count }) => (
              <Badge key={status} badgeContent={count} color='primary'>
                <Chip
                  label={t(`aircraft.document.status.${status}`)}
                  size='small'
                  color={getStatusColor(status)}
                  variant='outlined'
                />
              </Badge>
            ))
        ) : (
          <Chip
            label={t('aircraft.document.noDocuments', 'No documents')}
            size='small'
            color='default'
            variant='outlined'
          />
        )}
        <FormControlLabel
          control={
            <Switch checked={showExpired} onChange={() => setShowExpired((prev) => !prev)} />
          }
          label={t('aircraft.document.showExpired')}
        />
      </Stack>
      {/* Upload area */}
      {showUpload && isAdmin && (
        <Box sx={{ mb: 3 }}>
          {!showUploadArea ? (
            <Button
              variant='outlined'
              startIcon={<Icon icon='mdi:plus' />}
              onClick={() => setShowUploadArea(true)}
              fullWidth
            >
              {t('aircraft.document.upload.addNew')}
            </Button>
          ) : (
            <Stack spacing={2}>
              <Stack
                direction='row'
                sx={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography variant='h6'>{t('aircraft.document.upload.title')}</Typography>
                <IconButton onClick={() => setShowUploadArea(false)}>
                  <Icon icon='mdi:close' />
                </IconButton>
              </Stack>
              <DocumentUploadArea
                aircraftRegistration={aircraftRegistration}
                onUploadComplete={handleUploadComplete}
              />
            </Stack>
          )}
        </Box>
      )}
      {/* Document types grouped by type */}
      {allDocumentTypes
        .map(({ type, documents: docs }) => ({
          type,
          documents: showExpired
            ? docs
            : docs.filter((doc) => getDocumentStatus(doc) !== 'expired'),
        }))
        .sort((a, b) => a.type.localeCompare(b.type))
        .map(({ type, documents }) => (
          <Box key={type} sx={{ mb: 2 }}>
            <Typography
              variant='subtitle2'
              sx={{
                color: 'text.secondary',
                mb: 1,
                fontWeight: 'medium',
              }}
            >
              {type}
            </Typography>

            <List dense sx={{ pl: 2 }}>
              {documents.length > 0
                ? documents.map((doc) => (
                    <DocumentItem
                      key={doc.documentId}
                      document={doc}
                      onDelete={handleDeleteRequest}
                      onEdit={handleEdit}
                      onDownload={handleDownload}
                      onShowTinyUrl={handleShowTinyUrl}
                      onShowQRCode={handleShowQRCode}
                      isAdmin={isAdmin}
                    />
                  ))
                : t('aircraft.missingDocuments')}
            </List>
          </Box>
        ))}
      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onClose={closeDeleteDialog}>
        <DialogTitle>{t('aircraft.document.delete.confirm.title')}</DialogTitle>
        <DialogContent>
          {actionError && (
            <Alert severity='error' sx={{ mb: 2 }}>
              {actionError}
            </Alert>
          )}
          <Alert severity='warning' sx={{ mb: 2 }}>
            {t('aircraft.document.delete.confirm.warning')}
          </Alert>
          <Typography>{t('aircraft.document.delete.confirm.message')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog}>{t('general.cancel')}</Button>
          <Button onClick={handleDeleteConfirm} color='error' variant='contained'>
            {t('aircraft.document.delete.confirm.action')}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Edit metadata dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false)
          setDocumentToEdit(undefined)
          setEditFormData({})
          setActionError(undefined)
        }}
        maxWidth='md'
        fullWidth
      >
        <DialogTitle>{t('aircraft.document.upload.metadata.title')}</DialogTitle>
        <DialogContent>
          {actionError && (
            <Alert severity='error' sx={{ mb: 2 }}>
              {actionError}
            </Alert>
          )}
          {documentToEdit && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography
                variant='body2'
                sx={{
                  color: 'text.secondary',
                }}
              >
                {t('aircraft.document.upload.metadata.fileName', {
                  fileName: documentToEdit.title,
                })}
              </Typography>

              <FormControl fullWidth required>
                <InputLabel>{t('aircraft.document.upload.metadata.documentType')}</InputLabel>
                <Select
                  value={editFormData.documentType || ''}
                  onChange={(e) =>
                    setEditFormData((prev) => ({
                      ...prev,
                      documentType: e.target.value as AircraftDocumentType,
                    }))
                  }
                >
                  {AircraftDocumentType.options.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                fullWidth
                required
                label={t('aircraft.document.upload.metadata.title')}
                value={editFormData.title || ''}
                onChange={(e) =>
                  setEditFormData((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
              />

              <TextField
                fullWidth
                multiline
                rows={3}
                label={t('aircraft.document.upload.metadata.description')}
                value={editFormData.description || ''}
                onChange={(e) =>
                  setEditFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />

              <Stack direction='row' spacing={2}>
                <DatePicker
                  label={t('aircraft.document.upload.metadata.validFrom')}
                  value={editFormData.validFrom ? dayjs(editFormData.validFrom) : null}
                  onChange={(date) =>
                    setEditFormData((prev) => ({
                      ...prev,
                      validFrom: date?.format('YYYY-MM-DD'),
                    }))
                  }
                  slotProps={{ textField: { fullWidth: true } }}
                />
                <DatePicker
                  label={t('aircraft.document.upload.metadata.validTo')}
                  value={editFormData.validTo ? dayjs(editFormData.validTo) : null}
                  onChange={(date) =>
                    setEditFormData((prev) => ({
                      ...prev,
                      validTo: date?.format('YYYY-MM-DD'),
                    }))
                  }
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Stack>

              {editFormData.validFrom &&
                editFormData.validTo &&
                dayjs(editFormData.validFrom).isAfter(dayjs(editFormData.validTo)) && (
                  <Alert severity='error'>
                    {t('aircraft.document.upload.metadata.dateRangeError')}
                  </Alert>
                )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setEditDialogOpen(false)
              setDocumentToEdit(undefined)
              setEditFormData({})
            }}
          >
            {t('general.cancel')}
          </Button>
          <Button
            onClick={handleEditSave}
            variant='contained'
            disabled={!editFormData.documentType || !editFormData.title || mutation.isMutating}
          >
            {t('general.save')}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Download Options Dialog */}
      <Dialog
        open={downloadDialogOpen}
        onClose={() => setDownloadDialogOpen(false)}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>{t('aircraft.document.downloadOptions', 'Download Options')}</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            {downloadData?.tinyUrl && (
              <Box>
                <Typography variant='subtitle2' gutterBottom>
                  {t('aircraft.document.tinyUrl', 'Tiny URL')}
                </Typography>
                <TextField
                  fullWidth
                  value={downloadData.tinyUrl}
                  size='small'
                  slotProps={{
                    input: {
                      readOnly: true,
                      endAdornment: (
                        <InputAdornment position='end'>
                          <IconButton onClick={handleCopyTinyUrl} edge='end'>
                            <Icon icon='mdi:content-copy' />
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </Box>
            )}

            {downloadData?.qrCode && (
              <Box>
                <Typography variant='subtitle2' gutterBottom>
                  {t('aircraft.document.qrCode', 'QR Code')}
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
            {t('aircraft.document.openDocument', 'Open Document')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
