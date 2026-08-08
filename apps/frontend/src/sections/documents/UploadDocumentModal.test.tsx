import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { apiUrl, problemResponse } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'
import UploadDocumentModal from './UploadDocumentModal'

/**
 * Regression cover for issue #1132 §1: `useApi`'s `trigger` resolves with
 * `{ error }` rather than throwing, so the `catch` here was unreachable and a
 * rejected upload called `onSuccess()` and closed the dialog — the member was
 * told their document had been stored when it had not.
 */
const uploads = () => {
  const posted: string[] = []
  server.use(
    http.post(apiUrl('v1/documents'), async ({ request }) => {
      posted.push(await request.text())
      return HttpResponse.json({ documentId: 1 })
    }),
  )
  return posted
}

const renderModal = () => {
  const onSuccess = vi.fn()
  const onClose = vi.fn()
  const rendered = renderWithProviders(
    <UploadDocumentModal open onClose={onClose} onSuccess={onSuccess} />,
  )
  return { ...rendered, onSuccess, onClose }
}

/** Supplies the three things the upload button waits for: file, title, category. */
const fillForm = async (user: ReturnType<typeof renderWithProviders>['user']) => {
  const file = new File(['%PDF-1.4'], 'minutes.pdf', { type: 'application/pdf' })
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await user.upload(input, file)

  await user.type(screen.getByRole('textbox', { name: /Title/ }), 'Board minutes')

  // MUI Selects take their accessible name from the selected value, not the
  // InputLabel, so the category picker is reached by position — it is the first
  // of the dialog's two selects.
  await user.click(screen.getAllByRole('combobox')[0])
  await user.click((await screen.findAllByRole('option'))[0])
}

const submit = async (user: ReturnType<typeof renderWithProviders>['user']) => {
  const button = screen.getByRole('button', { name: /Upload Document/ })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
}

describe('UploadDocumentModal', () => {
  it('uploads the document and reports success', async () => {
    const posted = uploads()

    const { user, onSuccess, onClose } = renderModal()
    await fillForm(user)
    await submit(user)

    await waitFor(() => expect(posted).toHaveLength(1))
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalled()
  })

  it('does not claim success when the upload is rejected', async () => {
    server.use(http.post(apiUrl('v1/documents'), () => problemResponse(413, 'File too large')))

    const { user, onSuccess, onClose } = renderModal()
    await fillForm(user)
    await submit(user)

    expect(await screen.findByText('File too large')).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps the dialog open so the upload can be retried', async () => {
    server.use(http.post(apiUrl('v1/documents'), () => problemResponse(500, 'Storage unavailable')))

    const { user } = renderModal()
    await fillForm(user)
    await submit(user)

    await screen.findByText('Storage unavailable')
    // Still on screen and still submittable, so the member can simply try again.
    expect(screen.getByRole('button', { name: /Upload Document/ })).toBeEnabled()
  })

  it('falls back to a generic message when the problem carries no detail', async () => {
    server.use(
      http.post(apiUrl('v1/documents'), () => HttpResponse.json({ status: 500 }, { status: 500 })),
    )

    const { user, onSuccess } = renderModal()
    await fillForm(user)
    await submit(user)

    expect(
      await screen.findByText('Failed to upload document. Please try again.'),
    ).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
