/** Self-contained for Locator.evaluateAll; null measures words of any length. */
export function measureWordWrapping(elements: Element[], maximumWordLength: number | null) {
  return elements.map((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const words: { text: string, lineTops: number[] }[] = []
    let node: Node | null
    while ((node = walker.nextNode())) {
      for (const word of (node.textContent ?? '').matchAll(/\p{L}[\p{L}\p{M}]*/gu)) {
        if (maximumWordLength !== null && word[0].length > maximumWordLength) continue
        const range = document.createRange()
        range.setStart(node, word.index!)
        range.setEnd(node, word.index! + word[0].length)
        words.push({ text: word[0], lineTops: Array.from(new Set(Array.from(range.getClientRects(), rect => Math.round(rect.top)))) })
      }
    }
    return { words, broken: words.filter(word => word.lineTops.length > 1).map(word => word.text) }
  })
}
