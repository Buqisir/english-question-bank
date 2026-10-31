import { chineseContextNumbering } from '../../shared/chineseContextNumbering.mjs'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

// Groups awaiting Owner listening: decision stays non-usable in the sealed
// sidecar, but playback.mp3 exists so they are submitted with a pending mark
// instead of blocking the whole paper. Audio presence is the hard gate.
export function pendingOwnerListeningGroups({ materialization, listeningReview, paperDir }) {
  const transcript = materialization.listening?.transcript || []
  if (!transcript.length || !existsSync(path.join(paperDir, 'materialization/listening-audio/playback.mp3'))) return []
  const groups = listeningReview?.groups || []
  return transcript.filter(source => {
    const matches = groups.filter(group => group.segmentId === source.segmentId)
    return matches.length === 1 && matches[0].decision !== 'usable'
      && JSON.stringify(matches[0].questionNumbers) === JSON.stringify(source.questionNumbers)
  }).map(source => {
    const review = groups.find(group => group.segmentId === source.segmentId)
    return { segmentId: source.segmentId, questionNumbers: source.questionNumbers, reason: review.reason || review.decision }
  })
}

export function importSubmissionIssues({ materialization, listeningReview, analyzedPackage = null, paperDir = null }) {
  const issues = []
  const transcript = materialization.listening?.transcript || []
  // External packages use Owner Screen/PDF review and cannot author this raw-source sidecar.
  if (!analyzedPackage && (materialization.listening?.state === 'captured' || transcript.length)) {
    const groups = listeningReview?.groups || []
    const pending = paperDir ? new Set(pendingOwnerListeningGroups({ materialization, listeningReview, paperDir })
      .map(group => group.segmentId)) : new Set()
    const unresolved = transcript.filter(source => {
      const matches = groups.filter(group => group.segmentId === source.segmentId)
      return (matches.length !== 1 || matches[0].decision !== 'usable'
        || JSON.stringify(matches[0].questionNumbers) !== JSON.stringify(source.questionNumbers))
        && !pending.has(source.segmentId)
    }).map(group => group.segmentId)
    if (!transcript.length) unresolved.push('<missing listening transcript>')
    if (unresolved.length) issues.push({ code: 'IMPORT_SUBMIT_LISTENING_NOT_USABLE', groups: unresolved })
  }
  // Materialization is the student-visible source of truth. Scan text fields,
  // including nested writing points, but not provenance, IDs, URLs or machine notes.
  const skip = new Set(['source', 'sources', 'documents', 'media', 'sourceCoverage', 'issues',
    'answers', 'sourceDigest', 'candidateDigest', 'provenance', 'timing'])
  function visit(node, field = '$') {
    if (typeof node === 'string') {
      // A Chinese instruction may continue on a new line with numbered points.
      // Do not flag a wholly English passage's ordinary parenthesized numbers.
      const matches = chineseContextNumbering(node).map(match => match[0])
      if (matches.length) issues.push({ code: 'IMPORT_SUBMIT_CHINESE_HALF_WIDTH_NUMBERING', field, matches })
    } else if (Array.isArray(node)) {
      const inline = /\.(?:runs|children|content|points|requirements)$/u.test(field)
      const chunks = inline ? node.map(value => typeof value === 'string' ? value : value?.text || '') : []
      const combined = chunks.join('')
      if (inline) {
        for (const match of chineseContextNumbering(combined, chunks)) {
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

export function assertImportSubmissionReady(paperDir, materialization = null, { analyzedPackage = null } = {}) {
  if (!materialization) {
    const manifest = JSON.parse(readFileSync(path.join(paperDir, 'universal-source-manifest.json'), 'utf8'))
    materialization = JSON.parse(readFileSync(path.resolve(paperDir, manifest.materializationPath), 'utf8'))
  }
  const reviewFile = path.join(paperDir, 'listening-review-v1.json')
  const listeningReview = !analyzedPackage && existsSync(reviewFile) ? JSON.parse(readFileSync(reviewFile, 'utf8')) : null
  const issues = importSubmissionIssues({ materialization, listeningReview, analyzedPackage, paperDir })
  const blockers = issues.filter(issue => issue.code !== 'IMPORT_SUBMIT_CHINESE_HALF_WIDTH_NUMBERING')
  for (const issue of issues.filter(issue => issue.code === 'IMPORT_SUBMIT_CHINESE_HALF_WIDTH_NUMBERING')) {
    console.warn(`送审提示（不阻塞）：${issue.code}: ${issue.field}: ${issue.matches.join(', ')}`)
  }
  if (blockers.length) throw Object.assign(new Error(`送审门禁拒绝：\n${blockers.map(issue =>
    `${issue.code}: ${issue.groups?.join(', ') || `${issue.field}: ${issue.matches.join(', ')}`}`).join('\n')}`),
  { code: blockers[0].code, issues: blockers })
  const pendingOwnerListening = !analyzedPackage
    ? pendingOwnerListeningGroups({ materialization, listeningReview, paperDir }) : []
  return { status: 'PASS', ...(pendingOwnerListening.length ? { pendingOwnerListening } : {}) }
}
