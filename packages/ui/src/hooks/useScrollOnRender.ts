import { useCallback, useRef } from 'react'

export const useScrollOnRender = <T extends HTMLAnchorElement>() => {
  const done = useRef(false)

  return useCallback((node: T) => {
    if (node && !done.current) {
      node.scrollIntoView({
        block: 'center',
        behavior: 'instant',
      })
      done.current = true
    }
  }, [])
}
