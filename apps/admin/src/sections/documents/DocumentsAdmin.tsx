import { MIKPermissions } from '@mik/contracts/members'
import DocumentsPage from '@mik/ui/components/documents/DocumentsPage'
import { useRoles } from '@mik/ui/hooks/useRoles'

/**
 * The document library with upload, edit and delete switched on.
 *
 * The route already requires DOCUMENT_ADMIN; the check is repeated here because
 * `canManage` drives the controls themselves, and a page that renders an action
 * its holder cannot perform is worse than one that hides it.
 */
const DocumentsAdmin = () => {
  const { hasAccess } = useRoles()

  return <DocumentsPage canManage={hasAccess(MIKPermissions.DOCUMENT_ADMIN)} />
}

export default DocumentsAdmin
