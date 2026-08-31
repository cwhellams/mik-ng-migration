import UAParser from 'ua-parser-js'

/**
 * Turn a raw User-Agent header into something a member can recognise in a list
 * of their own sessions -- 'Chrome on Windows', 'Safari on iPhone'.
 *
 * Derived at serialization time and never stored (#1234). Two reasons: improving
 * the parser then retroactively improves every old row, and the raw header stays
 * in the database for support and debugging, which a pre-baked label would have
 * thrown away.
 */
export const UNKNOWN_DEVICE = 'Unknown device'

export const deviceLabel = (userAgent: string | null | undefined): string => {
  if (!userAgent) {
    return UNKNOWN_DEVICE
  }

  const { browser, os, device } = new UAParser(userAgent).getResult()

  // Prefer the concrete device over the OS when the UA names one: 'Safari on
  // iPhone' places a session better than 'Safari on iOS'. Desktops report no
  // device model at all, which is why the OS is the fallback and not the other
  // way round.
  const platform = device.model ?? os.name
  const parts = [browser.name, platform].filter(Boolean)

  // A UA that parses to nothing at all -- curl, a scanner, a stripped proxy --
  // must not render as an empty string, which reads as a bug rather than as an
  // absence.
  return parts.length === 0 ? UNKNOWN_DEVICE : parts.join(' on ')
}
