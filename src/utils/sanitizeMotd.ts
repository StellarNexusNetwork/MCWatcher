const ALLOWED_TAGS = new Set(['span', 'br'])
const ALLOWED_STYLES = new Set(['color', 'font-weight'])

function sanitizeStyle(styleText: string) {
  const safeParts: string[] = []
  for (const part of styleText.split(';')) {
    const [rawKey, rawValue] = part.split(':')
    if (!rawKey || !rawValue) {
      continue
    }
    const key = rawKey.trim().toLowerCase()
    const value = rawValue.trim()
    if (!ALLOWED_STYLES.has(key)) {
      continue
    }
    if (key === 'font-weight' && !['bold', 'normal', '600', '700'].includes(value)) {
      continue
    }
    if (key === 'color' && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) {
      continue
    }
    safeParts.push(`${key}: ${value}`)
  }
  return safeParts.join('; ')
}

export function sanitizeMotdHtml(rawHtml: string, fallbackText: string) {
  if (!rawHtml) {
    return escapeHtmlToTextWithBr(fallbackText)
  }
  const parser = new DOMParser()
  const doc = parser.parseFromString(rawHtml, 'text/html')
  const root = doc.body

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  const elements: Element[] = []
  while (walker.nextNode()) {
    elements.push(walker.currentNode as Element)
  }

  for (const element of elements) {
    const tag = element.tagName.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) {
      const parent = element.parentNode
      if (!parent) {
        continue
      }
      while (element.firstChild) {
        parent.insertBefore(element.firstChild, element)
      }
      parent.removeChild(element)
      continue
    }

    const attrs = Array.from(element.attributes)
    for (const attr of attrs) {
      const name = attr.name.toLowerCase()
      if (name === 'style') {
        const safeStyle = sanitizeStyle(attr.value)
        if (safeStyle) {
          element.setAttribute('style', safeStyle)
        } else {
          element.removeAttribute('style')
        }
        continue
      }
      element.removeAttribute(attr.name)
    }
  }

  const html = root.innerHTML.trim()
  if (!html) {
    return escapeHtmlToTextWithBr(fallbackText)
  }
  return html
}

function escapeHtmlToTextWithBr(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br/>')
}
