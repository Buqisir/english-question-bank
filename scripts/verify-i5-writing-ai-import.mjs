// I5 writing AI import verifier
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseReadingCandidatesFromText, parseReadingDocxBuffer } from '../server/paper-import-ai/docxSplitter.mjs'
import { buildPaperImportAiPackageFiles } from '../server/paper-import-ai/packageBuilder.mjs'
import { validatePaperImportPackage } from '../server/paper-import/validator.mjs'
import { createPaperImportAiRoutes } from '../server/paper-import-ai/routes.mjs'
import { publishPaperImportPackage } from '../server/paper-import/publisher.mjs'
import { DatabaseSync } from 'node:sqlite'

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

// ---- Splitter: synthetic fixture ----

function writingFixtureText() {
  return `第二部分 阅读
第一节
A
Passage text. 21. Question? A. a B. b C. c D. d
22. Q? A. a B. b C. c D. d
B
Passage. 23. Q? A. a B. b C. c D. d
24. Q? A. a B. b C. c D. d
C
Passage. 25. Q? A. a B. b C. c D. d
26. Q? A. a B. b C. c D. d
D
Passage. 27. Q? A. a B. b C. c D. d
28. Q? A. a B. b C. c D. d
第二节 七选五
Passage with __36__ and __37__ __38__ __39__ __40__.
A. Option A
B. Option B
C. Option C
D. Option D
E. Option E
F. Option F
G. Option G
第三部分 语言运用
第一节
完形填空 passage with __41__ __42__ __43__ __44__ __45__ __46__ __47__ __48__ __49__ __50__ __51__ __52__ __53__ __54__ __55__.
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
Grammar fill passage with  56  and  57  .
第四部分 写作
第一节
你校英语杂志社正在举办征文活动。请你写一篇短文投稿，内容包括：
1. 描述活动内容；
2. 谈谈你的看法。
注意：
1. 写作词数为80个左右；
2. 请按照如下格式在答题卡的相应位置作答。
第二节
阅读下面材料，根据其内容和所给段落开头语续写两段，使之构成一篇完整的短文。
Studying abroad in Canada, I never thought that the small chopsticks would become a unique barrier.
For a Chinese student, using chopsticks to eat is the most natural thing.
During a group dinner, everyone sat around the restaurant.
After that, when facing others' curiosity about chopsticks, I lost the initial enthusiasm.
注意：
1. 续写词数应为150左右；
2. 请按如下格式在答题卡的相应位置作答。
Until one day, the school held an international cultural festival.
I started to patiently explain how to hold chopsticks and what they symbolise.
`
}

function assertSplitterFixture() {
  const result = parseReadingCandidatesFromText(writingFixtureText(), {
    sourceFilename: 'i5-fixture.docx',
    paperId: 'paper-i5-fixture',
  })

  assert('I5 fixture has application group', result.applicationGroup !== null)
  const app = result.applicationGroup
  assert('I5 application groupType is writing', app.groupType === 'writing')
  assert('I5 application has paragraphs', app.paragraphs.length > 0)
  assert('I5 application title', app.title === '应用文写作')
  assert('I5 application has empty questions', app.questions.length === 0)
  assert('I5 application content includes scenario', app.paragraphs.some(p => /征文/.test(p.text)))

  assert('I5 fixture has continuation group', result.continuationGroup !== null)
  const cont = result.continuationGroup
  assert('I5 continuation groupType is writing', cont.groupType === 'writing')
  assert('I5 continuation has paragraphs', cont.paragraphs.length > 0)
  assert('I5 continuation has 2 starters', cont.continuationStarters && cont.continuationStarters.length === 2)
  assert('I5 continuation starters content', cont.continuationStarters[0].includes('Until one day'))
  assert('I5 continuation starters content 2', cont.continuationStarters[1].includes('I started'))

  assert('I5 application not in skipped', !result.skipped.some(s => s.reason.includes('writing')))
  assert('I5 no application error', result.applicationError === null)
  assert('I5 no continuation error when 2 starters', !result.continuationError || result.continuationError.reason !== 'continuation_starters_missing')
}

// ---- Splitter: missing writing ----

function assertSplitterNoWriting() {
  const text = `第二部分 阅读\n第一节\nA\nPassage text. 21. Question? A. a B. b C. c D. d\nB\nPassage. 23. Q? A. a B. b C. c D. d\nC\nPassage. 25. Q? A. a B. b C. c D. d\nD\nPassage. 27. Q? A. a B. b C. c D. d`
  const result = parseReadingCandidatesFromText(text, {
    sourceFilename: 'no-writing.docx',
    paperId: 'paper-no-writing',
  })
  assert('paper without writing has null applicationGroup', result.applicationGroup === null)
  assert('paper without writing has null continuationGroup', result.continuationGroup === null)
}

function assertSplitterMissingContinuation() {
  const text = `第二部分 阅读\n第一节\nA\nPassage text. 21. Question? A. a B. b C. c D. d\nB\nPassage. 23. Q? A. a B. b C. c D. d\nC\nPassage. 25. Q? A. a B. b C. c D. d\nD\nPassage. 27. Q? A. a B. b C. c D. d\n第四部分 写作\n第一节\n你校英语杂志社正在举办征文活动。请你写一篇短文投稿。\n注意：\n1. 写作词数为80个左右；`
  const result = parseReadingCandidatesFromText(text, {
    sourceFilename: 'app-only.docx',
    paperId: 'paper-app-only',
  })
  assert('app-only paper has application group', result.applicationGroup !== null)
  assert('app-only paper has null continuationGroup', result.continuationGroup === null)
  assert('app-only paper has continuation error', result.continuationError !== null && result.continuationError.reason === 'continuation_section_not_found')
}

function assertSplitterMissingStarters() {
  const text = `第四部分 写作\n第一节\n你校英语杂志社正在举办征文活动。请你写一篇短文投稿。\n注意：\n1. 写作词数为80个左右；\n第二节\n阅读下面材料，根据其内容和所给段落开头语续写两段。\nStudying abroad in Canada.\nFor a Chinese student, using chopsticks.\n注意：\n1. 续写词数应为150左右；\n2. 请按如下格式在答题卡的相应位置作答。`
  const result = parseReadingCandidatesFromText(text, {
    sourceFilename: 'no-starters.docx',
    paperId: 'paper-no-starters',
  })
  assert('no-starters has continuation group', result.continuationGroup !== null)
  assert('no-starters has 0 starters', result.continuationGroup.continuationStarters.length === 0)
  assert('no-starters has starters error', result.continuationError !== null && result.continuationError.reason === 'continuation_starters_missing')
}

// ---- Package builder ----

function i5PackageFixture() {
  const sourceBuffer = Buffer.from('PK i5 package')
  const sourceHash = createHash('sha256').update(sourceBuffer).digest('hex')
  const paper = { paperId: 'paper-i5-pkg', sourceFilename: 'i5.docx', sourceHash, answerSourceFilename: 'i5-ans.docx' }

  const readingGroups = ['A','B','C','D'].map((l, i) => ({
    groupId: `group-i5-reading-${l.toLowerCase()}`,
    title: `Reading ${l}`, order: i,
    paragraphs: [{ id: `para-i5-${l.toLowerCase()}-p1`, text: `Reading ${l} text.` }],
    questions: [{ id: `q-i5-${String(21+i).padStart(3,'0')}`, stem: 'Q?', options:{A:'a',B:'b',C:'c',D:'d'}, answerKey: 'A' }],
  }))

  const readingAnalyses = Object.fromEntries(['A','B','C','D'].map((l) => {
    const gid = `group-i5-reading-${l.toLowerCase()}`
    return [gid, {
      schemaVersion: 'reading-choice-analysis-v1', paperId: 'paper-i5-pkg', sourceAssetVersion: 1,
      targetGroups: [gid], meta: { generatedBy: 'stub' },
      groups: { [gid]: { overview: `Reading ${l}.` } },
      questions: Object.fromEntries([{
        id: `q-i5-${String(21+['A','B','C','D'].indexOf(l)).padStart(3,'0')}`,
        skill: { primary: 'detail' }, questionFocus: 'Q?', stemTranslationZh: '?',
        optionAnalysis: ['A','B','C','D'].map(x => ({ label: x, optionTranslationZh: x, status: x === 'A' ? 'correct' : 'wrong' })),
        locationParaphrases: [],
      }].map(q => [q.id, q])),
    }]
  }))

  return {
    sourceBuffer, sourceHash, paper, readingGroups, readingAnalyses,
    parseResult: {
      paper,
      readingGroups,
      skipped: [],
      sevenChoicesGroup: {
        groupId: 'group-i5-seven-choices', groupType: 'sevenChoices', title: '七选五', order: 4,
        paragraphs: [{ id: 'para-i5-seven-p1', text: 'SC passage.' }],
        optionBank: ['A','B','C','D','E','F','G'].map(l => ({ label: l, text: `Option ${l}` })),
        questions: [36,37,38,39,40].map(n => ({
          id: `q-i5-${String(n).padStart(3,'0')}`, stem: String(n),
          answerKey: 'A', blankId: `blank-i5-${String(n).padStart(3,'0')}`,
        })),
        blankIds: [36,37,38,39,40].map(n => `blank-i5-${String(n).padStart(3,'0')}`),
      },
      clozeGroup: {
        groupId: 'group-i5-cloze', groupType: 'cloze', title: '完形填空', order: 5,
        paragraphs: [{ id: 'para-i5-cloze-p1', text: 'Cloze passage.' }],
        questions: [41,42,43,44,45,46,47,48,49,50,51,52,53,54,55].map(n => ({
          id: `q-i5-${String(n).padStart(3,'0')}`, stem: String(n),
          answerKey: 'B', blankId: `blank-i5-${String(n).padStart(3,'0')}`,
          options: { A:'a', B:'b', C:'c', D:'d' },
        })),
        blankIds: [41,42,43,44,45,46,47,48,49,50,51,52,53,54,55].map(n => `blank-i5-${String(n).padStart(3,'0')}`),
      },
      grammarFillGroup: {
        groupId: 'group-i5-grammar-fill', groupType: 'grammarFill', title: '语法填空', order: 6,
        paragraphs: [{ id: 'para-i5-gf-p1', text: 'Grammar fill passage with  56  and  57  .' }],
        questions: [56,57,58,59,60,61,62,63,64,65].map(n => ({
          id: `q-i5-${String(n).padStart(3,'0')}`, stem: String(n),
          answerKey: 'word', blankId: `blank-i5-${String(n).padStart(3,'0')}`,
        })),
        blankIds: [56,57,58,59,60,61,62,63,64,65].map(n => `blank-i5-${String(n).padStart(3,'0')}`),
      },
      applicationGroup: {
        groupId: 'group-i5-writing-application', groupType: 'writing', title: '应用文写作', order: 7,
        paragraphs: [{ id: 'para-i5-app-p1', text: '你校英语杂志社正在举办征文活动。请你写一篇短文投稿。' }],
        questions: [],
      },
      continuationGroup: {
        groupId: 'group-i5-writing-continuation', groupType: 'writing', title: '读后续写', order: 8,
        paragraphs: [
          { id: 'para-i5-cont-p1', text: 'Studying abroad in Canada, I never thought that chopsticks would become a barrier.' },
        ],
        continuationStarters: ['Until one day, the school held an international cultural festival.', 'I started to patiently explain.'],
        questions: [],
      },
    },
    scAnalysis: {
      schemaVersion: 'seven-choices-analysis-v1', paperId: 'paper-i5-pkg', sourceAssetVersion: 1,
      targetGroups: ['group-i5-seven-choices'], meta: { generatedBy: 'stub' },
      groups: { 'group-i5-seven-choices': { overview: 'SC.' } },
      questions: Object.fromEntries([36,37,38,39,40].map(n => [`q-i5-${String(n).padStart(3,'0')}`, { optionFit: { correctOptionLabel: 'A' } }])),
    },
    clozeAnalysis: {
      schemaVersion: 'cloze-analysis-v1', paperId: 'paper-i5-pkg', sourceAssetVersion: 1,
      targetGroups: ['group-i5-cloze'], meta: { generatedBy: 'stub', model: 'stub', promptVersion: 'cloze-analysis-v1', reviewStatus: 'reviewed' },
      groups: { 'group-i5-cloze': { overview: '完形填空概览。', affectiveArc: '平静。' } },
      blanks: Object.fromEntries([41,42,43,44,45,46,47,48,49,50,51,52,53,54,55].map(n => [`q-i5-${String(n).padStart(3,'0')}`, {
        blankId: `blank-i5-${String(n).padStart(3,'0')}`, blankNo: n, pos: 'verb',
        correctFit: { optionLabel: 'B', reason: '搭配合理。' },
        distractorGlosses: ['A','C','D'].map(l => ({ optionLabel: l, optionText: l === 'A' ? 'a' : l === 'C' ? 'c' : 'd', meaning: `表示"${l}"。` })),
        evidence: [{ type: 'collocation-partner', signalText: 'Cloze passage', signalSide: 'context-before', relation: '话题词呼应。' }],
        teachingNote: '通过施受关系判断。',
      }])),
    },
  }
}

function i5MinimalGrammarFillAnalysis(fix) {
  const gf = fix.parseResult.grammarFillGroup
  return {
    schemaVersion: 'grammar-fill-analysis-v1',
    paperId: fix.parseResult.paper.paperId,
    sourceAssetVersion: 1,
    targetGroups: [gf.groupId],
    meta: { generatedBy: 'stub', model: 'stub', promptVersion: 'grammar-fill-analysis-v1', reviewStatus: 'reviewed' },
    groups: { [gf.groupId]: { overview: '语法填空概览。' } },
    blanks: Object.fromEntries(gf.questions.map((q) => [
      q.id,
      {
        blankId: q.blankId, blankNo: Number(q.stem),
        blankType: 'no-hint', hint: null,
        facetKey: 'grammar-fill.no-hint.preposition',
        answer: q.answerKey,
        role: null, path: null,
        reason: '介词填空示例。',
        evidence: [{ type: 'governing-word', signalText: 'Grammar fill passage', signalSide: 'passage', relation: '示例证据。' }],
        teachingNote: '通过搭配判断介词。',
      },
    ])),
  }
}

function assertPackageBuilder() {
  const fix = i5PackageFixture()
  fix.parseResult.paper.sourceHash = fix.sourceHash
  const grammarFillAnalysis = i5MinimalGrammarFillAnalysis(fix)

  // Success: package with all six families.
  const files = buildPaperImportAiPackageFiles({
    parseResult: fix.parseResult,
    analysesByGroupId: fix.readingAnalyses,
    sevenChoicesGroup: fix.parseResult.sevenChoicesGroup,
    sevenChoicesAnalysis: fix.scAnalysis,
    clozeGroup: fix.parseResult.clozeGroup,
    clozeAnalysis: fix.clozeAnalysis,
    grammarFillGroup: fix.parseResult.grammarFillGroup,
    grammarFillAnalysis,
    applicationGroup: fix.parseResult.applicationGroup,
    continuationGroup: fix.parseResult.continuationGroup,
    sourceDocx: { fileName: 'i5.docx', buffer: fix.sourceBuffer },
  })
  const validation = validatePaperImportPackage(files)
  assert('I5 package passes C7 validator', validation.ok, JSON.stringify(validation.blockingIssues, null, 2))

  const asset = JSON.parse(files.find(f => f.fileName === 'paper-asset.json').buffer.toString())

  // Writing groups.
  const writingGroups = Object.values(asset.content.groups).filter(g => g.groupType === 'writing')
  assert('I5 paper asset has 2 writing groups', writingGroups.length === 2)

  const appGroup = writingGroups.find(g => g.title === '应用文写作')
  assert('I5 application group in asset', Boolean(appGroup))
  assert('I5 application has zero questionIds', appGroup.questionIds.length === 0)
  assert('I5 application has writingTaskId', Boolean(appGroup.writingTaskId))
  assert('I5 application has passage', (appGroup.passage?.paragraphs || []).length > 0)

  const contGroup = writingGroups.find(g => g.title === '读后续写')
  assert('I5 continuation group in asset', Boolean(contGroup))
  assert('I5 continuation has zero questionIds', contGroup.questionIds.length === 0)
  assert('I5 continuation has writingTaskId', Boolean(contGroup.writingTaskId))

  // Writing tasks.
  const writingTasks = asset.content.writingTasks || {}
  assert('I5 has 2 writingTasks', Object.keys(writingTasks).length === 2)
  const appTask = Object.values(writingTasks).find(t => t.taskType === 'application')
  assert('I5 application writingTask', Boolean(appTask))
  assert('I5 application wordCountTarget', appTask.wordCountTarget === 80)
  const contTask = Object.values(writingTasks).find(t => t.taskType === 'continuation')
  assert('I5 continuation writingTask', Boolean(contTask))
  assert('I5 continuation has 2 starters', contTask.continuationStarters.length === 2)
  assert('I5 continuation wordCountTarget', contTask.wordCountTarget === 150)

  // answerBox blocks.
  const answerBoxes = asset.content.blocks.filter(b => b.type === 'answerBox')
  assert('I5 has 2 answerBox blocks', answerBoxes.length === 2)
  assert('I5 answerBox has writingTaskId', answerBoxes.every(b => Boolean(b.writingTaskId)))

  // Layout tree.
  const writingPart = asset.layoutTree.parts.find(p => /writing/.test(p.partId))
  assert('I5 layout tree has writing part', Boolean(writingPart))
  assert('I5 writing part has 2 sections', writingPart.sections.length === 2)
  assert('I5 writing app section', writingPart.sections.some(s => /application/.test(s.sectionId)))
  assert('I5 writing cont section', writingPart.sections.some(s => /continuation/.test(s.sectionId)))

  // Content blocks include writing section headings.
  const blockTexts = asset.content.blocks.map(b => b.text || '').join(' ')
  assert('I5 blocks include writing part heading', /第四部分/.test(blockTexts))
  assert('I5 blocks include application heading', /第一节/.test(blockTexts))
  assert('I5 blocks include continuation heading', /第二节/.test(blockTexts))

  // Import meta.
  const importMeta = JSON.parse(files.find(f => f.fileName === 'import-meta.json').buffer.toString())
  assert('I5 import-meta has application group', Boolean(importMeta.groups['group-i5-writing-application']))
  assert('I5 import-meta app tags', importMeta.groups['group-i5-writing-application'].tags.includes('应用文写作'))
  assert('I5 import-meta cont group', Boolean(importMeta.groups['group-i5-writing-continuation']))
  assert('I5 import-meta cont tags', importMeta.groups['group-i5-writing-continuation'].tags.includes('读后续写'))

  // Block: missing application.
  assertRejects('I5 blocks on missing application', () =>
    buildPaperImportAiPackageFiles({
      parseResult: fix.parseResult,
      analysesByGroupId: fix.readingAnalyses,
      sevenChoicesGroup: fix.parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: fix.scAnalysis,
      clozeGroup: fix.parseResult.clozeGroup,
      clozeAnalysis: fix.clozeAnalysis,
      grammarFillGroup: fix.parseResult.grammarFillGroup,
      grammarFillAnalysis,
      applicationGroup: null,
      continuationGroup: fix.parseResult.continuationGroup,
      sourceDocx: { fileName: 'i5.docx', buffer: fix.sourceBuffer },
    }),
  /缺少应用文写作/)

  // Block: missing continuation.
  assertRejects('I5 blocks on missing continuation', () =>
    buildPaperImportAiPackageFiles({
      parseResult: fix.parseResult,
      analysesByGroupId: fix.readingAnalyses,
      sevenChoicesGroup: fix.parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: fix.scAnalysis,
      clozeGroup: fix.parseResult.clozeGroup,
      clozeAnalysis: fix.clozeAnalysis,
      grammarFillGroup: fix.parseResult.grammarFillGroup,
      grammarFillAnalysis,
      applicationGroup: fix.parseResult.applicationGroup,
      continuationGroup: null,
      sourceDocx: { fileName: 'i5.docx', buffer: fix.sourceBuffer },
    }),
  /缺少读后续写/)

  // Block: missing continuation starters.
  const noStarters = JSON.parse(JSON.stringify(fix.parseResult.continuationGroup))
  noStarters.continuationStarters = ['Only one starter']
  assertRejects('I5 blocks on missing starters', () =>
    buildPaperImportAiPackageFiles({
      parseResult: { ...fix.parseResult, continuationGroup: noStarters },
      analysesByGroupId: fix.readingAnalyses,
      sevenChoicesGroup: fix.parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: fix.scAnalysis,
      clozeGroup: fix.parseResult.clozeGroup,
      clozeAnalysis: fix.clozeAnalysis,
      grammarFillGroup: fix.parseResult.grammarFillGroup,
      grammarFillAnalysis,
      applicationGroup: fix.parseResult.applicationGroup,
      continuationGroup: noStarters,
      sourceDocx: { fileName: 'i5.docx', buffer: fix.sourceBuffer },
    }),
  /缺少段落开头语/)
}

// ---- Route / service ----

function assertRouteContract() {
  const routes = createPaperImportAiRoutes()
  assert('I5 publish route registered', routes.some(r => r.method === 'POST' && r.pattern.test('/api/paper-import-ai/publish')))

  const routeSource = readRepoFile('server/paper-import-ai/routes.mjs')
  assert('I5 route passes applicationGroup to package builder', routeSource.includes('applicationGroup'))
  assert('I5 route passes continuationGroup to package builder', routeSource.includes('continuationGroup'))

  const serviceSource = readRepoFile('app/src/services/paperImportAi.ts')
  assert('I5 service has PaperImportAiWritingGroup type', serviceSource.includes('PaperImportAiWritingGroup'))
  assert('I5 service has applicationGroup in parse result', serviceSource.includes('applicationGroup: PaperImportAiWritingGroup'))
  assert('I5 service passes applicationGroup to publish', serviceSource.includes('applicationGroup: input.applicationGroup'))
  assert('I5 service passes continuationGroup to publish', serviceSource.includes('continuationGroup: input.continuationGroup'))

  const pageSource = readRepoFile('app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx')
  assert('I5 page shows application status', pageSource.includes('应用文就绪') && pageSource.includes('缺应用文写作'))
  assert('I5 page shows continuation status', pageSource.includes('读后续写就绪') && pageSource.includes('缺读后续写'))
  assert('I5 page requires application before publish', pageSource.includes('appReady'))
  assert('I5 page requires continuation before publish', pageSource.includes('contReady'))

  assert('I5 writing adapter file exists', existsSync(path.join(repoRoot, 'app/src/features/paper-intelligence/writingPaperViewAdapter.ts')))

  const harnessSource = readRepoFile('app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx')
  assert('I5 harness imports writing adapter', harnessSource.includes('writingPaperViewAdapter'))
  assert('I5 harness routes writing groups', harnessSource.includes("groupType === 'writing'"))

  const publisherSource = readRepoFile('server/paper-import/publisher.mjs')
  assert('I5 publisher has getWritingGroups', publisherSource.includes('getWritingGroups'))
}

// ---- Publish path ----

async function assertPublishPath() {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-i5-publish-'))
  const dbPath = path.join(tempRoot, 'test.sqlite')
  const paperAssetsDir = path.join(tempRoot, 'paper-assets')
  mkdirSync(paperAssetsDir)
  const db = new DatabaseSync(dbPath)
  try {
    db.exec(readFileSync(path.join(repoRoot, 'data/sql/schema.sql'), 'utf8'))

    const fix = i5PackageFixture()
    fix.parseResult.paper.sourceHash = fix.sourceHash
    const grammarFillAnalysis = i5MinimalGrammarFillAnalysis(fix)
    const files = buildPaperImportAiPackageFiles({
      parseResult: fix.parseResult,
      analysesByGroupId: fix.readingAnalyses,
      sevenChoicesGroup: fix.parseResult.sevenChoicesGroup,
      sevenChoicesAnalysis: fix.scAnalysis,
      clozeGroup: fix.parseResult.clozeGroup,
      clozeAnalysis: fix.clozeAnalysis,
      grammarFillGroup: fix.parseResult.grammarFillGroup,
      grammarFillAnalysis,
      applicationGroup: fix.parseResult.applicationGroup,
      continuationGroup: fix.parseResult.continuationGroup,
      sourceDocx: { fileName: 'i5.docx', buffer: fix.sourceBuffer },
    })

    const result = publishPaperImportPackage({ files, db, paperAssetsDir })

    assert('I5 publish six-family package succeeds', result.ok, JSON.stringify(result, null, 2))
    assert(
      'I5 writing groups persisted at group_type writing',
      db.prepare("SELECT COUNT(*) AS count FROM question_groups WHERE group_type = 'writing'").get().count === 2,
    )
    const writingLinks = (result.publish?.qaLinks ?? []).filter(l => !l.latestHref.includes('questionId='))
    assert('I5 publish produces 2 writing QA links without questionId', writingLinks.length === 2)
    assert(
      'I5 writing QA links reference paper asset',
      writingLinks.every(l => l.latestHref.includes('source=paper-asset')),
    )
  } finally {
    db.close()
    rmSync(tempRoot, { recursive: true, force: true })
  }
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

  assert('I5 real DOCX: application group found', result.applicationGroup !== null)
  const app = result.applicationGroup
  assert('I5 real DOCX: application has paragraphs', app.paragraphs.length > 0)
  assert('I5 real DOCX: application has no questions', app.questions.length === 0)
  assert('I5 real DOCX: application title', app.title === '应用文写作')

  assert('I5 real DOCX: continuation group found', result.continuationGroup !== null)
  const cont = result.continuationGroup
  assert('I5 real DOCX: continuation has paragraphs', cont.paragraphs.length > 0)
  assert('I5 real DOCX: continuation has no questions', cont.questions.length === 0)
  assert('I5 real DOCX: continuation has 2 starters', cont.continuationStarters && cont.continuationStarters.length >= 2)
  assert('I5 real DOCX: continuation starters are English', cont.continuationStarters.every(s => /[A-Za-z]/.test(s)))
}

// ---- Main ----

async function main() {
  assertSplitterFixture()
  assertSplitterNoWriting()
  assertSplitterMissingContinuation()
  assertSplitterMissingStarters()
  assertPackageBuilder()
  assertRouteContract()
  await assertPublishPath()
  await assertRealDocx()

  console.log(`\nI5 writing AI import verify PASSED: ${passed} checks`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
