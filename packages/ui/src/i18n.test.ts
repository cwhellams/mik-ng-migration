import { describe, expect, it } from 'vitest'

import i18n from './i18n'

/**
 * Regression guard for issue #1255: a defect description reading `U/S` came out
 * on screen as `U&#x2F;S`.
 *
 * i18next defaults `interpolation.escapeValue` to `true`, which HTML-escapes
 * every interpolated value. React then renders the result as *text*, so the
 * entities are printed literally rather than decoded. There are ~140
 * interpolation sites across the two apps; this one test covers the class,
 * which is why the fix is in i18n init rather than at the call sites.
 */
describe('i18n interpolation', () => {
  // The six characters i18next's default escaper rewrites.
  const nasty = `Pilot's seat / rudder pedal loose & noisy <check> "now"`

  it('interpolates values verbatim, without HTML-escaping them', () => {
    const result = i18n.t('aircraft.hil.openLogbook', {
      ajlbSeqNo: 12,
      description: nasty,
    })

    expect(result).toBe(`Open journey log book 12 — ${nasty}`)
  })

  it.each(['&#x2F;', '&#39;', '&amp;', '&lt;', '&gt;', '&quot;'])(
    'never emits the HTML entity %s',
    (entity) => {
      const result = i18n.t('aircraft.hil.openLogbook', {
        ajlbSeqNo: 1,
        description: nasty,
      })

      expect(result).not.toContain(entity)
    },
  )

  it('escapes nothing in any of the three languages', async () => {
    for (const lang of ['en', 'fi', 'sv'] as const) {
      await i18n.changeLanguage(lang)

      expect(
        i18n.t('aircraft.hil.extensionRow', {
          date: '01.01.2026',
          due: '01.02.2026',
          name: "Niko O'Brien",
        }),
      ).toContain("Niko O'Brien")
    }

    await i18n.changeLanguage('en')
  })
})
