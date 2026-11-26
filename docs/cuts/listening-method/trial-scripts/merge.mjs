// node merge.mjs <paperId> → merged/<paperId>.json：旧分析换上新 reasonZh/distractors，跑仓库校验和「必须讲」覆盖检查
import fs from 'node:fs'
const repo = '/home/user/english-question-bank'
const SP = process.env.LISTENING_TRIAL_DIR // 本地草稿目录：xinfa/papers/<卷>/ 和 listening/trial/
const T = `${SP}/listening/trial`
const { buildListeningAnalysisInput, validateListeningAnalysisInput } = await import(`${repo}/server/paper-import-ai/analyzeListening.mjs`)
const paperId = process.argv[2]
const base = `${SP}/xinfa/papers/${paperId}`
const j = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))
const old = j(`${base}/analyses/listening-analysis-v1.json`), out = j(`${T}/out/${paperId}.json`), req = j(`${T}/req/${paperId}.json`)
const merged = structuredClone(old)
const problems = []
const banned = /原词复现|张冠李戴|偷换概念|无中生有|与原文不符|原文未提及|本题询问|题目问|·/u
const han = (s) => (s.match(/\p{Script=Han}/gu) || []).length
let lens = []
for (const m of req.materials) for (const q of m.questions) {
  const n = out.questions[q.questionId]
  if (!n) { problems.push(`${q.questionNo} missing`); continue }
  merged.questions[q.questionId].reasonZh = n.reasonZh
  if (n.distractors?.length) merged.questions[q.questionId].distractors = n.distractors
  else delete merged.questions[q.questionId].distractors
  lens.push(han(n.reasonZh))
  for (const [l, w] of Object.entries(q.wrongOptions)) if (w.mustExplain && !n.distractors?.some((d) => d.label === l)) problems.push(`${q.questionNo}${l} mustExplain not covered`)
  for (const t of [n.reasonZh, ...(n.distractors || []).map((d) => d.explanationZh)]) if (banned.test(t)) problems.push(`${q.questionNo} banned: ${t.match(banned)[0]}`)
  if (!/选 ?[A-C]。?$/u.test(n.reasonZh.trim())) problems.push(`${q.questionNo} reason does not end with 选 X`)
}
const input = buildListeningAnalysisInput(j(`${base}/materialization.json`))
// 旧分析里有的录音稿落后于源稿（数据旧伤，不是本轮改的）：记下来，校验时用旧稿比，好检查其余项
for (const m of input.materials) if (old.materials[m.segmentId]?.transcript !== m.transcript) { console.log('pre-existing transcript drift', m.segmentId); m.transcript = old.materials[m.segmentId].transcript }
const r = validateListeningAnalysisInput(merged, input, { sealed: true })
fs.mkdirSync(`${T}/merged`, { recursive: true })
fs.writeFileSync(`${T}/merged/${paperId}.json`, JSON.stringify(merged, null, 2))
lens.sort((a, b) => a - b)
console.log(paperId, 'validator ok', 'warnings', (r?.warnings || []).length, 'reason han median', lens[lens.length >> 1], 'max', lens.at(-1),
  'distractors', Object.values(out.questions).reduce((s, q) => s + (q.distractors?.length || 0), 0))
console.log(problems.length ? problems.join('\n') : 'no problems')
