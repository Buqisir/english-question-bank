#!/usr/bin/env node
// Trial checker for the continuation V3 candidate prompt.
// Usage: node check.mjs <paper-asset-dir> <output.json> [--v2]
//   <paper-asset-dir> holds latest/paper-asset.json with the continuation task.
//   Without --v2 the file is a V3 object; with --v2 it is the V2 staged package
//   ({ modelAnswer, ... }) and only the essay measurements are reported.
// Failures are the hard constraints in section 三 of the prompt; everything
// else is a warning, so the prompt stays open.

import { readFileSync } from 'node:fs'
import path from 'node:path'

const [assetDir, outputPath, flag] = process.argv.slice(2)
const asset = JSON.parse(readFileSync(path.join(assetDir, 'latest/paper-asset.json'), 'utf8'))
const task = Object.values(asset.content.writingTasks).find((item) => item.taskType === 'continuation')
const material = task.materialText
const starters = task.continuationStarters

const words = (text) => text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []
const norm = (text) => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
const syllables = (word) => {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  let n = (w.match(/[aeiouy]+/g) || []).length
  if (w.endsWith('e') && n > 1 && !w.endsWith('le')) n -= 1
  return Math.max(1, n)
}
const readability = (text) => {
  const list = words(text)
  const sentences = text.split(/(?<=[.!?])["”’]?\s+/).filter((s) => s.trim()).length
  const syl = list.reduce((sum, w) => sum + syllables(w), 0)
  return {
    fk: +(0.39 * list.length / sentences + 11.8 * syl / list.length - 15.59).toFixed(1),
    wordsPerSentence: +(list.length / sentences).toFixed(1),
  }
}
// Share of words inside quotation marks, in percent. Quoted signs or notes count
// too, so this slightly overstates direct speech.
const quoteShare = (text) => {
  const all = words(text).length
  const quoted = (norm(text).match(/"[^"]*"/g) || []).reduce((sum, q) => sum + words(q).length, 0)
  return all ? Math.round(100 * quoted / all) : 0
}
const sourceQuoteShare = quoteShare(material)
const starterWords = starters.map((s) => words(s).length)
const sourceGrams = new Set()
{
  const tokens = words(material).map((w) => w.toLowerCase())
  for (let i = 0; i + 8 <= tokens.length; i += 1) sourceGrams.add(tokens.slice(i, i + 8).join(' '))
}

function measureEssay(label, essay, range, failures, warnings) {
  // V2 and older outputs separate paragraphs with a single newline.
  const paragraphs = essay.trim().split(flag === '--v2' ? /\n+/ : /\n\s*\n/)
  if (paragraphs.length !== 2) failures.push(`${label}: ${paragraphs.length} paragraphs, want 2`)
  paragraphs.slice(0, 2).forEach((paragraph, index) => {
    if (!norm(paragraph).startsWith(norm(starters[index]))) {
      failures.push(`${label}: paragraph ${index + 1} does not start with starter ${index + 1}`)
    } else if (!paragraph.trim().startsWith(starters[index].trim())) {
      warnings.push(`${label}: paragraph ${index + 1} matches starter ${index + 1} only after quote normalisation`)
    }
  })
  const newWords = words(essay).length - starterWords[0] - starterWords[1]
  const perParagraph = paragraphs.map((p, i) => words(p).length - (starterWords[i] || 0))
  if (range && (newWords < range[0] || newWords > range[1])) {
    failures.push(`${label}: ${newWords} new words, want ${range[0]}–${range[1]}`)
  }
  if (/[㐀-鿿]/u.test(essay)) failures.push(`${label}: contains Chinese`)
  if (/^\s*(#|\*|-|\d+[.)])\s/mu.test(essay)) failures.push(`${label}: Markdown or numbering`)
  let body = norm(essay)
  for (const starter of starters) body = body.replace(norm(starter), ' ')
  const tokens = words(body).map((w) => w.toLowerCase())
  for (let i = 0; i + 8 <= tokens.length; i += 1) {
    if (sourceGrams.has(tokens.slice(i, i + 8).join(' '))) {
      failures.push(`${label}: copies 8+ consecutive source words: "${tokens.slice(i, i + 8).join(' ')}"`)
      break
    }
  }
  // Principle 4: no named new characters. Capitalised words mid-sentence that
  // the source and starters never use; days and months are not names.
  const known = new Set(words([material, ...starters].join(' ')).map((w) => w.toLowerCase()))
  const calendar = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|English|Chinese)$/
  const names = new Set()
  for (const m of essay.matchAll(/(?<![.!?"“]\s)(?<!^)\b([A-Z][a-z]+)\b(?!\s*\d)/gm)) {
    const before = essay.slice(0, m.index).trimEnd()
    if (!before || /[.!?:"“”]$/.test(before)) continue
    if (!known.has(m[1].toLowerCase()) && !calendar.test(m[1])) names.add(m[1])
  }
  if (names.size) warnings.push(`${label}: possible new named character: ${[...names].join(', ')}`)
  const share = quoteShare(essay)
  // Principle 3: direct speech follows the source. A warning, not a failure.
  if (share > 2 * sourceQuoteShare + 10) {
    warnings.push(`${label}: ${share}% of words in direct speech, source ${sourceQuoteShare}%`)
  }
  return { newWords, perParagraph, quoteShare: share, ...readability(essay) }
}

const output = JSON.parse(readFileSync(outputPath, 'utf8'))
const failures = []
const warnings = []
const sourceLevel = readability(material)
const report = { paper: asset.paperId || path.basename(assetDir), source: { words: words(material).length, quoteShare: sourceQuoteShare, ...sourceLevel } }

if (flag === '--v2') {
  report.v2 = measureEssay('v2', output.modelAnswer, null, failures, warnings)
} else {
  const RANGES = JSON.parse(process.env.CW3_RANGES || '{"standard":[0,9999],"advanced":[0,9999]}')
  if (output.blocked !== null) failures.push(`blocked: ${output.blocked}`)
  report.standard = measureEssay('standard', output.standard.essay, RANGES.standard, failures, warnings)
  report.advanced = measureEssay('advanced', output.advanced.essay, RANGES.advanced, failures, warnings)
  const inEssay = (essay, quote, where) => {
    if (!norm(essay).includes(norm(quote))) failures.push(`${where} quote is not verbatim: "${quote}"`)
  }
  output.standard.notes.forEach((note, n) => {
    if (![1, 2].includes(note.paragraph)) failures.push(`notes[${n}].paragraph ${note.paragraph} does not exist`)
    note.items.forEach((item, i) => inEssay(output.standard.essay, item.quote, `notes[${n}].items[${i}]`))
    if (note.items.length < 2 || note.items.length > 4) warnings.push(`notes[${n}] has ${note.items.length} items`)
  })
  output.advanced.beyondStandard.forEach((item, i) => inEssay(output.advanced.essay, item.quote, `beyondStandard[${i}]`))
  const sourceText = norm([material, ...starters].join('\n'))
  output.reading.sourceLinks.forEach((link, i) => {
    if (!sourceText.includes(norm(link.sourceQuote))) failures.push(`sourceLinks[${i}] is not verbatim source: "${link.sourceQuote}"`)
  })
  for (const [name, list] of [
    ['reading.questions', output.reading.questions], ['reading.sourceLinks', output.reading.sourceLinks],
    ['standard.expressions', output.standard.expressions], ['standard.pitfalls', output.standard.pitfalls],
    ['advanced.beyondStandard', output.advanced.beyondStandard], ['taskCard.taskRequires', output.taskCard.taskRequires],
  ]) {
    const [lo, hi] = name === 'taskCard.taskRequires' ? [2, 4] : name === 'reading.questions' ? [3, 3] : [2, 3]
    if (!Array.isArray(list) || list.length < lo || list.length > hi) warnings.push(`${name} has ${list?.length} entries`)
  }
  if (report.standard.fk > sourceLevel.fk + 1.5) warnings.push(`standard FK ${report.standard.fk} is more than 1.5 above source ${sourceLevel.fk}`)
}

console.log(JSON.stringify({ ...report, failures, warnings }, null, 2))
process.exitCode = failures.length ? 1 : 0
