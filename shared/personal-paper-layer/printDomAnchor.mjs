/*
 * Maps a stored text-anchor segment onto the paginated print DOM (the Paged.js
 * output of the fixed paper layout). DOM-only and framework-free so the paper
 * editing view and the server-side PDF composition resolve anchors the same
 * way.
 *
 * Matching ignores whitespace only: the print renderer and the source
 * projection agree on the visible characters but not on spacing around
 * labels, blanks and line joins. Any other difference returns null, so a mark
 * is never drawn over the wrong words.
 */

const SHOW_TEXT = 4
const ELEMENT_NODE = 1
const NON_TEXT_CONTENT = new Set(['svg', 'style', 'script', 'template'])
const WHITESPACE = /\s/u

function cssAttr(value) {
  return value.replace(/["\\]/gu, '\\$&')
}

function compact(text) {
  return text.replace(/\s+/gu, '')
}

function pagesRoot(doc) {
  return doc.querySelector('.pagedjs_pages') ?? doc.body
}

function uniqueInOrder(elements) {
  const kept = []
  for (const element of elements) {
    if (kept.some((other) => other === element || other.contains(element))) continue
    kept.push(element)
  }
  return kept
}

function within(scopes, selector) {
  return uniqueInOrder(scopes.flatMap((scope) => [...scope.querySelectorAll(selector)]))
}

function splitOptionLeafId(id) {
  const split = id.lastIndexOf(':')
  return split > 0 ? { questionId: id.slice(0, split), label: id.slice(split + 1) } : null
}

/*
 * Resolves the print elements carrying one leaf's text. Paged.js repeats a
 * split element on each page it spans, so a leaf may have several roots; they
 * are returned in document order.
 */
function leafRoots(root, scopes, leaf, leafText) {
  if (leaf.kind === 'paragraph') {
    const id = cssAttr(leaf.id)
    return within(scopes, `[data-canonical-paragraph-id="${id}"], [data-canonical-block-id="${id}"]`)
      .filter((element) => !['table', 'figure', 'framed_columns'].includes(
        element.getAttribute('data-canonical-block-kind') ?? '',
      ))
      .map((element) => ({ element, skip: [] }))
  }
  if (leaf.kind === 'table-cell') {
    return within(scopes, `[data-canonical-cell-id="${cssAttr(leaf.id)}"]`)
      .map((element) => ({ element, skip: [] }))
  }
  if (leaf.kind === 'figure-caption') {
    return within(scopes, `[data-canonical-block-id="${cssAttr(leaf.id)}"] figcaption`)
      .map((element) => ({ element, skip: [] }))
  }
  if (leaf.kind === 'question-stem') {
    // Blank markers inside passages also carry data-canonical-question-id;
    // only the question block owns the stem.
    return within(scopes, `.question[data-canonical-question-id="${cssAttr(leaf.id)}"] > p.stem`)
      .map((element) => ({ element, skip: [...element.querySelectorAll('.qnum')] }))
  }
  if (leaf.kind === 'option') {
    const parts = splitOptionLeafId(leaf.id)
    if (!parts) return []
    const marker = `${parts.label}.`
    // Option markup differs by family (option-id spans, cloze choice rows,
    // figure options); what they share is a label child reading "A.".
    const questions = within(scopes, `.question[data-canonical-question-id="${cssAttr(parts.questionId)}"]`)
    const labelled = questions.flatMap((question) => [...question.querySelectorAll('*')].filter((element) => (
      element.firstElementChild
      && compact(element.firstElementChild.textContent ?? '') === marker
      && compact(element.textContent ?? '').startsWith(marker)
    )))
    const withIds = labelled.filter((element) => element.hasAttribute('data-canonical-option-id'))
    const chosen = withIds.length > 0
      ? withIds
      : labelled.filter((element) => !labelled.some((other) => other !== element && element.contains(other)))
    if (chosen.length === 0) {
      // Listening options render "A. text" as one text node.
      return questions
        .flatMap((question) => [...question.querySelectorAll('[data-canonical-option-id]')])
        .filter((element) => compact(element.textContent ?? '').startsWith(marker))
        .map((element) => ({ element, skip: [] }))
    }
    return chosen.map((element) => ({ element, skip: [element.firstElementChild] }))
  }
  if (leaf.kind === 'option-bank') {
    const marker = `${leaf.id}.`
    return within(scopes, '.canonical-option-bank-item')
      .filter((item) => compact(item.querySelector('.canonical-option-bank-label')?.textContent ?? '') === marker)
      .map((item) => item.querySelector('.canonical-option-bank-text'))
      .filter(Boolean)
      .map((element) => ({ element, skip: [] }))
  }
  if (leaf.kind === 'instruction') {
    // Instruction headings carry no id in print; accept only one exact,
    // innermost text match.
    const wanted = compact(leafText)
    if (!wanted) return []
    const matches = [...root.querySelectorAll('*')].filter((element) => (
      !NON_TEXT_CONTENT.has(element.localName)
      && compact(element.textContent ?? '') === wanted
      && ![...element.children].some((child) => compact(child.textContent ?? '') === wanted)
    ))
    return matches.length === 1 ? [{ element: matches[0], skip: [] }] : []
  }
  return []
}

function isSkipped(node, rootElement, skip) {
  for (let current = node.parentNode; current && current !== rootElement; current = current.parentNode) {
    if (current.nodeType !== ELEMENT_NODE) continue
    if (NON_TEXT_CONTENT.has(current.localName) || skip.includes(current)) return true
  }
  return false
}

// Visible, non-whitespace characters of the roots with their DOM positions.
function glyphs(doc, roots) {
  const out = []
  for (const { element, skip } of roots) {
    const walker = doc.createTreeWalker(element, SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (isSkipped(node, element, skip)) continue
      const data = node.data
      for (let offset = 0; offset < data.length; offset += 1) {
        if (!WHITESPACE.test(data[offset])) out.push({ node, offset, char: data[offset] })
      }
    }
  }
  return out
}

function countGlyphs(text, end) {
  let count = 0
  for (let index = 0; index < end; index += 1) {
    if (!WHITESPACE.test(text[index])) count += 1
  }
  return count
}

function groupScopes(root, groupId) {
  if (!groupId) return [root]
  return [...root.querySelectorAll(`[data-canonical-group-id="${cssAttr(groupId)}"]`)]
}

export function printSegmentToDomRanges(doc, source, segment) {
  const stream = source.streams.find((item) => item.streamId === segment.streamId)
  if (!stream) return null
  const root = pagesRoot(doc)
  if (!root) return null
  const scopes = groupScopes(root, stream.groupId)
  if (scopes.length === 0) return null
  const ranges = []
  for (const leaf of stream.leaves) {
    if (leaf.end <= segment.start || leaf.start >= segment.end) continue
    const leafText = stream.text.slice(leaf.start, leaf.end)
    const roots = leafRoots(root, scopes, leaf, leafText)
    if (roots.length === 0) return null
    const domGlyphs = glyphs(doc, roots)
    const domText = domGlyphs.map((glyph) => glyph.char).join('')
    const wanted = compact(leafText)
    // Listening options keep the label in the same text node, so the leaf may
    // sit after a prefix; it must still be the only occurrence.
    const base = domText.indexOf(wanted)
    if (base < 0 || domText.indexOf(wanted, base + 1) >= 0) return null
    const from = base + countGlyphs(leafText, Math.max(segment.start, leaf.start) - leaf.start)
    const to = base + countGlyphs(leafText, Math.min(segment.end, leaf.end) - leaf.start)
    if (to <= from) continue
    const first = domGlyphs[from]
    const last = domGlyphs[to - 1]
    const range = doc.createRange()
    range.setStart(first.node, first.offset)
    range.setEnd(last.node, last.offset + 1)
    ranges.push(range)
  }
  if (ranges.length === 0) return null
  const drawn = compact(ranges.map((range) => range.toString()).join(''))
  if (drawn !== compact(stream.text.slice(segment.start, segment.end))) return null
  return ranges
}
