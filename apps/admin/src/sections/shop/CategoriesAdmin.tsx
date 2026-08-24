import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import { Icon } from '@iconify/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Title } from '@mik/ui/components/Title'
import useApi from '../../hooks/useApi'
import { useSnackbar } from '../../hooks/useSnackbar'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import { LocalisedTextField, withLocalisedField } from '@mik/ui/components/LocalisedTextField'
import type { Category } from '@mik/contracts/shop'

interface CategoryFormState {
  nameEn: string
  nameFi: string
  nameSv: string
  descEn: string
  descFi: string
  descSv: string
}

const emptyForm: CategoryFormState = {
  nameEn: '',
  nameFi: '',
  nameSv: '',
  descEn: '',
  descFi: '',
  descSv: '',
}

function categoryToForm(c: Category): CategoryFormState {
  const n = c.name as Record<string, string>
  const d = c.description as Record<string, string> | undefined
  return {
    nameEn: n?.en ?? '',
    nameFi: n?.fi ?? '',
    nameSv: n?.sv ?? '',
    descEn: d?.en ?? '',
    descFi: d?.fi ?? '',
    descSv: d?.sv ?? '',
  }
}

function formToPayload(f: CategoryFormState) {
  return {
    name: { en: f.nameEn, fi: f.nameFi, sv: f.nameSv },
    description: { en: f.descEn, fi: f.descFi, sv: f.descSv },
  }
}

export default function CategoriesAdmin() {
  const { t } = useTranslation()

  const {
    data: categories,
    mutate,
    isLoading,
    error,
    mutation,
  } = useApi<Category[]>({
    url: 'v1/shop/categories',
  })

  const { showSnackbar } = useSnackbar()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState<CategoryFormState>(emptyForm)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }
  const openEdit = (c: Category) => {
    setEditing(c)
    setForm(categoryToForm(c))
    setDialogOpen(true)
  }
  const close = () => setDialogOpen(false)

  const handleSave = async () => {
    const payload = formToPayload(form)
    const result = editing
      ? await mutation.trigger('PUT', payload, editing.categoryId)
      : await mutation.trigger('POST', payload)

    if (result.error) {
      showSnackbar(t('common.error'), { severity: 'error' })
    } else {
      await mutate()
      showSnackbar(t('common.saved'), { severity: 'success' })
      close()
    }
  }

  const handleDelete = async (id: string) => {
    if (!globalThis.confirm(t('common.confirmDelete'))) return
    const result = await mutation.trigger('DELETE', {}, id)
    if (result.error) {
      showSnackbar(t('common.error'), { severity: 'error' })
    } else {
      await mutate()
      showSnackbar(t('common.deleted'), { severity: 'success' })
    }
  }

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Title label={t('shop.admin.categories')} />
        <Button variant='contained' startIcon={<Icon icon='mdi:plus' />} onClick={openCreate}>
          {t('shop.admin.addCategory')}
        </Button>
      </Box>

      <RemoteContent isLoading={isLoading} error={error}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('common.name')} (EN)</TableCell>
                <TableCell>{t('common.name')} (FI)</TableCell>
                <TableCell>{t('common.name')} (SV)</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {categories?.map((c) => {
                const n = c.name as Record<string, string>
                return (
                  <TableRow key={c.categoryId} hover>
                    <TableCell>{n?.en}</TableCell>
                    <TableCell>{n?.fi}</TableCell>
                    <TableCell>{n?.sv}</TableCell>
                    <TableCell align='right'>
                      <IconButton size='small' aria-label='Edit' onClick={() => openEdit(c)}>
                        <Icon icon='mdi:pencil' />
                      </IconButton>
                      <IconButton
                        size='small'
                        color='error'
                        aria-label='Delete'
                        onClick={() => handleDelete(c.categoryId)}
                      >
                        <Icon icon='mdi:delete' />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </RemoteContent>

      <Dialog open={dialogOpen} onClose={close} maxWidth='sm' fullWidth>
        <DialogTitle>
          {editing ? t('shop.admin.editCategory') : t('shop.admin.addCategory')}
        </DialogTitle>
        <DialogContent
          sx={{ pt: '8px !important', display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <LocalisedTextField
            label={t('common.name')}
            required
            values={{ en: form.nameEn, fi: form.nameFi, sv: form.nameSv }}
            onChange={(lang, val) => setForm((f) => withLocalisedField(f, 'name', lang, val))}
          />
          <LocalisedTextField
            label={t('common.description')}
            values={{ en: form.descEn, fi: form.descFi, sv: form.descSv }}
            onChange={(lang, val) => setForm((f) => withLocalisedField(f, 'desc', lang, val))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button
            variant='contained'
            onClick={handleSave}
            disabled={!form.nameEn.trim() || mutation.isMutating}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
