import {
  Box,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tab,
  Tabs,
  TextField,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import type { AircraftListResponse } from '@mik/contracts/aircrafts'
import type { SearchableFindingKind } from '@mik/contracts/findings'
import { Title } from '@mik/ui/components/Title'
import useApi from '@mik/ui/hooks/useApi'
import type { Dayjs } from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { endpoints } from '../../api/endpoints'
import { FindingSearchResults } from './FindingSearchResults'
import { TrendingFindings } from './TrendingFindings'

/**
 * Defect and remark search and monitoring (#1230) -- the fleet manager's view
 * of everything the pilots have written up, rather than one aircraft's
 * logbook page at a time.
 *
 * Two tabs over one set of filters. **Search** is the literal request on the
 * issue: every recorded defect and remark, filtered by aircraft, by kind and
 * by when it was reported, with free text over the descriptions. **Patterns**
 * is the second half -- the same window, grouped into the repeat reports that
 * "this might be related" was asked for.
 *
 * It lives in the admin app because the answer on the issue was that this is
 * an admin feature, and because it is desk work: a fleet manager at a computer
 * deciding what to do next, not a pilot at the aircraft. The per-aircraft
 * version of the same question -- "what has this aeroplane been doing lately"
 * -- stayed in the member app, on the aircraft card.
 */

type FindingsTab = 'search' | 'patterns'

interface Filters {
  /** Empty means every aircraft. */
  aircraftRegistration: string
  /** Empty means both kinds. */
  kind: SearchableFindingKind | ''
  fromDate: Dayjs | null
  toDate: Dayjs | null
  q: string
}

const EMPTY_FILTERS: Filters = {
  aircraftRegistration: '',
  kind: '',
  fromDate: null,
  toDate: null,
  q: '',
}

/**
 * Filters as the API wants them. A half-typed date arrives as an invalid
 * `Dayjs`, which would serialise to `Invalid Date` and 400 the request, so an
 * incomplete bound is simply left out -- the same guard the occurrence
 * register page needs.
 */
const asParams = (filters: Filters) => ({
  ...(filters.aircraftRegistration ? { aircraftRegistration: filters.aircraftRegistration } : {}),
  ...(filters.fromDate?.isValid() ? { fromDate: filters.fromDate.format('YYYY-MM-DD') } : {}),
  ...(filters.toDate?.isValid() ? { toDate: filters.toDate.format('YYYY-MM-DD') } : {}),
})

const FindingsPage = () => {
  const { t } = useTranslation()
  const [tab, setTab] = useState<FindingsTab>('search')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)

  const { data: aircraft } = useApi<AircraftListResponse>({
    url: endpoints.aircrafts.root,
    params: { activeOnly: true },
  })

  // Every filter change resets the page: page 4 of a wider search is an empty
  // table once the search narrows, and an empty table reads as "no results".
  const update = (change: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...change }))
    setPage(1)
  }

  const searchParams = {
    ...asParams(filters),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
  }

  return (
    <Box>
      <Title label={t('findings.title')} />

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size='small'>
              <InputLabel id='findings-aircraft-label'>{t('findings.filters.aircraft')}</InputLabel>
              <Select
                labelId='findings-aircraft-label'
                value={filters.aircraftRegistration}
                label={t('findings.filters.aircraft')}
                onChange={(event) => update({ aircraftRegistration: event.target.value })}
              >
                <MenuItem value=''>{t('findings.filters.allAircraft')}</MenuItem>
                {aircraft?.aircrafts?.map((entry) => (
                  <MenuItem key={entry.registration} value={entry.registration}>
                    {entry.registration}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <FormControl fullWidth size='small' disabled={tab === 'patterns'}>
              <InputLabel id='findings-kind-label'>{t('findings.filters.kind')}</InputLabel>
              <Select
                labelId='findings-kind-label'
                value={filters.kind}
                label={t('findings.filters.kind')}
                onChange={(event) => update({ kind: event.target.value as SearchableFindingKind })}
              >
                <MenuItem value=''>{t('findings.filters.bothKinds')}</MenuItem>
                <MenuItem value='DEFECT'>{t('findings.kind.DEFECT')}</MenuItem>
                <MenuItem value='REMARK'>{t('findings.kind.REMARK')}</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <DatePicker
              label={t('findings.filters.fromDate')}
              value={filters.fromDate}
              onChange={(value) => update({ fromDate: value })}
              format={t('general.dateFormat')}
              disableFuture
              slotProps={{ textField: { fullWidth: true, size: 'small' } }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <DatePicker
              label={t('findings.filters.toDate')}
              value={filters.toDate}
              onChange={(value) => update({ toDate: value })}
              format={t('general.dateFormat')}
              disableFuture
              slotProps={{ textField: { fullWidth: true, size: 'small' } }}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              fullWidth
              size='small'
              label={t('findings.filters.text')}
              value={filters.q}
              disabled={tab === 'patterns'}
              onChange={(event) => update({ q: event.target.value })}
            />
          </Grid>
        </Grid>
      </Paper>

      <Tabs value={tab} onChange={(_, value: FindingsTab) => setTab(value)} sx={{ mb: 2 }}>
        <Tab value='search' label={t('findings.tabs.search')} />
        <Tab value='patterns' label={t('findings.tabs.patterns')} />
      </Tabs>

      {tab === 'search' ? (
        <FindingSearchResults filters={searchParams} page={page} onPageChange={setPage} />
      ) : (
        // No client-side date default: with no `fromDate` the endpoint looks
        // back a year of its own accord, and duplicating that here would make
        // two places to change it.
        <TrendingFindings filters={asParams(filters)} />
      )}
    </Box>
  )
}

export default FindingsPage
