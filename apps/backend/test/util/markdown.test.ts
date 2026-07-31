import { describe, expect, it } from '@jest/globals'

import { renderMarkdown } from '../../src/util/markdown.ts'

describe('markdown', () => {
  describe('renderMarkdown', () => {
    it('renders basic gfm formatting', () => {
      const html = renderMarkdown('# Title\n\n**bold** and a list:\n\n- one\n- two')

      expect(html).toContain('<h1>Title</h1>')
      expect(html).toContain('<strong>bold</strong>')
      expect(html).toContain('<li>one</li>')
      expect(html).toContain('<li>two</li>')
    })

    it('escapes raw HTML tags instead of passing them through', () => {
      const html = renderMarkdown('<script>alert("xss")</script>')

      expect(html).not.toContain('<script>')
      expect(html.toLowerCase()).not.toContain('<script')
    })

    it('strips javascript: and data: link hrefs', () => {
      const html = renderMarkdown('[click me](javascript:alert(1))')

      expect(html).not.toContain('javascript:')
    })

    it('strips unsafe image src values', () => {
      const html = renderMarkdown('![alt](javascript:alert(1))')

      expect(html).not.toContain('javascript:')
    })

    it('escapes image alt text instead of allowing attribute breakout', () => {
      const html = renderMarkdown('![alt" onerror="alert(1)](http://example.com/x.png)')

      expect(html).not.toContain('" onerror="alert(1)')
      expect(html).toContain('<img')
    })

    it('renders safe links with target=_blank and rel=noopener', () => {
      const html = renderMarkdown('[example](https://example.com)')

      expect(html).toContain('target="_blank"')
      expect(html).toContain('rel="noopener noreferrer"')
    })

    it('returns empty string for empty input', () => {
      expect(renderMarkdown('')).toBe('')
    })
  })
})
