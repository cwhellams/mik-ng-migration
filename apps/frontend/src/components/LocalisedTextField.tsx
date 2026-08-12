import { Box, Chip, FormHelperText, TextField, Typography } from '@mui/material'
import type { UiLanguage } from '../utils/localisedText'

const DEFAULT_LANGUAGES: UiLanguage[] = ['en', 'fi', 'sv']

/**
 * Applies a `LocalisedTextField` change to a form that stores each language
 * under `${prefix}En` / `${prefix}Fi` / `${prefix}Sv` (rather than a nested
 * `{en, fi, sv}` object) — the shared version of the 3-branch
 * `lang === 'en' ? val : f.xxxEn` dispatch every such form was re-implementing.
 */
export function withLocalisedField<
  Prefix extends string,
  T extends Record<`${Prefix}En` | `${Prefix}Fi` | `${Prefix}Sv`, string>,
>(form: T, prefix: Prefix, lang: UiLanguage, value: string): T {
  const enKey = `${prefix}En` as keyof T
  const fiKey = `${prefix}Fi` as keyof T
  const svKey = `${prefix}Sv` as keyof T
  return {
    ...form,
    [enKey]: lang === 'en' ? value : form[enKey],
    [fiKey]: lang === 'fi' ? value : form[fiKey],
    [svKey]: lang === 'sv' ? value : form[svKey],
  }
}

export interface LocalisedTextFieldProps {
  label: string
  values: Partial<Record<UiLanguage, string>>
  onChange: (lang: UiLanguage, value: string) => void
  required?: boolean
  multiline?: boolean
  disabled?: boolean
  /** Defaults to en/fi/sv; pass a subset for a form that only edits some languages. */
  languages?: UiLanguage[]
  /** Applies to the group as a whole — a required localised field is either present or not, not per-language. */
  error?: boolean
  helperText?: string
}

/**
 * One en/fi/sv (or subset) text input per language, grouped under a single
 * label — the shared shape for every "translated field" form control instead
 * of each admin page re-implementing its own version (see #1115).
 */
export const LocalisedTextField = ({
  label,
  values,
  onChange,
  required,
  multiline,
  disabled,
  languages = DEFAULT_LANGUAGES,
  error,
  helperText,
}: LocalisedTextFieldProps) => (
  <Box
    sx={{
      border: '1px solid',
      borderColor: error ? 'error.main' : 'divider',
      borderRadius: 1,
      p: 1.5,
    }}
  >
    <Typography
      variant='caption'
      sx={{
        color: 'text.secondary',
        display: 'block',
        mb: 1,
      }}
    >
      {label}
      {required && ' *'}
    </Typography>
    {languages.map((lang, i) => (
      <Box
        key={lang}
        sx={{
          display: 'flex',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: 1,
          mt: i > 0 ? 1 : 0,
        }}
      >
        <Chip label={lang.toUpperCase()} size='small' sx={{ width: 38, flexShrink: 0 }} />
        <TextField
          size='small'
          fullWidth
          disabled={disabled}
          // The visible label sits above the group, so each per-language box
          // would otherwise have no accessible name of its own.
          slotProps={{ htmlInput: { 'aria-label': `${label} (${lang.toUpperCase()})` } }}
          value={values[lang] ?? ''}
          onChange={(e) => onChange(lang, e.target.value)}
          multiline={multiline}
          rows={multiline ? 2 : undefined}
        />
      </Box>
    ))}
    {error && helperText && <FormHelperText error>{helperText}</FormHelperText>}
  </Box>
)
