import useApi from '@mik/ui/hooks/useApi'
import { RemoteContent } from '@mik/ui/components/RemoteContent'
import type { InventoryAuditLogEntry } from '@mik/contracts/inventory'

import { InventoryAuditLog } from './InventoryAuditLog'

/**
 * Loads one item's audit trail. Split from the table so the request is made
 * when the dialog opens rather than once per row on every render.
 */
export const InventoryItemHistory = ({ itemId }: { itemId: string }) => {
  const { data, isLoading, error } = useApi<{ auditLog?: InventoryAuditLogEntry[] }>({
    url: `v1/inventory/items/${itemId}`,
  })

  return (
    <RemoteContent isLoading={isLoading} error={error}>
      <InventoryAuditLog entries={data?.auditLog ?? []} />
    </RemoteContent>
  )
}
