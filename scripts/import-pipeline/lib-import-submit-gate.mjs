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
  function visit(node, field = '$', chineseContext = false) {
    if (typeof node === 'string') {
      // A Chinese instruction may continue on a new line with numbered points.
      // Do not flag a wholly English passage's ordinary parenthesized numbers.
      if (chineseContext || hasChinese(node)) {
        const matches = [...node.matchAll(/\(\s*\d{1,3}\s*\)/gu)].map(match => match[0])
        if (matches.length) issues.push({ code: 'IMPORT_SUBMIT_CHINESE_HALF_WIDTH_NUMBERING', field, matches })
      }
    } else if (Array.isArray(node)) {
      const inline = /\.(?:runs|children|content|points|requirements)$/u.test(field)
      const chunks = inline ? node.map(value => typeof value === 'string' ? value : value?.text || '') : []
      const combined = chunks.join('')
      if (inline && (chineseContext || hasChinese(combined))) {
        for (const match of combined.matchAll(/\(\s*\d{1,3}\s*\)/gu)) {
          let offset = 0
          const touched = []
          chunks.forEach((chunk, index) => {
            if (offset < match.index + match[0].length && offset + chunk.length > match.index) touched.push(index)
            offset += chunk.length
          })
          if (touched.length > 1) issues.push({ code: 'IMPORT_SUBMIT_CHINESE_HALF_WIDTH_NUMBERING',
            field: `${field}[${touched[0]}]${typeof node[touched[0]] === 'string' ? '' : '.text'}`,
            matches: [match[0]] })
        }
      }
      node.forEach((value, index) => visit(value, `${field}[${index}]`, chineseContext || hasChinese(combined)))
    }
    else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) if (!skip.has(key)) visit(value, `${field}.${key}`, chineseContext)
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
