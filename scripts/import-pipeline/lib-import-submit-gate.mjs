import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export function importSubmissionIssues({ materialization, listeningReview, analyzedPackage = null }) {
  const issues = []
  const transcript = materialization.listening?.transcript || []
  // External packages use Owner Screen/PDF review and cannot author this raw-source sidecar.
  if (!analyzedPackage && (materialization.listening?.state === 'captured' || transcript.length)) {
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
  const quotes = /“[^”]*”|"[^"]*"|‘[^’]*’|「[^」]*」|『[^』]*』/gu
  const englishQuote = text => /[a-z]/iu.test(text) && !hasChinese(text)
  const maskEnglishQuotes = text => text.replace(quotes, quote => englishQuote(quote) ? ' '.repeat(quote.length) : quote)
  // A Chinese gloss on an English word does not make its sentence Chinese.
  // Keep offsets and English words; Han outside a gloss still blocks numbering.
  function maskChineseGlosses(text) {
    // An inner match such as gloss(徽章) inside badge(gloss(徽章)) is not
    // a standalone gloss. Only outer, non-nested parentheses are eligible.
    const outerOpenings = new Set()
    let depth = 0
    for (let index = 0; index < text.length; index++) {
      if (/[（(]/u.test(text[index])) {
        if (depth === 0) outerOpenings.add(index)
        depth++
      } else if (/[）)]/u.test(text[index])) depth = Math.max(0, depth - 1)
    }
    return text.replace(
      /(?<![\p{L}\p{N}_])([A-Za-z]+(?:[’'-][A-Za-z]+)*)[ \t]*(?:（([^()（）\r\n]*)）|\(([^()（）\r\n]*)\))/gu,
      (match, word, fullWidth, halfWidth, offset) => {
        const inside = fullWidth ?? halfWidth
        return outerOpenings.has(offset + match.search(/[（(]/u))
          && hasChinese(inside) && /^[\p{Script=Han} \t…，、；：。！？—·“”‘’「」《》〈〉.,;:!?-]+$/u.test(inside)
          ? word + ' '.repeat(match.length - word.length) : match
      },
    )
  }
  function numbering(text, chunks = null) {
    return [...text.matchAll(/\(\s*\d{1,3}\s*\)/gu)].filter(match => {
      const quote = [...text.matchAll(quotes)]
        .find(q => q.index < match.index && q.index + q[0].length > match.index + match[0].length)
      if (quote && englishQuote(quote[0])) return false
      let local = text, index = match.index
      // Preserve explicitly separate English clauses such as "Include (1)".
      // A run starting with "(1) DIY" does not own the entry: Han may follow
      // in another run, and split parentheses also need the combined stream.
      let offset = 0
      for (const chunk of chunks || []) {
        if (offset <= match.index && offset + chunk.length >= match.index + match[0].length
          && !hasChinese(chunk) && /[a-z]/iu.test(chunk.slice(0, match.index - offset))) {
          local = chunk; index -= offset; break
        }
        offset += chunk.length
      }
      // Decide gloss eligibility from original text: masking a quoted English
      // word first must not turn a mixed-language parenthesis into pure Han.
      local = maskEnglishQuotes(maskChineseGlosses(local))
      const boundary = /\(\s*\d{1,3}\s*\)|[。！？.!?;；\n]/u
      const after = local.slice(index + match[0].length).split(boundary)[0]
      // Classify the whole entry, not just its first word (DIY / BBQ).
      if (/\p{L}/u.test(after)) return hasChinese(after)
      const before = local.slice(0, index).split(boundary).at(-1)
      const prior = local.slice(0, index).match(/([\p{L}]+)[^\p{L}]*$/u)?.[1] || ''
      return hasChinese(/\p{L}/u.test(before) ? before : prior)
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

export function assertImportSubmissionReady(paperDir, materialization = null, { analyzedPackage = null } = {}) {
  if (!materialization) {
    const manifest = JSON.parse(readFileSync(path.join(paperDir, 'universal-source-manifest.json'), 'utf8'))
    materialization = JSON.parse(readFileSync(path.resolve(paperDir, manifest.materializationPath), 'utf8'))
  }
  const reviewFile = path.join(paperDir, 'listening-review-v1.json')
  const listeningReview = !analyzedPackage && existsSync(reviewFile) ? JSON.parse(readFileSync(reviewFile, 'utf8')) : null
  const issues = importSubmissionIssues({ materialization, listeningReview, analyzedPackage })
  if (issues.length) throw Object.assign(new Error(`送审门禁拒绝：\n${issues.map(issue =>
    `${issue.code}: ${issue.groups?.join(', ') || `${issue.field}: ${issue.matches.join(', ')}`}`).join('\n')}`),
  { code: issues[0].code, issues })
  return { status: 'PASS' }
}
