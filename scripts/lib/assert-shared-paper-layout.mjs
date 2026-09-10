import assert from 'node:assert/strict'

// Mutate the loaded shared rule itself, never a new high-specificity override.
// This catches a consumer that imports the file but shadows its declarations.
export async function assertSharedPaperLayout(page, rootSelector, required = []) {
  const headingNumbers = await page.locator(`${rootSelector} [data-canonical-section-heading-numeric-run]`)
    .evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element)
      return { text: element.textContent, offsetEm: parseFloat(style.top) / parseFloat(style.fontSize) }
    }))
  if (required.includes('seven')) assert.ok(headingNumbers.length >= 3, 'missing numeric heading coverage')
  for (const number of headingNumbers) {
    // Golden references use natural inline placement, not matching ink bottoms.
    assert.equal(number.offsetEm, 0,
      `${rootSelector}: heading numeric baseline drift ${JSON.stringify(number)}`)
  }
  const inlineNumbers = await page.locator(`${rootSelector} :is(.ps-question-no, .qnum, .ps-paper-blank, .print-blank-num)`)
    .evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element)
      return { text: element.textContent, top: style.top, transform: style.transform, verticalAlign: style.verticalAlign }
    }))
  if (required.includes('seven')) assert.ok(inlineNumbers.length >= 5, 'missing question/blank numeral coverage')
  for (const number of inlineNumbers) {
    assert.ok(number.top === 'auto' || parseFloat(number.top) === 0,
      `${rootSelector}: shifted question/blank numeral ${JSON.stringify(number)}`)
    assert.equal(number.transform, 'none', `${rootSelector}: transformed numeral ${number.text}`)
    assert.equal(number.verticalAlign, 'baseline', `${rootSelector}: non-baseline numeral ${number.text}`)
  }
  if (required.includes('seven')) {
    const blanks = await page.locator(`${rootSelector} [data-canonical-seven-choices-rhythm-role="inline_blank_marker"]`)
      .evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(element.querySelector('.print-blank-num') || element)
        const number = range.getBoundingClientRect()
        return {
          id: element.getAttribute('data-canonical-blank-id'),
          fragments: element.getClientRects().length,
          lineHeight: parseFloat(getComputedStyle(element.closest('p')).lineHeight)
            * (box.height / element.offsetHeight),
          height: box.height,
          numberInside: number.left >= box.left - 1 && number.right <= box.right + 1,
          residue: element.closest('p')?.textContent.includes('___') || false,
        }
      }))
    assert.equal(blanks.length, 5, `${rootSelector}: five complete Seven Choices blanks`)
    assert.equal(new Set(blanks.map(blank => blank.id)).size, 5)
    for (const blank of blanks) {
      assert.equal(blank.residue, false, `${rootSelector}: literal blank residue ${blank.id}`)
      assert.equal(blank.fragments, 1, `${rootSelector}: split blank ${blank.id}`)
      assert.ok(blank.numberInside && blank.height <= blank.lineHeight + 2, `${rootSelector}: blank exceeds its line ${JSON.stringify(blank)}`)
    }
  }
  const probes = [
    ['seven', 'data-canonical-seven-choices-rhythm-role="passage_body_line"', 'line-height', '37px'],
    ['cloze', 'data-canonical-cloze-rhythm-role="passage_body_line"', 'line-height', '39px'],
    ['grammar', 'data-canonical-grammar-fill-rhythm-role="passage_body_line"', 'line-height', '41px'],
    ['bank', '.ps-option-bank,', 'flex-direction', 'row-reverse'],
    // Cloze intentionally wraps inside label/text cells; Reading owns nowrap.
    ['options', '.ps-option-list--four_columns', 'white-space', 'pre', '[data-canonical-group-type="reading"] *'],
    ['cloze-cell', '.ps-question-options-inline--four_columns .ps-question-options-inline-item', 'align-items', 'center'],
    ['listening', 'three_columns', 'display', 'block'],
    ['part', '.paper-browse-part-heading', 'font-weight', '500'],
    ['section', '.paper-browse-section-heading', 'white-space', 'pre-wrap'],
    ['application', '.pi-writing-answer-box--application', 'flex-direction', 'column-reverse'],
    ['continuation', '.pi-writing-answer-box--continuation .pi-writing-answer-top', 'grid-template-rows', '37px 43px'],
  ]
  const results = await page.evaluate(({ rootSelector, probes }) => {
    const root = document.querySelector(rootSelector)
    if (!root) throw new Error(`Missing layout root ${rootSelector}`)
    // Check flow before pagination: Paged.js legitimately resets margins on
    // split fragments. A broad canonical rule must not erase original spacing.
    for (const el of root.matches('.pagedjs_pages') ? [] : root.querySelectorAll('.ps-section[data-canonical-group-type="reading"], .canonical-listening-surface .ps-section, .question-group[data-canonical-group-type="listening"]')) {
      const style = getComputedStyle(el)
      const expected = el.matches('.question-group') ? parseFloat(style.fontSize)
        : el.matches(':last-child') ? 0 : 26
      if (Math.abs(parseFloat(style.marginBottom) - expected) > 0.1) {
        throw new Error(`Non-target group spacing changed: ${el.className}: ${style.marginBottom}, expected ${expected}px`)
      }
    }
    const rules = []
    const collect = list => {
      for (const rule of list) {
        if (rule.selectorText) rules.push(rule)
        if (rule.cssRules) collect(rule.cssRules)
        if (rule.styleSheet) collect(rule.styleSheet.cssRules)
      }
    }
    for (const sheet of document.styleSheets) collect(sheet.cssRules)
    return probes.map(([name, marker, property, value, target]) => {
      const candidates = rules.filter(rule => rule.selectorText.includes(':is(')
        && rule.selectorText.includes(marker) && rule.style.getPropertyValue(property))
      const elements = [...new Set(candidates.flatMap(rule => [...root.querySelectorAll(rule.selectorText)]))]
        .filter(el => !target || el.matches(target))
      if (!elements.length) return { name, count: 0 }
      const saved = candidates.map(rule => [rule, rule.style.getPropertyValue(property), rule.style.getPropertyPriority(property)])
      const before = elements.map(el => getComputedStyle(el).getPropertyValue(property))
      try {
        for (const rule of candidates) rule.style.setProperty(property, value)
        return { name, count: elements.length, before, expected: value,
          actual: elements.map(el => getComputedStyle(el).getPropertyValue(property)) }
      } finally {
        for (const [rule, original, priority] of saved) rule.style.setProperty(property, original, priority)
      }
    })
  }, { rootSelector, probes })
  for (const result of results) {
    if (required.includes(result.name)) assert.ok(result.count, `${rootSelector}: missing ${result.name} coverage`)
    if (!result.count) continue
    assert.ok(result.before.some(value => value !== result.expected), `${result.name}: mutation must change layout`)
    assert.ok(result.actual.every(value => value === result.expected), `${rootSelector} ${result.name}: shared mutation shadowed: ${JSON.stringify(result)}`)
  }
  return results.map(({ name, count }) => ({ name, count }))
}

export async function assertWritingBoxesInsidePages(page) {
  const boxes = await page.locator('.pagedjs_pages .writing-answer-box').evaluateAll(elements => elements.map(el => {
    const box = el.getBoundingClientRect()
    const area = el.closest('.pagedjs_page').querySelector('.pagedjs_area').getBoundingClientRect()
    return { top: box.top - area.top, bottom: box.bottom - area.bottom, height: box.height }
  }))
  for (const box of boxes) {
    assert.ok(box.height > 0 && box.top >= -1 && box.bottom <= 1, `writing response clipped at page boundary: ${JSON.stringify(box)}`)
  }
  return boxes.length
}
