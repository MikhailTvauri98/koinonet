import DOMPurify from 'dompurify'
import { Marked } from 'marked'

// Raw HTML never enters the rendered document, including otherwise allowed tags.
const markdown = new Marked({ gfm: true, breaks: true, renderer: { html: () => '' } })
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

export function renderMarkdown(value: string): string {
  return DOMPurify.sanitize(markdown.parse(value, { async: false }), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    // HTTP(S), mail, telephone and relative references; no other URI schemes.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  })
}
