import DocumentsPage from '@mik/ui/components/documents/DocumentsPage'

/**
 * The club's document library, read-only.
 *
 * Uploading, editing and deleting moved to the admin app in #1233. The page
 * itself is shared (`@mik/ui`) so both apps show members the same library; this
 * app simply has no way to turn the management controls on — `canManage`
 * defaults to false and nothing here passes it.
 */
const Documents = () => <DocumentsPage />

export default Documents
