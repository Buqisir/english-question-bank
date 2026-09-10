import assert from 'node:assert/strict'

// Inspect the actual glyph provider, not merely the requested CSS family.
export async function assertPaperFonts(page, selector) {
  await page.evaluate(() => document.fonts.ready)
  const count = await page.locator(selector).evaluateAll(roots => {
    const elements = new Set(roots.flatMap(root => [root, ...root.querySelectorAll('*')]))
    let index = 0
    for (const element of elements) {
      if (!element.getClientRects().length || ![...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue
      if (element.closest('button, [role="button"]')) continue
      element.setAttribute('data-font-probe', String(index++))
    }
    return index
  })
  assert.ok(count > 0, `no paper text in ${selector}`)
  const cdp = await page.context().newCDPSession(page)
  const used = new Set()
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument')
    for (let index = 0; index < count; index++) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-font-probe="${index}"]` })
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      for (const font of fonts) {
        assert.ok(font.isCustomFont && /^(TeXGyreTermes-|SourceHanSerifCN-)/.test(font.postScriptName),
          `Unexpected paper font: ${JSON.stringify(font)}`)
        used.add(font.postScriptName)
      }
    }
    assert.ok(used.size > 0)
    return { textElements: count, fonts: [...used].sort() }
  } finally {
    await cdp.detach()
    await page.locator('[data-font-probe]').evaluateAll(elements => elements.forEach(element => element.removeAttribute('data-font-probe')))
  }
}
