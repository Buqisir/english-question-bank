import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { indexPhraseOccurrence } from '../../shared/paper-dictionary/phraseOccurrence.mjs'

export const text = 'She gave it up and made up her mind.'
export const laterText = 'Rain fell. Due to fog, we waited. Due to rain, we stayed.'
export const source = {
  paperId: 'paper-phrases', sourceRevision: 'rev-1',
  streams: [{
    streamId: 'passage', groupId: 'g', role: 'passage-body', text,
    leaves: [{ kind: 'paragraph', id: 'p1', start: 0, end: text.length }],
  }, {
    streamId: 'later', groupId: 'g', role: 'passage-body', text: laterText,
    leaves: [{ kind: 'paragraph', id: 'p2', start: 0, end: laterText.length }],
  }],
}

export function installOtterPhraseFixture(root) {
  const dir = path.join(root, 'server/paper-dictionary/otter-data')
  mkdirSync(path.join(dir, 'entries'), { recursive: true })
  const counts = { gaokao: 1, mock: 0 }
  const entries = [
    { entryId: 'w:give', headword: 'give', forms: [{ form: 'gave' }], relatedPhrases: ['w:give-up'], glossZh: '给' },
    { entryId: 'w:cant', headword: "can't", glossZh: '不能' },
    { entryId: 'w:give-up', headword: 'give up', kind: 'phrase', variants: ['gave up'], glossZh: '放弃' },
    { entryId: 'w:make-up-ones-mind', headword: "make up one's mind", kind: 'phrase',
      variants: ["made up one's mind"], glossZh: '下定决心' },
    { entryId: 'w:due-to', headword: 'due to', kind: 'phrase', glossZh: '由于',
      exampleText: 'Due to fog, we waited.', locator: { paragraphId: 'p2', sentence: 2 } },
  ]
  const rows = [
    { entryId: 'w:give', start: 4, end: 8 },
    { entryId: 'w:give-up', start: 4, end: 14, parts: [[4, 8], [12, 14]] },
    { entryId: 'w:make-up-ones-mind', start: 19, end: 35 },
  ]
  for (const { glossZh, exampleText = text, locator = { paragraphId: 'p1', sentence: 1 }, ...entry } of entries) {
    writeFileSync(path.join(dir, 'entries', `${entry.entryId}.json`), JSON.stringify({
      version: 1, lists: entry.kind === 'phrase' ? [] : ['3000'], variants: [], forms: [], pronunciations: [], counts, ...entry,
      senses: [{ senseId: `${entry.entryId}#s1`, pos: entry.kind === 'phrase' ? '短语' : 'v.', glossZh, origin: 'gaokao', counts, folded: false,
        examples: [{ exampleId: `${entry.entryId}#e1`, text: exampleText, source: {
          paperId: source.paperId, groupId: 'g', paperTitle: '短语测试卷', locator,
        } }] }],
    }))
  }
  const occurrences = rows.map(row => ({
    ...row, ...indexPhraseOccurrence(text, { start: 0, text }, [row.start, row.end], row.parts),
    paperId: source.paperId, groupId: 'g', paragraphId: 'p1', sentence: 1,
    senseId: `${row.entryId}#s1`,
  }))
  occurrences.push({
    paperId: source.paperId, groupId: 'g', paragraphId: 'p2', sentence: 2,
    start: 0, end: 6, surface: 'Due to', entryId: 'w:due-to', senseId: 'w:due-to#s1',
  })
  writeFileSync(path.join(dir, 'occurrence-senses.ndjson'), occurrences.map(row => JSON.stringify(row)).join('\n'))
}
