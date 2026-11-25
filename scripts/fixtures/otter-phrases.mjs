import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const text = 'She gave it up and made up her mind.'
export const source = {
  paperId: 'paper-phrases', sourceRevision: 'rev-1',
  streams: [{
    streamId: 'passage', groupId: 'g', role: 'passage-body', text,
    leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: text.length }],
  }],
}

export function installOtterPhraseFixture(root) {
  const dir = path.join(root, 'server/paper-dictionary/otter-data')
  mkdirSync(path.join(dir, 'entries'), { recursive: true })
  const counts = { gaokao: 1, mock: 0 }
  const entries = [
    { entryId: 'w:give', headword: 'give', forms: [{ form: 'gave' }], relatedPhrases: ['w:give-up'], glossZh: '给' },
    { entryId: 'w:give-up', headword: 'give up', kind: 'phrase', variants: ['gave up'], glossZh: '放弃' },
    { entryId: 'w:make-up-ones-mind', headword: "make up one's mind", kind: 'phrase',
      variants: ["made up one's mind"], glossZh: '下定决心' },
  ]
  const rows = [
    { entryId: 'w:give', start: 4, end: 8 },
    { entryId: 'w:give-up', start: 4, end: 14, parts: [[4, 8], [12, 14]] },
    { entryId: 'w:make-up-ones-mind', start: 19, end: 35 },
  ]
  for (const { glossZh, ...entry } of entries) {
    writeFileSync(path.join(dir, 'entries', `${entry.entryId}.json`), JSON.stringify({
      version: 1, lists: ['3000'], variants: [], forms: [], pronunciations: [], counts, ...entry,
      senses: [{ senseId: `${entry.entryId}#s1`, pos: 'v.', glossZh, origin: 'gaokao', counts, folded: false,
        examples: [{ exampleId: `${entry.entryId}#e1`, text, source: {
          paperId: source.paperId, groupId: 'g', paperTitle: '短语测试卷', locator: { paragraphId: 'p1' },
        } }] }],
    }))
  }
  writeFileSync(path.join(dir, 'occurrence-senses.ndjson'), rows.map(row => JSON.stringify({
    ...row, paperId: source.paperId, groupId: 'g', paragraphId: 'p1', sentence: 1,
    senseId: `${row.entryId}#s1`, surface: text.slice(row.start, row.end),
  })).join('\n'))
}
