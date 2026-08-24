import { screen, waitFor } from '@testing-library/react'
import type { Document } from '@mik/contracts/documents'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import DocumentsPage from './DocumentsPage'
import { auditFields } from '../../test/fixtures'
import { apiUrl } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { renderWithProviders } from '../../test/renderWithProviders'

const aDocument = (overrides: Partial<Document> = {}): Document => ({
  documentId: 1,
  title: 'Operations manual',
  description: 'How the club flies',
  category: 'policy',
  documentUrl: null,
  publishedDate: '2025-01-15',
  isPublic: true,
  isArchived: false,
  tags: ['ops'],
  fileName: 'ops.pdf',
  fileSize: 1024,
  mimeType: 'application/pdf',
  storageKey: 'documents/ops.pdf',
  ...auditFields(),
  ...overrides,
})

const documentsApi = (documents: Document[] = [aDocument()]) => {
  server.use(http.get(apiUrl('v1/documents'), () => HttpResponse.json({ documents })))
}

/**
 * `canManage` is the whole reason this page is shared rather than duplicated:
 * `apps/frontend` renders it read-only and `apps/admin` renders it with the
 * DOCUMENT_ADMIN check (#1233). The prop is a permission gate, so it is tested
 * from both sides rather than only the one that works.
 */
describe('DocumentsPage', () => {
  it('lists the documents members can read', async () => {
    documentsApi()

    renderWithProviders(<DocumentsPage />)

    expect(await screen.findByText('Operations manual')).toBeInTheDocument()
  })

  describe('without canManage — how apps/frontend renders it', () => {
    it('offers no way to add a document', async () => {
      documentsApi()

      renderWithProviders(<DocumentsPage />)

      await screen.findByText('Operations manual')
      expect(screen.queryByRole('button', { name: 'Add Document' })).not.toBeInTheDocument()
    })

    it('offers no way to edit or delete one', async () => {
      documentsApi()

      renderWithProviders(<DocumentsPage />)

      await screen.findByText('Operations manual')
      expect(screen.queryByTitle(/edit document/i)).not.toBeInTheDocument()
      expect(screen.queryByTitle(/delete document/i)).not.toBeInTheDocument()
    })

    it('defaults to read-only, so a caller that forgets the prop cannot leak the controls', async () => {
      // The member app renders `<DocumentsPage />` with no props at all; if the
      // default were `true` that would silently restore everything #1233 removed.
      documentsApi()

      renderWithProviders(<DocumentsPage />)

      await screen.findByText('Operations manual')
      expect(screen.queryByRole('button', { name: 'Add Document' })).not.toBeInTheDocument()
    })
  })

  describe('with canManage — how apps/admin renders it', () => {
    it('offers the add control', async () => {
      documentsApi()

      renderWithProviders(<DocumentsPage canManage />)

      await screen.findByText('Operations manual')
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add Document' })).toBeInTheDocument(),
      )
    })

    it('offers edit and delete on each row', async () => {
      documentsApi()

      renderWithProviders(<DocumentsPage canManage />)

      await screen.findByText('Operations manual')
      await waitFor(() => expect(screen.getByTitle(/edit document/i)).toBeInTheDocument())
      expect(screen.getByTitle(/delete document/i)).toBeInTheDocument()
    })
  })

  it('says so when there is nothing to show', async () => {
    documentsApi([])

    renderWithProviders(<DocumentsPage />)

    expect(await screen.findByText(/no documents available/i)).toBeInTheDocument()
  })
})
