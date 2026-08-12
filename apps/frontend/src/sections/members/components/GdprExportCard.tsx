import { useState } from 'react'
import { Box, Button, Card, CardContent, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { FormTitle } from '../../../components/FormTitle'
import { SnackAlert } from '../../../components/SnackAlert'
import { Problem } from '@mik/contracts/problem'

const API_BASE = import.meta.env.VITE_API_TARGET ?? ''

export const GdprExportCard = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState<Problem | undefined>()

  const handleDownload = async () => {
    setLoading(true)
    setProblem(undefined)
    try {
      const response = await fetch(`${API_BASE}/api/v1/members/me/gdpr-export`, {
        credentials: 'include',
      })

      if (!response.ok) {
        setProblem({
          status: response.status,
          detail: t('gdprExport.downloadError'),
        })
        return
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      // Use filename from Content-Disposition header if available
      const disposition = response.headers.get('Content-Disposition')
      const match = disposition?.match(/filename="([^"]+)"/)
      link.download = match ? match[1] : `mik-data-export.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setProblem({ status: 500, detail: t('gdprExport.downloadError') })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <SnackAlert problem={problem} />
        <FormTitle title={t('gdprExport.title')} icon='mdi:download-circle' />
        <Typography
          variant='body2'
          sx={{
            color: 'text.secondary',
            mb: 2,
          }}
        >
          {t('gdprExport.description')}
        </Typography>
        <Box>
          <Button
            variant='outlined'
            startIcon={<Icon icon='mdi:download' />}
            onClick={handleDownload}
            loading={loading}
            size='small'
          >
            {t('gdprExport.downloadButton')}
          </Button>
        </Box>
      </CardContent>
    </Card>
  )
}
