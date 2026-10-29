// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '~/utils/markdown'

describe('renderMarkdown', () => {
  it('renders the allowed Markdown subset', () => {
    const html = renderMarkdown('# Заголовок\n\n**жирный** и *курсив*\n\n- пункт\n\n[ссылка](https://x.test)')
    expect(html).toContain('<h1>Заголовок</h1>')
    expect(html).toContain('<strong>жирный</strong>')
    expect(html).toContain('<em>курсив</em>')
    expect(html).toContain('<li>пункт</li>')
    expect(html).toContain('href="https://x.test"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
  it('disables raw HTML even for otherwise allowed tags', () => {
    expect(renderMarkdown('<strong>raw</strong>')).not.toContain('<strong>raw</strong>')
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror=alert(1)> текст')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
  })
  it.each(['javascript:alert(1)', 'data:text/html,evil', 'vbscript:evil', 'ftp://x.test', 'file:///etc/passwd'])('drops unsafe href %s', (href) => {
    expect(renderMarkdown(`[x](${href})`)).not.toContain('href=')
  })
  it.each(['../page', '/people', '#part', 'mailto:a@x.test', 'tel:+7000'])('retains safe href %s', (href) => {
    expect(renderMarkdown(`[x](${href})`)).toContain(`href="${href}"`)
  })
})
