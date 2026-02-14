import { describe, expect, it } from 'vitest'
import { sanitizeMotdHtml } from '@/utils/sanitizeMotd'

describe('sanitizeMotdHtml', () => {
  it('removes unsafe tags and attributes', () => {
    const html =
      '<span onclick="evil()" style="color:#55FF55;font-weight:bold;position:absolute">Hello</span><script>alert(1)</script>'
    const result = sanitizeMotdHtml(html, 'fallback')
    expect(result).toContain('color: #55FF55')
    expect(result).toContain('font-weight: bold')
    expect(result).not.toContain('onclick')
    expect(result).not.toContain('script')
    expect(result).not.toContain('position')
  })

  it('falls back to escaped text', () => {
    const result = sanitizeMotdHtml('', '<b>x</b>\nline')
    expect(result).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(result).toContain('<br/>')
  })
})
