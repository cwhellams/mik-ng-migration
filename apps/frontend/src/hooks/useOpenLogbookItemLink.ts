import { useNavigate } from 'react-router'
import useApi from './useApi'

interface LogbookItemRef {
  ajlbSeqNo: number
  flightMins: number
}

/**
 * Shared by useOpenDefectLink/useOpenNoteLink: items can be recorded far
 * earlier than the logbook's current page, so this resolves the page that
 * actually contains the item instead of landing on the default last one,
 * then navigates there with it highlighted via `highlightParam`. Passing
 * itemType lets the backend resolve an own-row (rows > 0) item's exact page
 * from its physical-row placement instead of approximating from flightMins,
 * which can't account for rows earlier items on the page have consumed.
 */
export const useOpenLogbookItemLink = (
  aircraftRegistration: string,
  highlightParam: string,
  itemType: 'note' | 'defect',
) => {
  const navigate = useNavigate()

  const { fetch: fetchPage } = useApi<{ page: number | undefined }>({
    url: 'v1/flight-logs/page-for-mins',
    skipFetch: true,
  })

  return async (item: LogbookItemRef, id: string) => {
    const { data } = await fetchPage.trigger('GET', {
      aircraftRegistration,
      ajlbSeqNo: item.ajlbSeqNo,
      flightMins: item.flightMins,
      itemType,
      itemId: id,
    })
    const query = new URLSearchParams({
      ...(data?.page !== undefined ? { page: String(data.page) } : {}),
      [highlightParam]: id,
    })
    navigate(`/logs/books/${aircraftRegistration}/${item.ajlbSeqNo}?${query}`)
  }
}
