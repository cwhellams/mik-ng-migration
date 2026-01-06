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
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import dayjs from 'dayjs'
import { DocumentUploadArea } from './AircraftDocumentUploadArea'
import useApi from '../../../hooks/useApi'
import {
  AircraftDocument,
  AircraftDocumentAuditable,
  AircraftDocumentType,
} from '@backend/routes/aircraft-documents/models'
import { DownloadDocument } from '@backend/routes/documents/models'
import {
  DOCUMENT_CONSTANTS,
  getFileIcon,
  formatFileSize,
} from '../../../utils/documentHelpers'

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
const getStatusColor = (
  status: string
): 'success' | 'warning' | 'error' | 'default' => {
  const colorMap: Record<string, 'success' | 'warning' | 'error' | 'default'> =
    {
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
  isAdmin?: boolean
}

const DocumentItem: React.FC<DocumentItemProps> = ({
  document,
  onDelete,
  onEdit,
  onDownload,
  isAdmin = false,
}) => {
  const { t } = useTranslation()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

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

  return (
    <ListItem
      secondaryAction={
        <Stack direction='row' spacing={1}>
          {document.documentUrl && (
            <Tooltip title={t('aircraft.document.download')}>
              <IconButton size='small' onClick={handleDownload}>
                <Icon icon='mdi:download' />
              </IconButton>
            </Tooltip>
          )}
          {isAdmin && (
            <>
              <Tooltip title={t('aircraft.document.actions')}>
                <IconButton size='small' onClick={handleMenuOpen}>
                  <Icon icon='mdi:dots-vertical' />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={handleMenuClose}
              >
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
                  <ListItemText
                    primary={t('aircraft.document.delete.delete')}
                  />
                </MenuItem>
              </Menu>
            </>
          )}
        </Stack>
      }
    >
      <ListItemIcon>
        <Icon icon={getFileIcon(document.mimeType)} width={24} height={24} />
      </ListItemIcon>
      <ListItemText
        primary={
          <Stack direction='row' spacing={1} alignItems='center'>
            <Typography variant='body2' fontWeight='medium'>
              {document.title}
            </Typography>
            <Chip
              label={t(`aircraft.document.status.${status}`)}
              size='small'
              color={statusColor}
            />
          </Stack>
        }
        secondary={
          <Stack spacing={0.5}>
            <Typography variant='caption' color='text.secondary'>
              {document.description}
            </Typography>
            <Stack direction='row' spacing={2} alignItems='center'>
              {document.validFrom && document.validTo && (
                <Typography variant='caption' color='text.secondary'>
                  {t('aircraft.document.validity')}: {document.validFrom} -{' '}
                  {document.validTo}
                </Typography>
              )}
              {document.fileSize && (
                <Typography variant='caption' color='text.secondary'>
                  {formatFileSize(document.fileSize)}
                </Typography>
              )}
              {document.updatedAt && (
                <Typography variant='caption' color='text.secondary'>
                  {t('aircraft.document.lastUpdated')}:{' '}
                  {dayjs(document.updatedAt).format('YYYY-MM-DD')}
                </Typography>
              )}
            </Stack>
          </Stack>
        }
      />
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [documentToDelete, setDocumentToDelete] = useState<number | null>(null)
  const [showUploadArea, setShowUploadArea] = useState(false)
  const [showExpired, setShowExpired] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [documentToEdit, setDocumentToEdit] = useState<
    AircraftDocumentAuditable | undefined
  >(undefined)
  const [editFormData, setEditFormData] = useState<Partial<AircraftDocument>>(
    {}
  )

  // Create a map of all document types with their corresponding documents
  const documentMap = documents.reduce(
    (map, doc) => {
      if (!map[doc.documentType]) {
        map[doc.documentType] = []
      }
      map[doc.documentType].push(doc)
      return map
    },
    {} as Record<AircraftDocumentType, AircraftDocumentAuditable[]>
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

    try {
      await mutation.trigger(
        'DELETE',
        {},
        `/v1/aircraft-documents/${documentToDelete}`
      )

      onDocumentUpdate?.()
      setDeleteConfirmOpen(false)
      setDocumentToDelete(null)
    } catch (error) {
      console.error('Error deleting document:', error)
    }
  }, [mutation, documentToDelete, onDocumentUpdate])

  // Handle document download
  const handleDownload = useCallback(
    async (document: AircraftDocument) => {
      if (!document.documentId) {
        console.error('Document ID is undefined')
        return
      }

      const res = await mutation.trigger(
        'GET',
        { id: document.documentId },
        undefined
      )
      const url = res.data?.presignedUrl

      if (url) {
        window.open(url, '_blank')
      }
    },
    [mutation]
  )

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

    try {
      await mutation.trigger(
        'PATCH',
        editFormData,
        `/v1/aircraft-documents/${documentToEdit.documentId}`
      )

      onDocumentUpdate?.()
      setEditDialogOpen(false)
      setDocumentToEdit(undefined)
      setEditFormData({})
    } catch (error) {
      console.error('Error updating document:', error)
      // TODO: Show error toast
    }
  }, [mutation, documentToEdit, editFormData, onDocumentUpdate])

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
      <Stack direction='row' spacing={3} alignItems='center' sx={{ mb: 2 }}>
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
            <Switch
              checked={showExpired}
              onChange={() => setShowExpired((prev) => !prev)}
            />
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
                justifyContent='space-between'
                alignItems='center'
              >
                <Typography variant='h6'>
                  {t('aircraft.document.upload.title')}
                </Typography>
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
        .filter(({ documents }) => documents.length > 0)
        .sort((a, b) => a.type.localeCompare(b.type))
        .map(({ type, documents: docs }) => (
          <Box key={type} sx={{ mb: 2 }}>
            <Typography
              variant='subtitle2'
              color='text.secondary'
              sx={{ mb: 1, fontWeight: 'medium' }}
            >
              {type}
            </Typography>

            <List dense sx={{ pl: 2 }}>
              {docs.map((doc) => (
                <DocumentItem
                  key={doc.documentId}
                  document={doc}
                  onDelete={handleDeleteRequest}
                  onEdit={handleEdit}
                  onDownload={handleDownload}
                  isAdmin={isAdmin}
                />
              ))}
            </List>
          </Box>
        ))}

      <Divider sx={{ my: 3 }} />

      {/* Missing documents section */}
      <Box>
        <Typography variant='h5' fontWeight='bold' sx={{ mt: 4, mb: 2 }}>
          {t('aircraft.missingDocuments')}!
        </Typography>

        <Stack direction='column' spacing={1} alignItems='left'>
          {allDocumentTypes
            .filter(
              ({ documents, type }) =>
                documents.length === 0 && type !== 'Other'
            )
            .sort((a, b) => a.type.localeCompare(b.type))
            .map(({ type }) => (
              <Typography key={type} variant='body1' fontWeight='medium'>
                {type}
              </Typography>
            ))}
        </Stack>
      </Box>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>{t('aircraft.document.delete.confirm.title')}</DialogTitle>
        <DialogContent>
          <Alert severity='warning' sx={{ mb: 2 }}>
            {t('aircraft.document.delete.confirm.warning')}
          </Alert>
          <Typography>
            {t('aircraft.document.delete.confirm.message')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>
            {t('general.cancel')}
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color='error'
            variant='contained'
          >
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
        }}
        maxWidth='md'
        fullWidth
      >
        <DialogTitle>
          {t('aircraft.document.upload.metadata.title')}
        </DialogTitle>
        <DialogContent>
          {documentToEdit && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant='body2' color='text.secondary'>
                {t('aircraft.document.upload.metadata.fileName', {
                  fileName: documentToEdit.title,
                })}
              </Typography>

              <FormControl fullWidth required>
                <InputLabel>
                  {t('aircraft.document.upload.metadata.documentType')}
                </InputLabel>
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
                  value={
                    editFormData.validFrom
                      ? dayjs(editFormData.validFrom)
                      : null
                  }
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
                  value={
                    editFormData.validTo ? dayjs(editFormData.validTo) : null
                  }
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
                dayjs(editFormData.validFrom).isAfter(
                  dayjs(editFormData.validTo)
                ) && (
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
            disabled={
              !editFormData.documentType ||
              !editFormData.title ||
              mutation.isMutating
            }
          >
            {t('general.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
