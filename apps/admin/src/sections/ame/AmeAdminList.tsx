import { Box, Tab, Tabs } from '@mui/material'
import { useState } from 'react'
import { Title } from '@mik/ui/components/Title'
import useApi from '@mik/ui/hooks/useApi'
import type { AmePendingCounts } from '@mik/contracts/ame'
import { AmeSubmissionsAdminTab } from './AmeSubmissionsAdminTab'
import { AmeEditSuggestionsAdminTab } from './AmeEditSuggestionsAdminTab'
import { AmeRemovalRequestsAdminTab } from './AmeRemovalRequestsAdminTab'

export default function AmeAdminList() {
  const [tab, setTab] = useState(0)
  const { data: counts } = useApi<AmePendingCounts>({ url: 'v1/ame/admin/pending/count' })

  return (
    <Box>
      <Title label='AME Approvals' />

      <Tabs value={tab} onChange={(_e, value) => setTab(value)} sx={{ mb: 3 }}>
        <Tab label={`New submissions${counts?.submissions ? ` (${counts.submissions})` : ''}`} />
        <Tab
          label={`Edit suggestions${counts?.editSuggestions ? ` (${counts.editSuggestions})` : ''}`}
        />
        <Tab
          label={`Removal requests${counts?.removalRequests ? ` (${counts.removalRequests})` : ''}`}
        />
      </Tabs>

      {tab === 0 && <AmeSubmissionsAdminTab />}
      {tab === 1 && <AmeEditSuggestionsAdminTab />}
      {tab === 2 && <AmeRemovalRequestsAdminTab />}
    </Box>
  )
}
