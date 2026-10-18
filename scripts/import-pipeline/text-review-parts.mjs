#!/usr/bin/env node
// Split a `review.mjs prepare-spelling` request into group-aligned parts that independent
// reviewers can complete in parallel, then merge them back into one report for
// `review.mjs finalize-spelling`. Every judgement stays with the reviewer; the merge only
// checks closure and exact offsets so a malformed part fails before finalize does.
//
//   split <request.json> --out <dir> [--parts 5]
//   merge <request.json> --out <dir> --output <review.json>
//   merge <request.json> --out <dir> --part N           check one part only; writes nothing
//   auto <request.json> --flags <dir> --output <review.json> [--paper-dir <dir>]
//
// `auto` builds the complete report from the source flags OCR proofreaders record while
// reading every page (ocr-proofread-rules.md) plus the policy's mechanical punctuation and
// whitespace classes. The proofreaders own every spelling/grammar/uncertain judgement.
// Source emphasis comes from the paper's retained evidence (default: papers/<paperId>).
// Mechanical edits crossing a mark are skipped; authored edits stay in the report.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { crossesSourceEmphasis, loadSpellingSourceEmphasis } from './spelling-source-emphasis.mjs'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function option(name, fallback = null) {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

function readJson(file) {
  if (!existsSync(file)) fail(`Missing file: ${file}`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

function bucketOf(pointer) {
  const parts = pointer.split('/')
  return parts[1] === 'groups' ? `/groups/${parts[2]}` : `/${parts[1]}`
}

// English dash typography is the one mechanical v3 punctuation class; the reviewer still
// decides whether each suggestion is a real English-context dash.
const DASH = /[A-Za-z0-9]+[)”’']? *— *[(“‘']?[A-Za-z0-9]+/gu

function split(requestPath) {
  const request = readJson(requestPath)
  const out = path.resolve(option('--out') || fail('split requires --out <dir>'))
  const count = Number(option('--parts', '5'))
  const groups = request.materialization?.groups || []
  const buckets = new Map()
  for (const target of request.report.targets) {
    const key = bucketOf(target.jsonPointer)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(target)
  }
  const weight = (targets) => targets.reduce((sum, target) => sum + target.before.length + 40, 0)
  const total = [...buckets.values()].reduce((sum, targets) => sum + weight(targets), 0)
  const parts = [[]]
  let filled = 0
  for (const [key, targets] of buckets) {
    if (filled >= total / count && parts.length < count) {
      parts.push([])
      filled = 0
    }
    parts.at(-1).push(key)
    filled += weight(targets)
  }
  mkdirSync(out, { recursive: true })
  const written = parts.map((keys, index) => {
    const file = path.join(out, `part-${index + 1}.json`)
    if (existsSync(file)) fail(`Refusing to overwrite reviewed part: ${file}`)
    const targets = keys.flatMap((key) => buckets.get(key)).map((target) => {
      const suggestions = [...target.before.matchAll(DASH)].map((match) => ({
        start: match.index,
        before: match[0],
        after: match[0].replace(/ *— */u, ' – '),
        category: 'punctuation',
      }))
      return { ...target, ...(suggestions.length ? { dashSuggestions: suggestions } : {}) }
    })
    writeJson(file, {
      part: index + 1,
      buckets: keys.map((key) => ({
        bucket: key,
        slotId: key.startsWith('/groups/') ? groups[Number(key.split('/')[2])]?.slotId || null : key.slice(1),
      })),
      instructions: request.instructions,
      targets,
    })
    return { file, buckets: keys, targets: targets.length }
  })
  console.log(JSON.stringify({ ok: true, parts: written }, null, 2))
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function merge(requestPath) {
  const request = readJson(requestPath)
  const out = path.resolve(option('--out') || fail('merge requires --out <dir>'))
  const only = option('--part')
  const output = only ? null : path.resolve(option('--output') || fail('merge requires --output <review.json>'))
  const reviewed = new Map()
  const names = readdirSync(out).filter((file) => (only ? file === `part-${only}.json` : /^part-\d+\.json$/u.test(file)))
  for (const name of names.sort()) {
    for (const target of readJson(path.join(out, name)).targets) {
      if (reviewed.has(target.jsonPointer)) fail(`${target.jsonPointer} appears in two parts`)
      reviewed.set(target.jsonPointer, target)
    }
  }
  const problems = []
  const scope = only ? request.report.targets.filter((target) => reviewed.has(target.jsonPointer)) : request.report.targets
  const targets = scope.map((target) => {
    const done = reviewed.get(target.jsonPointer)
    if (!done) {
      problems.push(`${target.jsonPointer}: not reviewed`)
      return target
    }
    if (done.before !== target.before) problems.push(`${target.jsonPointer}: before text was edited`)
    if (!['unchanged', 'correct', 'uncertain'].includes(done.decision)) {
      problems.push(`${target.jsonPointer}: decision is ${done.decision}`)
    }
    const corrections = Array.isArray(done.corrections) ? done.corrections : []
    if (done.decision === 'unchanged' && corrections.length) problems.push(`${target.jsonPointer}: unchanged with corrections`)
    if (done.decision === 'correct' && !corrections.length) problems.push(`${target.jsonPointer}: correct without corrections`)
    if (done.decision !== 'unchanged' && !String(done.note || '').trim()) problems.push(`${target.jsonPointer}: note is required`)
    let previousEnd = 0
    for (const correction of [...corrections].sort((left, right) => left.start - right.start)) {
      if (target.before.slice(correction.start, correction.start + correction.before.length) !== correction.before) {
        problems.push(`${target.jsonPointer}: correction "${correction.before}" is not at offset ${correction.start}`)
      }
      if (correction.start < previousEnd) problems.push(`${target.jsonPointer}: corrections overlap`)
      previousEnd = correction.start + correction.before.length
      if (!correction.before || correction.after === correction.before) problems.push(`${target.jsonPointer}: empty correction`)
    }
    return {
      ...target,
      decision: done.decision,
      note: done.note || '',
      corrections: corrections.map(({ start, before, after, category, certainty = 'unambiguous', reason }) =>
        ({ start, before, after, category, certainty, reason })),
    }
  })
  if (reviewed.size !== scope.length || (!only && reviewed.size !== request.report.targets.length)) {
    problems.push('parts contain targets that are not in the request')
  }
  if (problems.length) fail(`Spelling parts are not complete:\n${problems.slice(0, 40).join('\n')}`)
  const count = (decision) => targets.filter((target) => target.decision === decision).length
  if (only) {
    console.log(JSON.stringify({ ok: true, part: Number(only), targets: targets.length,
      unchanged: count('unchanged'), correct: count('correct'), uncertain: count('uncertain') }, null, 2))
    return
  }
  writeJson(output, {
    ...request.report,
    reviewedBy: 'import_agent',
    reviewedAt: new Date().toISOString(),
    targets,
  })
  console.log(JSON.stringify({
    ok: true,
    output,
    targets: targets.length,
    unchanged: count('unchanged'),
    correct: count('correct'),
    uncertain: count('uncertain'),
  }, null, 2))
}

// Mirrors normalizeReviewedPunctuation in server/paper-import/spellingReview.mjs, which
// finalize-spelling applies to every punctuation correction's `before`.
function normalizePunctuation(text) {
  return text.replace(/ *[—–] */gu, (match, offset, original) => {
    const left = original.slice(0, offset).match(/(?<![\p{L}\p{N}])([A-Za-z0-9]+)[)”’']?$/u)?.[1]
    const right = original.slice(offset + match.length).match(/^[(“‘']?([A-Za-z0-9]+)(?![\p{L}\p{N}])/u)?.[1]
    return left && right && /[A-Za-z]/u.test(left + right) ? ' – ' : match
  })
    .replace(/(?<=[A-Za-z0-9]) *“/gu, ' “')
    .replace(/” *(?=[A-Za-z0-9])/gu, '” ')
    .replace(/“ +/gu, '“')
    .replace(/ +”/gu, '”')
}

const PUNCTUATION_SPANS = [
  /[A-Za-z0-9]+[)”’']? *[—–] *[(“‘']?[A-Za-z0-9]+/gu,
  /[A-Za-z0-9] *“/gu,
  /” *[A-Za-z0-9]/gu,
  /“ +/gu,
  / +”/gu,
]
const SPELLING_WORD = /^[A-Za-z]+(?:['’][A-Za-z]+)*$/u
const GRAMMAR_WORDS = /^[A-Za-z]+(?:['’][A-Za-z]+)*(?: [A-Za-z]+(?:['’][A-Za-z]+)*)*$/u
const WORD_CHAR = /[\p{L}\p{N}'’_-]/u

function mechanicalCorrections(text) {
  const spans = PUNCTUATION_SPANS
    .flatMap((pattern) => [...text.matchAll(pattern)].map((match) => [match.index, match.index + match[0].length]))
    .filter(([start, end]) => normalizePunctuation(text.slice(start, end)) !== text.slice(start, end))
    .sort((left, right) => left[0] - right[0])
  const merged = []
  for (const span of spans) {
    const last = merged.at(-1)
    if (last && span[0] < last[1]) last[1] = Math.max(last[1], span[1])
    else merged.push([...span])
  }
  const corrections = []
  for (const [start, end] of merged) {
    const before = text.slice(start, end)
    const after = normalizePunctuation(before)
    if (after === before) continue
    corrections.push({ start, before, after, category: 'punctuation', certainty: 'unambiguous',
      reason: /[—–]/u.test(before)
        ? `“${before}”的破折号两侧均为英文词语，按规则改为两侧各一空格的 en dash。`
        : `“${before}”的弯引号与相邻英文词之间的空格按规则统一。` })
  }
  for (const match of text.matchAll(/(?<=\S) {2,}(?=\S)/gu)) {
    const end = match.index + match[0].length
    if (merged.some(([start, stop]) => match.index < stop && start < end)) continue
    corrections.push({ start: match.index, before: match[0], after: ' ', category: 'whitespace',
      certainty: 'unambiguous', reason: '词间连续空格按规则合并为一个空格。' })
  }
  return corrections
}

// `context` is an optional longer verbatim snippet that pins a short quote (a name, a
// one-word insertion point) to one place; the correction itself stays the minimal quote.
function occurrences(text, flag, wholeWords) {
  const needle = flag.context ?? flag.quote
  const offset = flag.context === undefined ? 0 : flag.context.indexOf(flag.quote)
  const found = []
  for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + 1)) {
    const start = index + offset
    if (!wholeWords || (!WORD_CHAR.test(text[start - 1] ?? '') && !WORD_CHAR.test(text[start + flag.quote.length] ?? ''))) {
      found.push(start)
    }
  }
  return found
}

function auto(requestPath) {
  const request = readJson(requestPath)
  const paperDir = path.resolve(option('--paper-dir') || fileURLToPath(new URL(`./papers/${request.paperId}/`, import.meta.url)))
  const emphasis = loadSpellingSourceEmphasis(paperDir, request)
  const flagsDir = path.resolve(option('--flags') || fail('auto requires --flags <dir>'))
  const output = path.resolve(option('--output') || fail('auto requires --output <review.json>'))
  if (existsSync(output)) fail(`Refusing to overwrite: ${output}`)
  const flags = readdirSync(flagsDir).filter((name) => name.endsWith('.json')).sort()
    .flatMap((name) => (readJson(path.join(flagsDir, name)).flags || []).map((flag) => ({ ...flag, file: name })))
  const problems = []
  const applied = new Map(request.report.targets.map((target) => [target.jsonPointer, { corrections: [], notes: [], reasons: [] }]))
  const mapping = []
  for (const flag of flags) {
    const label = `${flag.file} “${flag.quote}”`
    const uncertain = flag.decision === 'uncertain'
    if (typeof flag.quote !== 'string' || !flag.quote.trim()) { problems.push(`${label}: quote is empty`); continue }
    if (flag.context !== undefined && (typeof flag.context !== 'string' || !flag.context.includes(flag.quote))) {
      problems.push(`${label}: context must be verbatim text containing the quote`)
      continue
    }
    if (uncertain) {
      if (!String(flag.note || '').trim()) { problems.push(`${label}: uncertain flag needs a Chinese note`); continue }
    } else {
      const words = flag.category === 'spelling' ? SPELLING_WORD : flag.category === 'grammar' ? GRAMMAR_WORDS : null
      if (!words) { problems.push(`${label}: category must be spelling or grammar`); continue }
      if (!words.test(flag.quote) || !words.test(String(flag.after))) {
        problems.push(`${label}: ${flag.category} quote/after must be ${flag.category === 'spelling' ? 'one English word' : 'English words and spaces only'}`)
        continue
      }
      if (flag.quote.toLowerCase() === String(flag.after).toLowerCase() || !String(flag.reason || '').trim()) {
        problems.push(`${label}: needs a real change and a Chinese reason`)
        continue
      }
    }
    const hits = request.report.targets
      .map((target) => ({ target, at: occurrences(target.before, flag, !uncertain) }))
      .filter(({ at }) => at.length)
    if (!hits.length) { problems.push(`${label}: not found in any target`); continue }
    for (const { target, at } of hits) {
      const index = at.length === 1 ? at[0] : at[(flag.occurrence ?? 0) - 1]
      if (index === undefined) { problems.push(`${label}: occurs ${at.length} times in ${target.jsonPointer}; add a longer "context"`); continue }
      const slot = applied.get(target.jsonPointer)
      if (uncertain) slot.notes.push(flag.note.trim())
      else {
        slot.corrections.push({ start: index, before: flag.quote, after: flag.after, category: flag.category,
          certainty: 'unambiguous', reason: flag.reason.trim() })
        slot.reasons.push(flag.reason.trim())
      }
    }
    mapping.push({ flag: label, decision: uncertain ? 'uncertain' : 'correct', targets: hits.map(({ target }) => target.jsonPointer) })
  }
  const skippedMechanical = []
  const crossingAgentCorrections = []
  const targets = request.report.targets.map((target) => {
    const slot = applied.get(target.jsonPointer)
    const ranges = emphasis.get(target.jsonPointer) || []
    const mechanicalCorrectionsKept = mechanicalCorrections(target.before).filter(correction => {
      if (!crossesSourceEmphasis(correction, ranges)) return true
      skippedMechanical.push({ jsonPointer: target.jsonPointer, correction, ranges })
      return false
    })
    for (const correction of slot.corrections) {
      if (crossesSourceEmphasis(correction, ranges)) crossingAgentCorrections.push({ jsonPointer: target.jsonPointer, correction, ranges })
    }
    const skipped = skippedMechanical.some(item => item.jsonPointer === target.jsonPointer)
    const corrections = [...mechanicalCorrectionsKept, ...slot.corrections]
      .sort((left, right) => left.start - right.start)
    for (let index = 1; index < corrections.length; index++) {
      const previous = corrections[index - 1]
      if (corrections[index].start < previous.start + previous.before.length) {
        problems.push(`${target.jsonPointer}: “${previous.before}” overlaps “${corrections[index].before}”`)
      }
    }
    const mechanical = corrections.some((correction) => ['punctuation', 'whitespace'].includes(correction.category))
    const decision = slot.notes.length ? 'uncertain' : corrections.length ? 'correct' : 'unchanged'
    const note = [...new Set([...slot.notes, ...slot.reasons,
      ...(skipped ? ['跨强调边界，保留原排印'] : []),
      ...(mechanical ? ['统一英文语境中的破折号、引号空格或词间空格排印。'] : [])])].join('；')
    return { ...target, decision, note, corrections }
  })
  if (problems.length) fail(`Source flags need attention before the report can be built:\n${problems.join('\n')}`)
  writeJson(output, { ...request.report, reviewedBy: 'import_agent', reviewedAt: new Date().toISOString(), targets })
  const count = (decision) => targets.filter((target) => target.decision === decision).length
  console.log(JSON.stringify({ ok: true, output, targets: targets.length, unchanged: count('unchanged'),
    correct: count('correct'), uncertain: count('uncertain'),
    mechanical: targets.reduce((sum, target) => sum + target.corrections.filter((correction) =>
      ['punctuation', 'whitespace'].includes(correction.category)).length, 0),
    skippedMechanical, crossingAgentCorrections,
    flags: mapping }, null, 2))
}

const [command, requestPath] = process.argv.slice(2)
if (command === 'split' && requestPath) split(path.resolve(requestPath))
else if (command === 'merge' && requestPath) merge(path.resolve(requestPath))
else if (command === 'auto' && requestPath) auto(path.resolve(requestPath))
else fail('Usage: text-review-parts.mjs <split|merge|auto> <request.json> [--out <dir>] [--parts N] [--flags <dir>] [--output <review.json>] [--paper-dir <dir>]')
