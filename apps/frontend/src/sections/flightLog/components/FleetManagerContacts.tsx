import { Box, Link, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import useApi from '../../../hooks/useApi'
import { endpoints } from '../../../api/endpoints'
import type { MemberListResponse } from '@mik/contracts/members'

// Fleet managers (kalustovastaava) hold the PLANE_CAPTAIN role, which is a public
// role -- any logged-in member can list members filtered by it (see GET /v1/members
// in routes/members/api.ts). Shown right next to the "call the fleet manager" note
// so a pilot reporting a defect has the number to hand instead of having to look it
// up separately.
export const FleetManagerContacts = () => {
  const { t } = useTranslation()

  const { data } = useApi<MemberListResponse>({
    url: endpoints.members.root,
    params: { role: 'PLANE_CAPTAIN' },
  })

  const fleetManagers = (data?.members ?? []).filter((member) => member.phoneNumber)

  if (fleetManagers.length === 0) {
    return null
  }

  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant='body2' sx={{ fontWeight: 600 }}>
        {t('flightLog.defects.fleetManagersTitle')}
      </Typography>
      <Box component='ul' sx={{ m: 0, pl: 2.5 }}>
        {fleetManagers.map((manager) => (
          <Box component='li' key={manager.memberId}>
            <Typography variant='body2' component='span'>
              {manager.first} {manager.last}
            </Typography>
            {' — '}
            <Link href={`tel:${manager.phoneNumber!.replace(/\s+/g, '')}`} underline='hover'>
              {manager.phoneNumber}
            </Link>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
