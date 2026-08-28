import { describe, expect, it } from '@jest/globals'

import { deviceLabel, UNKNOWN_DEVICE } from '../../src/util/deviceLabel.ts'

describe('deviceLabel', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Chrome on Windows',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      'Mobile Safari on iPhone',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0', 'Firefox on Linux'],
  ])('names the browser and where it is running: %s', (userAgent, expected) => {
    expect(deviceLabel(userAgent)).toBe(expected)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
  ])('falls back for a %s user agent', (_name, userAgent) => {
    expect(deviceLabel(userAgent)).toBe(UNKNOWN_DEVICE)
  })

  it('falls back rather than rendering an empty label for a user agent it cannot parse', () => {
    // A blank cell in the sessions list reads as a bug; "Unknown device" reads
    // as the absence it actually is.
    expect(deviceLabel('!!!')).toBe(UNKNOWN_DEVICE)
  })

  it('names the browser alone when the platform is unrecognisable', () => {
    // No trailing " on " -- the label is built from the parts that are actually
    // there rather than from a fixed template with holes in it.
    expect(deviceLabel('Mozilla/5.0 Firefox/133.0')).toBe('Firefox')
  })

  it('falls back for a non-browser client the parser knows nothing about', () => {
    // curl, monitoring probes and API clients parse to nothing at all. They can
    // hold a session like anything else, and must still get a readable row.
    expect(deviceLabel('curl/8.5.0')).toBe(UNKNOWN_DEVICE)
  })
})
