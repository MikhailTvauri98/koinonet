import { Lexer, type Token } from 'marked'

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'' }

// Текст без разметки; HTML, картинки и адреса ссылок не попадают: у ссылки остаётся её подпись.
function collect(tokens: Token[] | undefined, out: string[]) {
  for (const token of tokens ?? []) {
    switch (token.type) {
      case 'html': case 'image': case 'hr': case 'space': break
      case 'br': out.push(' '); break
      case 'list': for (const item of token.items) { collect(item.tokens, out); out.push(' ') } break
      case 'table': for (const cell of [...token.header, ...token.rows.flat()]) { collect(cell.tokens, out); out.push(' ') } break
      default: {
        const children = (token as { tokens?: Token[] }).tokens
        if (children) collect(children, out)
        else if ('text' in token && typeof token.text === 'string') out.push(token.text)
        if (['paragraph', 'heading', 'blockquote', 'code'].includes(token.type)) out.push(' ')
      }
    }
  }
}

/** Markdown объявления в одну строку обычного текста; обрезка по слову с «…», итог не длиннее maxLength. */
export function markdownToPlainText(markdown: string, maxLength = 140): string {
  const out: string[] = []
  collect(new Lexer({ gfm: true, breaks: true }).lex(markdown), out)
  const text = out.join('').replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ENTITIES[entity]!).replace(/\s+/gu, ' ').trim()
  if (text.length <= maxLength) return text
  const room = Array.from(text).slice(0, maxLength - 1).join('')
  const boundary = /\s/u.test(text.charAt(room.length)) ? room.length : room.search(/\s\S*$/u)
  return `${(boundary > 0 ? room.slice(0, boundary) : room).trimEnd()}…`
}
