import React, { useState, useRef, useCallback } from 'react'
import {
  Box,
  Typography,
  Button,
  LinearProgress,
  Alert,
  Stack,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { useTranslation } from 'react-i18next'
import { Icon } from '@iconify/react'
import dayjs from 'dayjs'
import {
  useAircraftDocumentUpload,
  type AircraftDocumentFile,
  type UploadProgress,
} from '../../../hooks/useAircraftDocumentUpload'
import { AircraftDocumentType } from '@backend/routes/aircraft-documents/models'
import { getFileIcon, formatFileSize } from '../../../utils/documentHelpers'

interface DocumentUploadAreaProps {
  aircraftRegistration: string
  onUploadComplete?: () => void
  disabled?: boolean
  maxFiles?: number
}

interface FileWithMetadata {
  file: File
  documentType?: AircraftDocumentType
  title?: string
  description?: string
  validFrom?: string
  validTo?: string
}

// Progress indicator component
const UploadProgressItem: React.FC<{ progress: UploadProgress }> = ({
  progress,
}) => {
  const { t } = useTranslation()

  return (
    <ListItem>
      <ListItemIcon>
        <Icon
          icon={progress.status === 'error' ? 'mdi:alert-circle' : 'mdi:file'}
          color={progress.status === 'error' ? 'error' : 'primary'}
        />
      </ListItemIcon>
      <ListItemText
        primary={progress.fileName}
        secondary={
          <Stack spacing={1} sx={{ mt: 1 }}>
            <LinearProgress
              variant='determinate'
              value={progress.progress}
              color={progress.status === 'error' ? 'error' : 'primary'}
            />
            <Typography variant='caption' color='text.secondary'>
              {progress.status === 'pending' &&
                t('aircraft.document.upload.status.pending')}
              {progress.status === 'uploading' &&
                t('aircraft.document.upload.status.uploading', {
                  progress: progress.progress,
                })}
              {progress.status === 'completed' &&
                t('aircraft.document.upload.status.completed')}
              {progress.status === 'error' && progress.error}
            </Typography>
          </Stack>
        }
      />
    </ListItem>
  )
}

export const DocumentUploadArea: React.FC<DocumentUploadAreaProps> = ({
  aircraftRegistration,
  onUploadComplete,
  disabled = false,
  maxFiles = 5,
}) => {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<FileWithMetadata[]>([])
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false)
  const [currentFileIndex, setCurrentFileIndex] = useState(0)

  const { uploadFiles, progresses, isUploading, clearCompleted } =
    useAircraftDocumentUpload({
      aircraftRegistration,
      onUploadComplete: () => {
        onUploadComplete?.()
        clearCompleted()
      },
    })

  // Document type options - use the constant to ensure consistency
  const documentTypes = AircraftDocumentType

  // Handle file selection
  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return

      const newFiles: FileWithMetadata[] = []
      const remainingSlots = maxFiles - selectedFiles.length

      for (let i = 0; i < Math.min(files.length, remainingSlots); i++) {
        newFiles.push({ file: files[i] })
      }

      if (newFiles.length > 0) {
        setSelectedFiles((prev) => [...prev, ...newFiles])
        if (newFiles.length === 1) {
          // Open metadata dialog for single file
          setCurrentFileIndex(selectedFiles.length)
          setMetadataDialogOpen(true)
        }
      }
    },
    [selectedFiles.length, maxFiles]
  )

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      handleFileSelect(e.dataTransfer.files)
    },
    [handleFileSelect]
  )

  // File input click handler
  const handleFileInputClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Remove file from selection
  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Update file metadata
  const updateFileMetadata = useCallback(
    (index: number, updates: Partial<Omit<FileWithMetadata, 'file'>>) => {
      setSelectedFiles((prev) =>
        prev.map((file, i) => (i === index ? { ...file, ...updates } : file))
      )
    },
    []
  )

  // Start upload process
  const handleUpload = useCallback(async () => {
    const filesToUpload: AircraftDocumentFile[] = selectedFiles
      .filter((f) => f.documentType && f.title)
      .map((f) => {
        const aircraftFile = f.file as AircraftDocumentFile
        aircraftFile.documentType = f.documentType!
        aircraftFile.title = f.title!
        aircraftFile.description = f.description
        aircraftFile.validFrom = f.validFrom
        aircraftFile.validTo = f.validTo
        aircraftFile.aircraftRegistration = aircraftRegistration
        return aircraftFile
      })

    if (filesToUpload.length === 0) {
      return
    }

    await uploadFiles(filesToUpload)
    setSelectedFiles([])
  }, [aircraftRegistration, selectedFiles, uploadFiles])

  // Handle metadata dialog
  const handleMetadataDialogClose = useCallback(() => {
    setMetadataDialogOpen(false)
  }, [])

  const currentFile = selectedFiles[currentFileIndex]

  return (
    <Box>
      {/* Drop area */}
      <Paper
        elevation={isDragOver ? 4 : 1}
        sx={{
          p: 3,
          textAlign: 'center',
          border: isDragOver ? '2px dashed' : '2px solid transparent',
          borderColor: isDragOver ? 'primary.main' : 'divider',
          bgcolor: isDragOver ? 'action.hover' : 'background.paper',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'all 0.2s ease-in-out',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={disabled ? undefined : handleFileInputClick}
      >
        <input
          ref={fileInputRef}
          type='file'
          multiple
          accept='.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp'
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(e.target.files)}
          disabled={disabled}
        />

        <Icon icon='mdi:cloud-upload' width={48} height={48} color='primary' />
        <Typography variant='h6' gutterBottom>
          {t('aircraft.document.upload.dropZone.title')}
        </Typography>
        <Typography variant='body2' color='text.secondary' gutterBottom>
          {t('aircraft.document.upload.dropZone.subtitle')}
        </Typography>
        <Button
          variant='outlined'
          startIcon={<Icon icon='mdi:file-plus' />}
          disabled={disabled || selectedFiles.length >= maxFiles}
          sx={{ mt: 2 }}
        >
          {t('aircraft.document.upload.selectFiles')}
        </Button>
      </Paper>

      {/* Selected files */}
      {selectedFiles.length > 0 && (
        <Stack spacing={2} sx={{ mt: 2 }}>
          <Typography variant='subtitle2'>
            {t('aircraft.document.upload.selectedFiles', {
              count: selectedFiles.length,
              max: maxFiles,
            })}
          </Typography>

          <List dense>
            {selectedFiles.map((fileData, index) => (
              <ListItem
                key={`${fileData.file.name}-${index}`}
                secondaryAction={
                  <>
                    <IconButton
                      edge='end'
                      onClick={() => {
                        setCurrentFileIndex(index)
                        setMetadataDialogOpen(true)
                      }}
                      disabled={isUploading}
                    >
                      <Icon icon='mdi:pencil' />
                    </IconButton>
                    <IconButton
                      edge='end'
                      onClick={() => removeFile(index)}
                      disabled={isUploading}
                    >
                      <Icon icon='mdi:delete' />
                    </IconButton>
                  </>
                }
              >
                <ListItemIcon>
                  <Icon icon={getFileIcon(fileData.file.type)} />
                </ListItemIcon>
                <ListItemText
                  primary={fileData.file.name}
                  secondary={
                    <Stack direction='row' spacing={1} alignItems='center'>
                      <Typography variant='caption'>
                        {formatFileSize(fileData.file.size)}
                      </Typography>
                      {fileData.documentType && (
                        <Chip
                          label={fileData.documentType}
                          size='small'
                          variant='outlined'
                        />
                      )}
                      {!fileData.title && (
                        <Chip
                          label={t('aircraft.document.upload.metadataRequired')}
                          size='small'
                          color='warning'
                        />
                      )}
                    </Stack>
                  }
                />
              </ListItem>
            ))}
          </List>

          <Button
            variant='contained'
            onClick={handleUpload}
            disabled={
              isUploading ||
              selectedFiles.some((f) => !f.documentType || !f.title) ||
              selectedFiles.length === 0
            }
            startIcon={<Icon icon='mdi:upload' />}
          >
            {t('aircraft.document.upload.start')}
          </Button>
        </Stack>
      )}

      {/* Upload progress */}
      {progresses.length > 0 && (
        <Stack spacing={2} sx={{ mt: 2 }}>
          <Typography variant='subtitle2'>
            {t('aircraft.document.upload.progress')}
          </Typography>
          <List dense>
            {progresses.map((progress: UploadProgress) => (
              <UploadProgressItem key={progress.fileId} progress={progress} />
            ))}
          </List>
        </Stack>
      )}

      {/* Metadata dialog */}
      <Dialog
        open={metadataDialogOpen}
        onClose={handleMetadataDialogClose}
        maxWidth='md'
        fullWidth
      >
        <DialogTitle>
          {t('aircraft.document.upload.metadata.title')}
        </DialogTitle>
        <DialogContent>
          {currentFile && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant='body2' color='text.secondary'>
                {t('aircraft.document.upload.metadata.fileName', {
                  fileName: currentFile.file.name,
                })}
              </Typography>

              <FormControl fullWidth required>
                <InputLabel>
                  {t('aircraft.document.upload.metadata.documentType')}
                </InputLabel>
                <Select
                  value={currentFile.documentType || ''}
                  onChange={(e) =>
                    updateFileMetadata(currentFileIndex, {
                      documentType: e.target.value as AircraftDocumentType,
                    })
                  }
                >
                  {documentTypes.options.map((type: AircraftDocumentType) => (
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
                value={currentFile.title || ''}
                onChange={(e) =>
                  updateFileMetadata(currentFileIndex, {
                    title: e.target.value,
                  })
                }
              />

              <TextField
                fullWidth
                multiline
                rows={3}
                label={t('aircraft.document.upload.metadata.description')}
                value={currentFile.description || ''}
                onChange={(e) =>
                  updateFileMetadata(currentFileIndex, {
                    description: e.target.value,
                  })
                }
              />

              <Stack direction='row' spacing={2}>
                <DatePicker
                  label={t('aircraft.document.upload.metadata.validFrom')}
                  value={
                    currentFile.validFrom ? dayjs(currentFile.validFrom) : null
                  }
                  onChange={(date) =>
                    updateFileMetadata(currentFileIndex, {
                      validFrom: date?.format('YYYY-MM-DD'),
                    })
                  }
                  slotProps={{ textField: { fullWidth: true } }}
                />
                <DatePicker
                  label={t('aircraft.document.upload.metadata.validTo')}
                  value={
                    currentFile.validTo ? dayjs(currentFile.validTo) : null
                  }
                  onChange={(date) =>
                    updateFileMetadata(currentFileIndex, {
                      validTo: date?.format('YYYY-MM-DD'),
                    })
                  }
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Stack>

              {currentFile.validFrom &&
                currentFile.validTo &&
                dayjs(currentFile.validFrom).isAfter(
                  dayjs(currentFile.validTo)
                ) && (
                  <Alert severity='error'>
                    {t('aircraft.document.upload.metadata.dateRangeError')}
                  </Alert>
                )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleMetadataDialogClose}>
            {t('general.cancel')}
          </Button>
          <Button
            onClick={handleMetadataDialogClose}
            variant='contained'
            disabled={!currentFile?.documentType || !currentFile?.title}
          >
            {t('general.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
