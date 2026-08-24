import { Box, Card, CardActionArea, CardContent, Typography } from '@mui/material'
import { Icon } from '@iconify/react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Title } from '@mik/ui/components/Title'

const sections = [
  {
    to: '/admin/shop/products',
    icon: 'mdi:shopping',
    label: 'shop.admin.products',
  },
  {
    to: '/admin/shop/categories',
    icon: 'mdi:tag-multiple',
    label: 'shop.admin.categories',
  },
  {
    to: '/admin/shop/orders',
    icon: 'mdi:clipboard-list',
    label: 'shop.admin.orders',
  },
  {
    to: '/admin/shop/discount-codes',
    icon: 'mdi:ticket-percent',
    label: 'shop.admin.discountCodes',
  },
  {
    to: '/admin/shop/flight-packages',
    icon: 'mdi:clock-time-four',
    label: 'shop.admin.flightPackages',
  },
]

export default function ShopAdminDashboard() {
  const { t } = useTranslation()

  return (
    <Box>
      <Title label={t('shop.admin.title')} />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
        {sections.map((s) => (
          <Card key={s.to} sx={{ width: 200 }}>
            <CardActionArea component={Link} to={s.to}>
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <Icon icon={s.icon} width={40} />
                <Typography variant='subtitle1' sx={{ mt: 1 }}>
                  {t(s.label)}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    </Box>
  )
}
