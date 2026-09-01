import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { StatInfoButton } from './StatInfoButton'

describe('StatInfoButton', () => {
  it('renders closed by default', () => {
    renderWithProviders(
      <StatInfoButton
        titleKey='stats.info.aogStatistics.titles.monthly'
        summaryKey='stats.info.aogStatistics.summary'
        calculationKey='stats.info.aogStatistics.calculation'
      />,
    )

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the icon button is labelled with the translated title', () => {
    renderWithProviders(
      <StatInfoButton
        titleKey='stats.info.aogStatistics.titles.monthly'
        summaryKey='stats.info.aogStatistics.summary'
        calculationKey='stats.info.aogStatistics.calculation'
      />,
    )

    expect(screen.getByRole('button', { name: 'AOG Days per Month' })).toBeInTheDocument()
  })

  it('opens a dialog with the summary and calculation text on click', async () => {
    const { user } = renderWithProviders(
      <StatInfoButton
        titleKey='stats.info.aogStatistics.titles.monthly'
        summaryKey='stats.info.aogStatistics.summary'
        calculationKey='stats.info.aogStatistics.calculation'
      />,
    )

    await user.click(screen.getByRole('button', { name: 'AOG Days per Month' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('AOG Days per Month')).toBeInTheDocument()
    expect(
      screen.getByText(/How many days each aircraft was unavailable to fly/),
    ).toBeInTheDocument()
    expect(screen.getByText(/An aircraft counts as AOG/)).toBeInTheDocument()
  })

  it('renders no caveats list when none are given', async () => {
    const { user } = renderWithProviders(
      <StatInfoButton
        titleKey='stats.info.commercialFlightTime.title'
        summaryKey='stats.info.commercialFlightTime.summary'
        calculationKey='stats.info.commercialFlightTime.calculation'
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Commercial Flight Time' }))

    expect(screen.queryByRole('list')).toBeNull()
  })

  it('renders every caveat as a bullet when given', async () => {
    const { user } = renderWithProviders(
      <StatInfoButton
        titleKey='stats.info.aogStatistics.titles.monthly'
        summaryKey='stats.info.aogStatistics.summary'
        calculationKey='stats.info.aogStatistics.calculation'
        caveatKeys={[
          'stats.info.aogStatistics.caveats.holdItemList',
          'stats.info.aogStatistics.caveats.totalNotSum',
        ]}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'AOG Days per Month' }))

    expect(screen.getByText(/Hold Item List/)).toBeInTheDocument()
    expect(screen.getByText(/"total AOG days" figure/)).toBeInTheDocument()
  })

  it('closes when the close button is pressed', async () => {
    const { user } = renderWithProviders(
      <StatInfoButton
        titleKey='stats.info.aogStatistics.titles.monthly'
        summaryKey='stats.info.aogStatistics.summary'
        calculationKey='stats.info.aogStatistics.calculation'
      />,
    )

    await user.click(screen.getByRole('button', { name: 'AOG Days per Month' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
