declare module 'react-big-calendar/lib/utils/layout-algorithms/no-overlap' {
  export interface NoOverlapLayoutItem<TEvent = object> {
    event: TEvent
    style: import('react').CSSProperties
    size?: number
    [key: string]: unknown
  }

  export type NoOverlapParams = Record<string, unknown>

  const noOverlap: <TEvent = object>(
    params: NoOverlapParams
  ) => NoOverlapLayoutItem<TEvent>[]
  export default noOverlap
}
