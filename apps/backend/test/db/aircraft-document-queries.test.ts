import {
  addAircraftDocument,
  getAllAircraftDocuments,
  removeAircraftDocument,
  updateAircraftDocument,
} from '../../src/db/aircraft-document-queries.ts'
import type { JWTUser } from '../../src/routes/auth/token.ts'

const jwt: JWTUser = {
  memberId: 'k1mnimda',
  email: 'loggedinuser',
  permissions: [],
}

describe('Db document tests', () => {
  const expectSnapshottedDocument = async (documentId: number) => {
    const result = await getAllAircraftDocuments({ documentId: documentId })
    expect(result[0]).toMatchSnapshot({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
  }

  it('add document and update document', async () => {
    const doc = await addAircraftDocument(
      {
        aircraftRegistration: 'OH-STL',
        validFrom: '2023-10-01',
        documentType: 'Insurance Certificate',
        validTo: '2023-10-01',
        title: 'Test document',
        isActive: true,
        fileName: 'test.pdf',
      },
      jwt,
    )
    await expectSnapshottedDocument(doc.documentId!)

    const updated = await updateAircraftDocument(
      doc.documentId!,
      {
        validFrom: '2023-10-02',
        validTo: '2023-10-02',
        documentType: 'ARC',
        title: 'Test document 2',
        isActive: true,
      },
      jwt,
    )
    expect(updated).toEqual(true)
    await expectSnapshottedDocument(doc.documentId!)

    const deleted = await removeAircraftDocument(doc.documentId!)
    expect(deleted).toEqual(true)
  })

  it('add document for unknown plane fails', async () => {
    await expect(async () =>
      addAircraftDocument(
        {
          aircraftRegistration: 'OH-UFO',
          validFrom: '2023-10-01',
          validTo: '2023-10-01',
          documentType: 'Insurance Certificate',
          title: 'Test document',
          isActive: true,
          fileName: 'test.pdf',
        },
        jwt,
      ),
    ).rejects.toThrow(
      'insert or update on table \"aircraft_documents_files\" violates foreign key constraint \"aircraft_documents_files_aircraft_registration_fkey\"',
    )
  })
})
