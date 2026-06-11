import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Switch,
  IconButton,
  Box,
  Typography,
  Paper,
  Alert,
} from '@mui/material'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import CloseIcon from '@mui/icons-material/Close'
import { useState } from 'react'
import type { DashboardComponent, DashboardComponentMetadata } from '../types'
import { getCustomizableComponentMetadata } from '../types'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'

interface DashboardSettingsModalProps {
  open: boolean
  onClose: () => void
  settings: DashboardComponent[]
  onSave: (settings: DashboardComponent[]) => Promise<void>
  accessibleComponentIds: string[]
}

export const DashboardSettingsModal = ({
  open,
  onClose,
  settings,
  onSave,
  accessibleComponentIds,
}: DashboardSettingsModalProps) => {
  // Filter settings to only include accessible components
  const accessibleSettings = (settings || []).filter((s) => accessibleComponentIds.includes(s.id))
  const [localSettings, setLocalSettings] = useState<DashboardComponent[]>(accessibleSettings)
  const [saving, setSaving] = useState(false)

  // Filter metadata to only show components the user has access to
  const customizableMetadata = getCustomizableComponentMetadata().filter((m) =>
    accessibleComponentIds.includes(m.id),
  )

  const getMetadata = (id: string): DashboardComponentMetadata | undefined => {
    return customizableMetadata.find((m) => m.id === id)
  }

  const handleToggleVisibility = (id: string) => {
    setLocalSettings((prev) =>
      prev.map((component) =>
        component.id === id ? { ...component, visible: !component.visible } : component,
      ),
    )
  }

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return
    }

    const items = Array.from(localSettings)
    const [reorderedItem] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, reorderedItem)

    // Update order values
    const reordered = items.map((item, index) => ({
      ...item,
      order: index,
    }))

    setLocalSettings(reordered)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Merge the modified accessible settings back into the full settings list
      // This ensures we send all components to the backend, not just the ones the user can customize
      const updatedSettings = (settings || []).map((originalComponent) => {
        const modifiedComponent = localSettings.find((c) => c.id === originalComponent.id)
        return modifiedComponent || originalComponent
      })

      await onSave(updatedSettings)
      onClose()
    } catch (error) {
      console.error('Failed to save dashboard settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setLocalSettings(accessibleSettings) // Reset to original settings
    onClose()
  }

  // Sort by order
  const sortedSettings = [...localSettings].sort((a, b) => a.order - b.order)

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth='sm' fullWidth>
      <DialogTitle>
        <Box display='flex' justifyContent='space-between' alignItems='center'>
          <Typography variant='h6'>Dashboard Settings</Typography>
          <IconButton edge='end' color='inherit' onClick={handleCancel} aria-label='close'>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity='info' sx={{ mb: 2 }}>
          Drag components to reorder them. Toggle visibility with the switch.
          <br />
          <strong>Note:</strong> Alert and notification banners are always visible when applicable
          and cannot be customized.
        </Alert>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId='dashboard-components'>
            {(provided, snapshot) => (
              <List
                {...provided.droppableProps}
                ref={provided.innerRef}
                sx={{
                  bgcolor: snapshot.isDraggingOver ? 'action.hover' : 'background.paper',
                  borderRadius: 1,
                }}
              >
                {sortedSettings.map((component, index) => {
                  const metadata = getMetadata(component.id)
                  if (!metadata) return null

                  return (
                    <Draggable key={component.id} draggableId={component.id} index={index}>
                      {(provided, snapshot) => (
                        <Paper
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          elevation={snapshot.isDragging ? 3 : 0}
                          sx={{
                            mb: 1,
                            opacity: component.visible ? 1 : 0.5,
                            bgcolor: snapshot.isDragging ? 'action.selected' : 'background.paper',
                          }}
                        >
                          <ListItem
                            secondaryAction={
                              <Switch
                                edge='end'
                                checked={component.visible}
                                onChange={() => handleToggleVisibility(component.id)}
                                slotProps={{
                                  input: {
                                    'aria-label': `Toggle ${metadata.label}`,
                                  },
                                }}
                              />
                            }
                          >
                            <ListItemIcon {...provided.dragHandleProps} sx={{ cursor: 'grab' }}>
                              <DragIndicatorIcon />
                            </ListItemIcon>
                            <Box sx={{ mr: 2, fontSize: '1.5rem' }}>{metadata.icon}</Box>
                            <ListItemText
                              primary={metadata.label}
                              secondary={metadata.description}
                            />
                          </ListItem>
                        </Paper>
                      )}
                    </Draggable>
                  )
                })}
                {provided.placeholder}
              </List>
            )}
          </Droppable>
        </DragDropContext>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} variant='contained' disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
