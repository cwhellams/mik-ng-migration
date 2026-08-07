import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Autocomplete, TextField } from '@mui/material'
import type { AddressSearchResponse, AddressSearchResult } from '@backend/routes/mileage-geo/models'
import { api } from '../../hooks/useApi'

// lat/lon are optional: when the address-search service is unavailable, the member can
// still type an address by hand — it's kept as free text with no coordinates, which
// simply means the server can't auto-compute a distance for that leg (issue #1021).
export type AddressValue = { label: string; lat?: number; lon?: number } | null

interface Props {
  label: string
  value: AddressValue
  onChange: (value: AddressValue) => void
  disabled?: boolean
  required?: boolean
  error?: boolean
}

const MIN_QUERY_LENGTH = 3
const DEBOUNCE_MS = 400

// Free-text address search, debounced against our backend's Nominatim proxy — no
// map widget or third-party script ever reaches the browser (issue #1021). Falls back
// to plain free-text entry (no coordinates) if the search service errors or is
// throttled, so a technical issue on our end never blocks submitting a claim.
export function AddressAutocomplete({ label, value, onChange, disabled, required, error }: Props) {
  const { t } = useTranslation()
  const [inputValue, setInputValue] = useState(value?.label ?? '')
  const [options, setOptions] = useState<AddressSearchResult[]>(
    value?.lat != null && value.lon != null
      ? [{ label: value.label, lat: value.lat, lon: value.lon }]
      : [],
  )
  const [loading, setLoading] = useState(false)
  const [searchUnavailable, setSearchUnavailable] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Discards a slow response for an old query if a newer one has since been issued.
  const requestIdRef = useRef(0)

  useEffect(() => {
    setInputValue(value?.label ?? '')
  }, [value])

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    [],
  )

  const search = (query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.trim().length < MIN_QUERY_LENGTH) {
      requestIdRef.current++ // invalidate any in-flight request for a longer query
      setOptions([])
      setLoading(false)
      return
    }

    setLoading(true)
    const requestId = ++requestIdRef.current
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get<AddressSearchResponse>('v1/mileage/address-search', {
          params: { q: query },
        })
        if (requestIdRef.current !== requestId) return
        setOptions(res.data.results)
        setSearchUnavailable(false)
      } catch {
        if (requestIdRef.current !== requestId) return
        // Don't block the user on our own tooling failing — they can still type the
        // address manually and submit; only distance auto-fill is lost for this leg.
        setOptions([])
        setSearchUnavailable(true)
      } finally {
        if (requestIdRef.current === requestId) setLoading(false)
      }
    }, DEBOUNCE_MS)
  }

  // Commits whatever was typed as a manual (no-coordinate) address if the user leaves
  // the field without picking a suggestion — otherwise their typing would just be
  // discarded on blur, which is exactly the dead end the search-outage case must avoid.
  const commitManualEntry = () => {
    const text = inputValue.trim()
    if (!text || text === value?.label) return
    onChange({ label: text })
  }

  return (
    <Autocomplete
      freeSolo
      fullWidth
      disabled={disabled}
      options={options}
      value={value}
      loading={loading}
      filterOptions={(opts) => opts}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.label)}
      isOptionEqualToValue={(option, val) =>
        option.label === (typeof val === 'string' ? val : val?.label)
      }
      inputValue={inputValue}
      onInputChange={(_e, newValue, reason) => {
        setInputValue(newValue)
        if (reason === 'input') search(newValue)
      }}
      onChange={(_e, newValue) => {
        if (newValue == null) return onChange(null)
        onChange(typeof newValue === 'string' ? { label: newValue } : newValue)
      }}
      onBlur={commitManualEntry}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          error={error}
          helperText={
            searchUnavailable ? t('expenses.mileage.addressSearchUnavailable') : undefined
          }
        />
      )}
    />
  )
}
