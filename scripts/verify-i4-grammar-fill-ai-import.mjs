// I4 grammar-fill AI import verifier
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseReadingCandidatesFromText, parseReadingDocxBuffer } from '../server/paper-import-ai/docxSplitter.mjs'
import { buildPaperImportAiPackageFiles } from '../server/paper-import-ai/packageBuilder.mjs'
import { validatePaperImportPackage } from '../server/paper-import/validator.mjs'
import { createPaperImportAiRoutes } from '../server/paper-import-ai/routes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
let passed = 0

function assert(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}${detail ? `\n${detail}` : ''}`)
  passed += 1
  console.log(`ok - ${name}`)
}

function assertRejects(name, fn, pattern) {
  return Promise.resolve().then(() => fn()).then(
    () => { throw new Error(`${name}\nexpected rejection`) },
    (error) => {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : error instanceof Error ? error.message : String(error)
      assert(name, pattern.test(message), message)
    },
  )
}

function readRepoFile(relPath) {
  return readFileSync(path.join(repoRoot, relPath), 'utf8')
}

function gitLines(args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n').map(l => l.trim()).filter(Boolean)
  } catch { return [] }
}

// ---- Allowed/forbidden scope ----

const ALLOWED_FILES = [
  'server/paper-import-ai/docxSplitter.mjs',
  'server/paper-import-ai/packageBuilder.mjs',
  'server/paper-import-ai/routes.mjs',
  'server/paper-import/publisher.mjs',
  'app/src/features/paper-intelligence/grammarFillPaperViewAdapter.ts',
  'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx',
  'app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx',
  'app/src/services/paperImportAi.ts',
  'scripts/verify-i4-grammar-fill-ai-import.mjs',
  'scripts/verify-i3-cloze-ai-import.mjs',
]

const FORBIDDEN_FILES = [
  'schemas/',
  'shared/papersurface/',
  'app/src/shared-ui/papersurface/',
]

function assertAllowedScope() {
  const changed = gitLines(['diff', '--name-only', 'HEAD'])
  const uncommitted = gitLines(['diff', '--name-only'])
  const allChanged = [...new Set([...changed, ...uncommitted])]
  for (const file of allChanged) {
    assert(`I4 changed file in allowed scope: ${file}`, ALLOWED_FILES.some(a => file === a || file.startsWith(a)))
  }
}

function assertForbiddenScope() {
  const changed = gitLines(['diff', '--name-only', 'HEAD'])
  const uncommitted = gitLines(['diff', '--name-only'])
  const allChanged = [...new Set([...changed, ...uncommitted])]
  for (const file of allChanged) {
    for (const forbid of FORBIDDEN_FILES) {
      assert(`I4 forbidden scope untouched: ${file}`, !file.startsWith(forbid))
    }
  }
}

// ---- Splitter: synthetic fixture ----

function gfFixtureText() {
  return `第三部分 语言运用
第一节 完形填空
阅读下面短文，从每题所给的A、B、C、D四个选项中选出最佳选项。
Passage with __41__ and __42__ __43__ __44__ __45__ __46__ __47__ __48__ __49__ __50__ __51__ __52__ __53__ __54__ __55__.
41. A. a B. b C. c D. d
42. A. a B. b C. c D. d
43. A. a B. b C. c D. d
44. A. a B. b C. c D. d
45. A. a B. b C. c D. d
46. A. a B. b C. c D. d
47. A. a B. b C. c D. d
48. A. a B. b C. c D. d
49. A. a B. b C. c D. d
50. A. a B. b C. c D. d
51. A. a B. b C. c D. d
52. A. a B. b C. c D. d
53. A. a B. b C. c D. d
54. A. a B. b C. c D. d
55. A. a B. b C. c D. d
第二节 语法填空
阅读下面短文，在空白处填入1个适当的单词或括号内单词的正确形式。
The Chinese garden is a landscape garden style which  56  (evolve) over three thousand years. It includes both the vast gardens  57  (build) by scholars. The  58  (early) gardens were created during the Shang Dynasty. These gardens were large parks  59  the kings hunted. A typical garden is enclosed  60  walls and includes ponds, rock works, trees and flowers,  61  (connect) by winding paths. By moving from structure to structure,  62  (visit) can view scenes. The earliest garden was in the Shang Dynasty,  63  the king built a garden. The design was to connect with nature, to come  64  to one's heart, and to come back to ancient idealism. Gardens are a shelter,  65  place to escape.
第四部分 写作
`
}

function assertSplitterFixture() {
  const answerText = `56. were worn 57. has given 58. over 59. what 60. attractions 61. adapted 62. gently 63. looking 64. a 65. where`
  const result = parseReadingCandidatesFromText(gfFixtureText(), {
    sourceFilename: 'i4-fixture.docx',
    answerKeyText: answerText,
    paperId: 'paper-i4-fixture',
  })

  assert('I4 fixture has grammar-fill group', result.grammarFillGroup !== null)
  const gf = result.grammarFillGroup
  assert('I4 grammar-fill has 10 questions', gf.questions.length === 10)
  assert('I4 grammar-fill has groupType grammarFill', gf.groupType === 'grammarFill')
  assert('I4 grammar-fill has paragraphs', gf.paragraphs.length > 0)
  assert('I4 grammar-fill has blankIds', gf.blankIds.length === 10)

  // Answers
  assert('I4 q56 answer extracted', gf.questions[0].answerKey === 'were worn')
  assert('I4 q65 answer extracted', gf.questions[9].answerKey === 'where')

  // Prompts
  const promptedQuestions = gf.questions.filter(q => q.prompt)
  assert('I4 prompts detected', promptedQuestions.length >= 2)
  assert('I4 q56 prompt is evolve', gf.questions[0].prompt === 'evolve')

  assert('I4 grammar-fill not in skipped', !result.skipped.some(s => s.reason.includes('grammar')))

  // Non-regression: other families still parse.
  assert('I4 fixture still has cloze', result.clozeGroup !== null)
  assert('I4 fixture cloze has 15 questions', result.clozeGroup.questions.length === 15)
}

// ---- Splitter: missing grammar-fill ----

function assertSplitterNoGrammarFill() {
  const text = `第一部分 听力\n第一节\n1. What time is it?\nA. 3:00. B. 4:00. C. 5:00.\n第二部分 阅读\n第一节\nA\nPassage text. 21. Question? A. a B. b C. c D. d\n22. Q? A. a B. b C. c D. d\nB\nPassage. 23. Q? A. a B. b C. c D. d\n24. Q? A. a B. b C. c D. d\nC\nPassage. 25. Q? A. a B. b C. c D. d\n26. Q? A. a B. b C. c D. d\nD\nPassage. 27. Q? A. a B. b C. c D. d\n28. Q? A. a B. b C. c D. d\n第四部分 写作\n`
  const result = parseReadingCandidatesFromText(text, {
    sourceFilename: 'no-gf.docx',
    paperId: 'paper-no-gf',
  })
  assert('paper without grammar-fill has null grammarFillGroup', result.grammarFillGroup === null)
  assert('paper without grammar-fill has null grammarFillError', result.grammarFillError === null)
}

// ---- Splitter: missing answers ----

function assertSplitterMissingAnswers() {
  const result = parseReadingCandidatesFromText(gfFixtureText(), {
    sourceFilename: 'i4-no-ans.docx',
    answerKeyText: '',
    paperId: 'paper-i4-no-ans',
  })
  const gf = result.grammarFillGroup
  assert('I4 missing answers: group still created', gf !== null)
  assert('I4 missing answers: all answers empty', gf.questions.every(q => !q.answerKey))
}

// ---- Package builder ----

function gfPackageFixture() {
  const sourceBuffer = Buffer.from('PK i4 package')
  const sourceHash = createHash('sha256').update(sourceBuffer).digest('hex')
  const paper = { paperId: 'paper-i4-pkg', sourceFilename: 'i4.docx', sourceHash, answerSourceFilename: 'i4-ans.docx' }
  return {
    sourceBuffer, sourceHash,
    parseResult: {
      paper,
      readingGroups: ['A','B','C','D'].map((l, i) => ({
        groupId: `group-i4-reading-${l.toLowerCase()}`,
        title: `Reading ${l}`, order: i,
        paragraphs: [{ id: `para-i4-${l.toLowerCase()}-p1`, text: `Reading ${l} text.` }],
        questions: [{ id: `q-i4-${String(21+i).padStart(3,'0')}`, stem: 'Q?', options:{A:'a',B:'b',C:'c',D:'d'}, answerKey: 'A' }],
      })),
      skipped: [],
      sevenChoicesGroup: {
        groupId: 'group-i4-seven-choices', groupType: 'sevenChoices', title: '七选五', order: 4,
        paragraphs: [{ id: 'para-i4-seven-p1', text: 'SC passage.' }],
        optionBank: ['A','B','C','D','E','F','G'].map(l => ({ label: l, text: `Option ${l}` })),
        questions: [36,37,38,39,40].map(n => ({
          id: `q-i4-${String(n).padStart(3,'0')}`, stem: String(n),
          answerKey: 'A', blankId: `blank-i4-${String(n).padStart(3,'0')}`,
        })),
        blankIds: [36,37,38,39,40].map(n => `blank-i4-${String(n).padStart(3,'0')}`),
      },
      clozeGroup: {
        groupId: 'group-i4-cloze', groupType: 'cloze', title: '完形填空', order: 5,
        paragraphs: [{ id: 'para-i4-cloze-p1', text: 'Cloze passage.' }],
        questions: [41,42,43,44,45,46,47,48,49,50,51,52,53,54,55].map(n => ({
          id: `q-i4-${String(n).padStart(3,'0')}`, stem: String(n),
          answerKey: 'B', blankId: `blank-i4-${String(n).padStart(3,'0')}`,
          options: { A:'a', B:'b', C:'c', D:'d' },
        })),
        blankIds: [41,42,43,44,45,46,47,48,49,50,51,52,53,54,55].map(n => `blank-i4-${String(n).padStart(3,'0')}`),
      },
      grammarFillGroup: {
        groupId: 'group-i4-grammar-fill', groupType: 'grammarFill', title: '语法填空', order: 6,
        paragraphs: [{ id: 'para-i4-gf-p1', text: 'Grammar fill passage with  56  and  57  .' }],
        questions: [56,57,58,59,60,61,62,63,64,65].map(n => ({
          id: `q-i4-${String(n).padStart(3,'0')}`, stem: String(n),
          answerKey: 'word', blankId: `blank-i4-${String(n).padStart(3,'0')}`,
          prompt: n === 56 ? 'be' : null,
        })),
        blankIds: [56,57,58,59,60,61,62,63,64,65].map(n => `blank-i4-${String(n).padStart(3,'0')}`),
      },
    },
    readingAnalyses: Object.fromEntries(['A','B','C','D'].map((l) => {
      const gid = `group-i4-reading-${l.toLowerCase()}`
      return [gid, {
        schemaVersion: 'reading-choice-analysis-v1', paperId: 'paper-i4-pkg', sourceAssetVersion: 1,
        targetGroups: [gid], meta: { generatedBy: 'stub', model: 'stub', promptVersion: 'reading-choice-analysis-v1', reviewStatus: 'reviewed' },
        groups: { [gid]: { overview: `Reading ${l}.` } },
        questions: Object.fromEntries([{ id: `q-i4-${String(21+['A','B','C','D'].indexOf(l)).padStart(3,'0')}`, skill: { primary: 'detail' }, questionFocus: 'Q?', stemTranslationZh: '?', optionAnalysis: ['A','B','C','D'].map(x => ({ label: x, optionTranslationZh: x, status: x === 'A' ? 'correct' : 'wrong' })), locationParaphrases: [] }].map(q => [q.id, q])),
      }]
    })),
    scAnalysis: {
      schemaVersion: 'seven-choices-analysis-v1', paperId: 'paper-i4-pkg', sourceAssetVersion: 1,
      targetGroups: ['group-i4-seven-choices'], meta: { generatedBy: 'stub' },
      groups: { 'group-i4-seven-choices': { overview: 'SC.' } },
      questions: Object.fromEntries([36,37,38,39,40].map(n => [`q-i4-${String(n).padStart(3,'0')}`, { optionFit: { correctOptionLabel: 'A' } }])),
    },
  }
}

function assertPackageBuilder() {
  const fix = gfPackageFixture()
  fix.parseResult.paper.sourceHash = fix.sourceHash

  // Success: package with all four families.
  const files = buildPaperImportAiPackageFiles({
    parseResult: fix.parseResult,
    analysesByGroupId: fix.readingAnalyses,
    sevenChoicesGroup: fix.parseResult.sevenChoicesGroup,
    sevenChoicesAnalysis: fix.scAnalysis,
    clozeGroup: fix.parseResult.clozeGroup,
    grammarFillGroup: fix.parseResult.grammarFillGroup,
    sourceDocx: { fileName: 'i4.docx', buffer: fix.sourceBuffer },
  })
  const validation = validatePaperImportPackage(files)
  assert('I4 package passes C7 validator', validation.ok, JSON.stringify(validation.blockingIssues, null, 2))

  const asset = JSON.parse(files.find(f => f.fileName === 'paper-asset.json').buffer.toString())
  const gfGroupInAsset = Object.values(asset.content.groups).find(g => g.groupType === 'grammarFill')
  assert('I4 paper asset includes grammar-fill group', Boolean(gfGroupInAsset))
  assert('I4 grammar-fill group has 10 questionIds', gfGroupInAsset.questionIds.length === 10)
  assert('I4 grammar-fill group has passage paragraphs', (gfGroupInAsset.passage?.paragraphs || []).length > 0)
  assert('I4 grammar-fill group in layout tree', asset.layoutTree.parts.some(p => p.sections.some(s => s.groups.some(g => g.groupId === 'group-i4-grammar-fill'))))
  assert('I4 content.blanks populated', Object.keys(asset.content.blanks || {}).length >= 10)
  assert('I4 no grammar-fill analysis file', !files.some(f => f.fileName.includes('grammar-fill-analysis')))

  // Check blank with prompt.
  const blank56 = asset.content.blanks['blank-i4-056']
  assert('I4 blank 56 has prompt', blank56 && blank56.prompt === 'be')

  // Check import-meta includes grammar-fill.
  const importMeta = JSON.parse(files.find(f => f.fileName === 'import-meta.json').buffer.toString())
  assert('I4 import-meta has grammar-fill group', Boolean(importMeta.groups['group-i4-grammar-fill']))
  assert('I4 import-meta grammar-fill tags', importMeta.groups['group-i4-grammar-fill'].tags.includes('语法填空'))

  // Block: missing grammar-fill family.
  assertRejects('I4 blocks on missing grammar-fill family', () =>
    buildPaperImportAiPackageFiles({
      parseResult: { ...fix.parseResult, grammarFillGroup: null },
      analysesByGroupId: fix.readingAnalyses,
      sevenChoicesGroup: fix.parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: fix.scAnalysis,
      clozeGroup: fix.parseResult.clozeGroup,
      grammarFillGroup: null,
      sourceDocx: { fileName: 'i4.docx', buffer: fix.sourceBuffer },
    }),
  /缺少语法填空/)

  // Block: missing grammar-fill answer.
  const noAnsGf = JSON.parse(JSON.stringify(fix.parseResult.grammarFillGroup))
  noAnsGf.questions[0].answerKey = ''
  assertRejects('I4 blocks on missing grammar-fill answer', () =>
    buildPaperImportAiPackageFiles({
      parseResult: { ...fix.parseResult, grammarFillGroup: noAnsGf },
      analysesByGroupId: fix.readingAnalyses,
      sevenChoicesGroup: fix.parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: fix.scAnalysis,
      clozeGroup: fix.parseResult.clozeGroup,
      grammarFillGroup: noAnsGf,
      sourceDocx: { fileName: 'i4.docx', buffer: fix.sourceBuffer },
    }),
  /缺少答案解析版答案/)

  // Block: wrong blank count.
  const wrongCountGf = JSON.parse(JSON.stringify(fix.parseResult.grammarFillGroup))
  wrongCountGf.questions = wrongCountGf.questions.slice(0, 8)
  assertRejects('I4 blocks on wrong blank count', () =>
    buildPaperImportAiPackageFiles({
      parseResult: { ...fix.parseResult, grammarFillGroup: wrongCountGf },
      analysesByGroupId: fix.readingAnalyses,
      sevenChoicesGroup: fix.parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: fix.scAnalysis,
      clozeGroup: fix.parseResult.clozeGroup,
      grammarFillGroup: wrongCountGf,
      sourceDocx: { fileName: 'i4.docx', buffer: fix.sourceBuffer },
    }),
  /语法填空应为 10 题/)
}

// ---- Route / service ----

function assertRouteContract() {
  const routes = createPaperImportAiRoutes()
  assert('I4 publish route registered', routes.some(r => r.method === 'POST' && r.pattern.test('/api/paper-import-ai/publish')))

  const routeSource = readRepoFile('server/paper-import-ai/routes.mjs')
  assert('I4 route passes grammarFillGroup to package builder', routeSource.includes('grammarFillGroup'))

  const serviceSource = readRepoFile('app/src/services/paperImportAi.ts')
  assert('I4 service has grammarFill group type', serviceSource.includes('PaperImportAiGrammarFillGroup'))
  assert('I4 service passes grammarFillGroup to publish', serviceSource.includes('grammarFillGroup: input.grammarFillGroup'))

  const pageSource = readRepoFile('app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx')
  assert('I4 page shows grammar-fill panel', pageSource.includes('语法填空 预览'))
  assert('I4 page requires grammar-fill before publish', pageSource.includes('gfReady') && pageSource.includes('缺少语法填空，暂不保存'))
  assert('I4 page requires seven-choices before publish', pageSource.includes('scReady') && pageSource.includes('缺少七选五，暂不保存'))
  assert('I4 page requires cloze before publish', pageSource.includes('clReady') && pageSource.includes('缺少完形填空，暂不保存'))

  try {
    readFileSync(path.join(repoRoot, 'app/src/features/paper-intelligence/grammarFillPaperViewAdapter.ts'))
    assert('I4 grammar-fill adapter file exists', true)
  } catch {
    assert('I4 grammar-fill adapter file exists', false)
  }

  const harnessSource = readRepoFile('app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx')
  assert('I4 harness imports grammar-fill adapter', harnessSource.includes('grammarFillPaperViewAdapter'))
  assert('I4 harness routes grammar-fill groups', harnessSource.includes("groupType === 'grammarFill'"))

  const publisherSource = readRepoFile('server/paper-import/publisher.mjs')
  assert('I4 publisher has getGrammarFillGroups', publisherSource.includes('getGrammarFillGroups'))
}

// ---- Real DOCX ----

async function assertRealDocx() {
  const paperPath = '/Users/huangxuewei/Desktop/26年3月高三试卷/26.3四川成都七中高三二诊英语试卷.docx'
  const answerPath = '/Users/huangxuewei/Desktop/26年3月高三试卷/26.3四川成都七中高三二诊英语答案解析.docx'
  let paperBuf, answerBuf
  try {
    paperBuf = readFileSync(paperPath)
    answerBuf = readFileSync(answerPath)
  } catch {
    console.log('(skipping real DOCX tests — files not found)')
    return
  }

  const result = await parseReadingDocxBuffer(paperBuf, {
    sourceFilename: '26.3四川成都七中高三二诊英语试卷.docx',
    answerKeyBuffer: answerBuf,
    answerSourceFilename: '26.3四川成都七中高三二诊英语答案解析.docx',
  })

  assert('I4 real DOCX: grammar-fill group found', result.grammarFillGroup !== null)
  const gf = result.grammarFillGroup
  assert('I4 real DOCX: 10 questions', gf.questions.length === 10)
  assert('I4 real DOCX: all answers present', gf.questions.every(q => q.answerKey))
  assert('I4 real DOCX: has passage text', gf.paragraphs.length > 0)
}

// ---- Main ----

async function main() {
  assertAllowedScope()
  assertForbiddenScope()
  assertSplitterFixture()
  assertSplitterNoGrammarFill()
  assertSplitterMissingAnswers()
  assertPackageBuilder()
  assertRouteContract()
  await assertRealDocx()

  console.log(`\nI4 grammar-fill AI import verify PASSED: ${passed} checks`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
