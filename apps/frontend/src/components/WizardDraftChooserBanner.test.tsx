import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/renderWithProviders'
import { WizardDraftChooserBanner } from './WizardDraftChooserBanner'

const renderBanner = (overrides: Partial<Parameters<typeof WizardDraftChooserBanner>[0]> = {}) => {
  const onResumeMostRecent = vi.fn()
  const onStartFresh = vi.fn()
  const rendered = renderWithProviders(
    <WizardDraftChooserBanner
      title='Unfinished claim found'
      body='Another tab left a draft behind.'
      resumeLabel='Resume the newest'
      startFreshLabel='Start fresh'
      onResumeMostRecent={onResumeMostRecent}
      onStartFresh={onStartFresh}
      {...overrides}
    />,
  )
  return { ...rendered, onResumeMostRecent, onStartFresh }
}

describe('WizardDraftChooserBanner', () => {
  it('explains the situation', () => {
    renderBanner()

    expect(screen.getByText('Unfinished claim found')).toBeInTheDocument()
    expect(screen.getByText('Another tab left a draft behind.')).toBeInTheDocument()
  })

  it('offers exactly two ways out', () => {
    renderBanner()

    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('resumes the most recent draft', async () => {
    const { user, onResumeMostRecent, onStartFresh } = renderBanner()

    await user.click(screen.getByRole('button', { name: 'Resume the newest' }))

    expect(onResumeMostRecent).toHaveBeenCalledOnce()
    expect(onStartFresh).not.toHaveBeenCalled()
  })

  it('starts fresh', async () => {
    const { user, onResumeMostRecent, onStartFresh } = renderBanner()

    await user.click(screen.getByRole('button', { name: 'Start fresh' }))

    expect(onStartFresh).toHaveBeenCalledOnce()
    expect(onResumeMostRecent).not.toHaveBeenCalled()
  })
})
