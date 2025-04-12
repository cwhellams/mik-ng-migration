import { ReactNode } from 'react'

export interface MenuItem {
  label: string
  path: string
  translationKey: string
  icon?: ReactNode
}

export const menuItems: MenuItem[] = [
  {
    label: 'Dashboard',
    path: '/',
    translationKey: 'header.dashboard',
  },
  {
    label: 'Schedule',
    path: '/schedule',
    translationKey: 'header.schedule',
  },
  {
    label: 'Aircraft',
    path: '/aircrafts',
    translationKey: 'header.aircrafts',
  },
  {
    label: 'Members',
    path: '/members',
    translationKey: 'header.members',
  },
]
