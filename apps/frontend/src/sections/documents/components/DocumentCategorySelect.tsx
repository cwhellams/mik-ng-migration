import { FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import { useTranslation } from 'react-i18next'

interface DocumentCategorySelectProps {
  value: string
  onChange: (value: string) => void
  required?: boolean
  fullWidth?: boolean
  label?: string
  disabled?: boolean
}

export const DocumentCategorySelect = ({
  value,
  onChange,
  required = false,
  fullWidth = true,
  label,
  disabled = false,
}: DocumentCategorySelectProps) => {
  const { t } = useTranslation()
  return (
    <FormControl required={required} fullWidth={fullWidth} disabled={disabled}>
      <InputLabel>
        {label ?? t('documents.form.category', 'Category')}
      </InputLabel>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label={label ?? t('documents.form.category', 'Category')}
      >
        <MenuItem value='financial'>
          {t('documents.category.financial', 'Financial')}
        </MenuItem>
        <MenuItem value='audit'>
          {t('documents.category.audit', 'Audit')}
        </MenuItem>
        <MenuItem value='minutes'>
          {t('documents.category.minutes', 'Minutes')}
        </MenuItem>
        <MenuItem value='policy'>
          {t('documents.category.policy', 'Policy')}
        </MenuItem>
        <MenuItem value='safety'>
          {t('documents.category.safety', 'Safety')}
        </MenuItem>
        <MenuItem value='news'>{t('documents.category.news', 'News')}</MenuItem>
        <MenuItem value='airfields'>
          {t('documents.category.airfields', 'Airfields')}
        </MenuItem>
        <MenuItem value='other'>
          {t('documents.category.other', 'Other')}
        </MenuItem>
      </Select>
    </FormControl>
  )
}
