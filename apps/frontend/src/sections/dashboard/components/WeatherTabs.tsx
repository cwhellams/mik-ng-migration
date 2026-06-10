import { useState } from 'react'
import { Box, Tab, Tabs } from '@mui/material'
import { WeatherWidget } from './WeatherWidget'

const WEATHER_TAB_STORAGE_KEY = 'weatherWidget.selectedTab'

export const WeatherTabs = () => {
  const [selectedTab, setSelectedTab] = useState(() => {
    const stored = localStorage.getItem(WEATHER_TAB_STORAGE_KEY)
    return stored === '1' ? 1 : 0
  })

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue)
    localStorage.setItem(WEATHER_TAB_STORAGE_KEY, String(newValue))
  }

  return (
    <Box>
      <Tabs
        value={selectedTab}
        onChange={handleTabChange}
        sx={{ mb: 1 }}
        aria-label='Weather station tabs'
      >
        <Tab label='EFNU' />
        <Tab label='EFHK' />
      </Tabs>
      {selectedTab === 0 && <WeatherWidget site='efnu' />}
      {selectedTab === 1 && <WeatherWidget site='efhk' />}
    </Box>
  )
}
