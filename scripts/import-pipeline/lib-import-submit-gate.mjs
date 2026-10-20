import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export function importSubmissionIssues({ materialization, listeningReview }) {
  const issues = []
  const transcript = materialization.listening?.transcript || []
  if (materialization.listening?.state === 'captured' || transcript.length) {
    const groups = listeningReview?.groups || []
    const unresolved = transcript.filter(source => {
      const matches = groups.filter(group => group.segmentId === source.segmentId)
      return matches.length !== 1 || matches[0].decision !== 'usable'
        || JSON.stringify(matches[0].questionNumbers) !== JSON.stringify(source.questionNumbers)
    }).map(group => group.segmentId)
    if (!transcript.length) unresolved.push('<missing listening transcript>')
    if (unresolved.length) issues.push({ code: 'IMPORT_SUBMIT_LISTENING_NOT_USABLE', groups: unresolved })
  }
  // Materialization is the student-visible source of truth. Scan text fields,
  // including nested writing points, but not provenance, IDs, URLs or machine notes.
  const skip = new Set(['source', 'sources', 'documents', 'media', 'sourceCoverage', 'issues',
    'answers', 'sourceDigest', 'candidateDigest', 'provenance', 'timing'])
  const hasChinese = text => /[\p{Script=Han}]/u.test(text)
  function numbering(text, chunks = null) {
    return [...text.matchAll(/\(\s*\d{1,3}\s*\)/gu)].filter(match => {
      // Inspect the neighboring lexical fragment, not all Han characters in a
      // mixed-language instruction. English quotes remain English fragments.
      const quote = [...text.matchAll(/“[^”]*”|"[^"]*"|‘[^’]*’|「[^」]*」|『[^』]*』/gu)]
        .find(q => q.index < match.index && q.index + q[0].length > match.index + match[0].length)
      if (quote && /[a-z]/iu.test(quote[0]) && !hasChinese(quote[0])) return false
      let local = text, index = match.index
      // A lexical inline item owns its language. Number-only runs still obtain
      // context from the combined stream, including split parentheses.
      let offset = 0
      for (const chunk of chunks || []) {
        if (offset <= match.index && offset + chunk.length >= match.index + match[0].length
          && /\p{L}/u.test(chunk)) { local = chunk; index -= offset; break }
        offset += chunk.length
      }
      const before = local.slice(0, index).split(/[。！？.!?;；\n]/u).at(-1)
        .match(/([\p{L}]+)[^\p{L}]*$/u)?.[1] || ''
      const after = local.slice(index + match[0].length).split(/[。！？.!?;；\n]/u)[0]
        .match(/^[^\p{L}]*([\p{L}]+)/u)?.[1] || ''
      const prior = local.slice(0, index).match(/([\p{L}]+)[^\p{L}]*$/u)?.[1] || ''
      return hasChinese(after || before || prior)
    })
  }
  function visit(node, field = '$') {
    if (typeof node === 'string') {
      // A Chinese instruction may continue on a new line with numbered points.
      // Do not flag a wholly English passage's ordinary parenthesized numbers.
      const matches = numbering(node).map(match => match[0])
      if (matches.length) issues.push({ code: 'IMPORT_SUBMIT_CHINESE_HALF_WIDTH_NUMBERING', field, matches })
    } else if (Array.isArray(node)) {
      const inline = /\.(?:runs|children|content|points|requirements)$/u.test(field)
      const chunks = inline ? node.map(value => typeof value === 'string' ? value : value?.text || '') : []
      const combined = chunks.join('')
      if (inline) {
        for (const match of numbering(combined, chunks)) {
          let offset = 0
          const touched = []
          chunks.forEach((chunk, index) => {
            if (offset < match.index + match[0].length && offset + chunk.length > match.index) touched.push(index)
            offset += chunk.length
          })
          if (touched.length) issues.push({ code: 'IMPORT_SUBMIT_CHINESE_HALF_WIDTH_NUMBERING',
            field: `${field}[${touched[0]}]${typeof node[touched[0]] === 'string' ? '' : '.text'}`,
            matches: [match[0]] })
        }
      }
      node.forEach((value, index) => {
        if (!inline) visit(value, `${field}[${index}]`)
        else if (value && typeof value === 'object') {
          for (const [key, child] of Object.entries(value)) if (key !== 'text' && !skip.has(key)) visit(child, `${field}[${index}].${key}`)
        }
      })
    }
    else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) if (!skip.has(key)) visit(value, `${field}.${key}`)
    }
  }
  visit(materialization)
  return issues
}

export function assertImportSubmissionReady(paperDir, materialization = null) {
  if (!materialization) {
    const manifest = JSON.parse(readFileSync(path.join(paperDir, 'universal-source-manifest.json'), 'utf8'))
    materialization = JSON.parse(readFileSync(path.resolve(paperDir, manifest.materializationPath), 'utf8'))
  }
  const reviewFile = path.join(paperDir, 'listening-review-v1.json')
  const listeningReview = existsSync(reviewFile) ? JSON.parse(readFileSync(reviewFile, 'utf8')) : null
  const issues = importSubmissionIssues({ materialization, listeningReview })
  if (issues.length) throw Object.assign(new Error(`送审门禁拒绝：\n${issues.map(issue =>
    `${issue.code}: ${issue.groups?.join(', ') || `${issue.field}: ${issue.matches.join(', ')}`}`).join('\n')}`),
  { code: issues[0].code, issues })
  return { status: 'PASS' }
}
