// node build-req.mjs → trial/req/<paper>.json：每题带旧依据原话、选项英文和译文、每个错项录音里听到的词
import fs from 'node:fs'
const SP = process.env.LISTENING_TRIAL_DIR // 本地草稿目录：xinfa/papers/<卷>/ 和 listening/trial/
const papers = ['paper-gaokao-2026-i', 'paper-gaokao-2026-ii', 'paper-gaokao-2025-ii']
const STOP = new Set(('the a an of to in on at for and or is are was were be been by with his her their its it he she they you i we this that ' +
  'from as about not do does did will can has have had your our my me him them who what which there here some any more most very just than then ' +
  'one two get got go going make made take took').split(' '))
const norm = (w) => w.toLowerCase().replace(/[’']s$/u, '').replace(/(ies)$/u, 'y').replace(/(ing|ed|es|s)$/u, '')
const words = (t) => (t.match(/[A-Za-z][A-Za-z’'-]*|\d[\d:.,]*/gu) || [])
export function heard(option, transcript) {
  const tw = new Map(words(transcript).map((w) => [norm(w), w]))
  const content = words(option).filter((w) => /\d/u.test(w) || (!STOP.has(w.toLowerCase()) && w.length > 2))
  const hits = content.filter((w) => tw.has(norm(w)))
  const number = hits.some((w) => /\d/u.test(w))
  return { heardInRecording: [...new Set(hits)], mustExplain: content.length > 0 && (number || hits.length / content.length >= 0.5) }
}
fs.mkdirSync(`${SP}/listening/trial/req`, { recursive: true })
let flagged = 0, total = 0
for (const paperId of papers) {
  const base = `${SP}/xinfa/papers/${paperId}`
  const A = JSON.parse(fs.readFileSync(`${base}/paper-asset.json`, 'utf8'))
  const L = JSON.parse(fs.readFileSync(`${base}/analyses/listening-analysis-v1.json`, 'utf8'))
  const materials = Object.values(L.materials).map((m) => ({
    segmentId: m.segmentId, transcript: m.transcript, translationZh: m.translationZh,
    questions: m.questionIds.map((qid) => {
      const src = A.content.questions[qid], q = L.questions[qid]
      const options = Object.fromEntries(src.options.map((o) => [o.label, o.text]))
      const wrong = Object.fromEntries(Object.entries(options).filter(([l]) => l !== q.officialAnswer).map(([l, t]) => {
        const h = heard(t, m.transcript); total += 1; flagged += h.mustExplain; return [l, h]
      }))
      return { questionId: qid, questionNo: src.questionNo, stem: src.stem, options, optionTranslationsZh: q.optionTranslationsZh,
        stemTranslationZh: q.stemTranslationZh, officialAnswer: q.officialAnswer, evidenceQuote: q.evidence.quote, wrongOptions: wrong }
    }),
  }))
  fs.writeFileSync(`${SP}/listening/trial/req/${paperId}.json`, JSON.stringify({ paperId, materials }, null, 2))
}
console.log('wrong options', total, 'mustExplain', flagged)
