import { describe, expect, it } from 'vitest'
import { markdownToPlainText } from '~/utils/plainText'

describe('markdownToPlainText', () => {
  it('drops markup, link targets and line breaks', () => {
    expect(markdownToPlainText('## Заголовок\n**жирный** [ссылка](https://x)')).toBe('Заголовок жирный ссылка')
  })
  it('joins paragraphs and list items with single spaces', () => {
    expect(markdownToPlainText('Первый\n\nвторой *абзац*\n\n- один\n- два\n\n> цитата')).toBe('Первый второй абзац один два цитата')
  })
  it('keeps code text, drops images and raw html, decodes entities', () => {
    expect(markdownToPlainText('`код` ![картинка](https://x/i.png) <b>тег</b> <script>x</script>')).not.toMatch(/https|<|script/)
    expect(markdownToPlainText('`код` и Tom & Jerry &amp; Co')).toBe('код и Tom & Jerry & Co')
  })
  it('returns an empty string for empty or markup-only input', () => {
    expect(markdownToPlainText('')).toBe('')
    expect(markdownToPlainText('---')).toBe('')
  })
  it('cuts long text on a word boundary with an ellipsis within the limit', () => {
    const text = markdownToPlainText('слово '.repeat(60), 140)
    expect(text.length).toBeLessThanOrEqual(140)
    expect(text.endsWith('слово…')).toBe(true)
  })
  it('does not cut text that fits and cuts a single long word hard', () => {
    expect(markdownToPlainText('коротко', 140)).toBe('коротко')
    const hard = markdownToPlainText('а'.repeat(300), 140)
    expect(hard.length).toBe(140)
    expect(hard.endsWith('…')).toBe(true)
  })
})
