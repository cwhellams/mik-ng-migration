import React, { useMemo } from 'react'
import { Box, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { AircraftDocumentList } from './AircraftDocumentList'
import useApi from '@mik/ui/hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { AircraftDocumentListResponse } from '@mik/contracts/aircraft-documents'

interface AircraftDocumentSectionProps {
  aircraftRegistration: string
  isAdmin: boolean
}

const useAircraftDocuments = (aircraftRegistration: string) => {
  const params = useMemo(
    () => ({
      aircraftRegistration,
      limit: '100',
      offset: '0',
    }),
    [aircraftRegistration],
  )

  const { isLoading, data, error, mutate } = useApi<AircraftDocumentListResponse>({
    url: `/v1/aircraft-documents`,
    method: 'GET',
    params,
  })

  return {
    documents: data?.documents || [],
    total: data?.total || 0,
    isLoading,
    error,
    mutate,
  }
}

export const AircraftDocumentSection: React.FC<AircraftDocumentSectionProps> = ({
  aircraftRegistration,
  isAdmin,
}) => {
  const { t } = useTranslation()
  const { documents, isLoading, error, mutate } = useAircraftDocuments(aircraftRegistration)

  const handleDocumentUpdate = () => {
    mutate() // Refresh the document list
  }

  return (
    <Box sx={{ position: 'relative' }}>
      <Typography
        variant='subtitle1'
        gutterBottom
        sx={{
          color: 'text.primary',
        }}
      >
        {t('aircraft.documents')}
      </Typography>
      <br />
      <RemoteContent isLoading={isLoading} error={error}>
        <Box>
          <AircraftDocumentList
            aircraftRegistration={aircraftRegistration}
            documents={documents}
            onDocumentUpdate={handleDocumentUpdate}
            isAdmin={isAdmin}
            showUpload={isAdmin}
          />
        </Box>
      </RemoteContent>
    </Box>
  )
}
