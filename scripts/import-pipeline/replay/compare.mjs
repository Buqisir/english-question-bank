import { isDeepStrictEqual } from 'node:util'
import { digest, stable } from './corpus.mjs'

const escape = (key) => String(key).replace(/~/gu, '~0').replace(/\//gu, '~1')
const side = (value, present) => present ? { present: true, value } : { present: false }

function contextAt(root, pointer) {
  const context = {}
  let node = root
  const collect = () => {
    if (!node || typeof node !== 'object') return
    for (const key of ['groupId', 'taskType', 'referenceId', 'paragraphId', 'documentId', 'page', 'itemId', 'sourceItemIndexes']) {
      if (node[key] !== undefined) context[key] = node[key]
    }
    if (node.source) context.source = node.source
    if (node.labelSource) context.labelSource = node.labelSource
    if (node.locator) context.locator = node.locator
  }
  collect()
  for (const part of pointer.split('/').slice(1)) {
    node = node?.[part.replace(/~1/gu, '/').replace(/~0/gu, '~')]
    collect()
  }
  return context
}

function snippet(before, after) {
  if (!before.present || !after.present || typeof before.value !== 'string' || typeof after.value !== 'string') return null
  const a = before.value
  const b = after.value
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let end = 0
  while (end < a.length - start && end < b.length - start && a.at(-end - 1) === b.at(-end - 1)) end += 1
  return { offset: start, before: a.slice(Math.max(0, start - 24), Math.min(a.length - end + 24, start + 160)),
    after: b.slice(Math.max(0, start - 24), Math.min(b.length - end + 24, start + 160)) }
}

export function compare(before, after) {
  const diffs = []
  const walk = (a, b, pointer, aPresent = true, bPresent = true) => {
    if (aPresent && bPresent && isDeepStrictEqual(a, b)) return
    const compatible = aPresent && bPresent && a && b && typeof a === 'object' && typeof b === 'object'
      && Array.isArray(a) === Array.isArray(b)
    if (compatible) {
      const keys = Array.isArray(a) ? Array.from({ length: Math.max(a.length, b.length) }, (_, index) => String(index))
        : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
      for (const key of keys) walk(a[key], b[key], `${pointer}/${escape(key)}`, Object.hasOwn(a, key), Object.hasOwn(b, key))
      return
    }
    const oldValue = side(a, aPresent)
    const newValue = side(b, bPresent)
    diffs.push({ path: pointer, before: oldValue, after: newValue,
      context: { before: contextAt(before, pointer), after: contextAt(after, pointer) },
      snippet: snippet(oldValue, newValue) })
  }
  walk(before, after, '')
  return diffs
}

export function validateDeclarations(document) {
  if (document.schemaVersion !== 'eqb-replay-expectations-v1' || !Array.isArray(document.changes)) {
    throw new Error('Invalid expected-change document')
  }
  const ids = new Set()
  for (const entry of document.changes) {
    if (!entry.paperId || !['R', 'T'].includes(entry.channel) || typeof entry.path !== 'string'
      || !entry.reason?.trim() || !entry.target || !Object.keys(entry.target).length) {
      throw new Error('Every declaration needs paperId, channel, exact path, target and reason')
    }
    if (!['groupId', 'itemId', 'sourceItemIndexes', 'documentId', 'scope'].some((key) => Object.hasOwn(entry.target, key))) {
      throw new Error('Declaration target must identify a group/source item/document or explicit channel scope')
    }
    if (entry.target.scope && (entry.target.scope !== 'channel' || Object.keys(entry.target).length !== 1)) {
      throw new Error('Invalid channel scope')
    }
    for (const name of ['before', 'after']) {
      const match = entry[name]
      if (!match || (!Object.hasOwn(match, 'present') && !/^[0-9a-f]{64}$/u.test(match.sha256 || ''))) {
        throw new Error(`Declaration ${name} needs an exact side or SHA-256 of that side`)
      }
      if (Object.hasOwn(match, 'present') && (typeof match.present !== 'boolean'
        || (match.present && !Object.hasOwn(match, 'value')))) throw new Error(`Invalid ${name} side`)
    }
    const id = `${entry.paperId}:${entry.channel}:${entry.path}`
    if (ids.has(id)) throw new Error(`Duplicate declaration: ${id}`)
    ids.add(id)
  }
  return document.changes
}

const matchesSide = (expected, actual) => Object.hasOwn(expected, 'sha256')
  ? expected.sha256 === digest(actual) : stable(expected) === stable(actual)

export function applyDeclarations(paperId, channel, diffs, declarations, used) {
  return diffs.map((diff) => {
    const index = declarations.findIndex((entry) => entry.paperId === paperId && entry.channel === channel
      && entry.path === diff.path && matchesSide(entry.before, diff.before) && matchesSide(entry.after, diff.after)
      && (entry.target.scope === 'channel' || [diff.context.before, diff.context.after].some((context) =>
        Object.entries(entry.target).every(([key, value]) => stable(context[key]) === stable(value)))))
    if (index === -1) return { ...diff, status: 'UNEXPECTED' }
    used.add(index)
    return { ...diff, status: 'EXPECTED', reason: declarations[index].reason }
  })
}
