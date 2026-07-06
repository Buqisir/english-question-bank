#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseReadingCandidatesFromText, parseReadingDocxBuffer } from '../server/paper-import-ai/docxSplitter.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let passed = 0
const realDocxSummaries = []

function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`${name}${detail ? `\n${detail}` : ''}`)
  }
  passed += 1
  console.log(`ok - ${name}`)
}

function assertEqual(name, actual, expected) {
  assert(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function readRepoFile(relPath) {
  return readFileSync(path.join(repoRoot, relPath), 'utf8')
}

function gitLines(args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function gitStatusLines() {
  try {
    return execFileSync('git', ['status', '--short', '--untracked-files=all', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

function changedFiles() {
  const statusFiles = gitStatusLines().map((line) => {
    const file = line.slice(3)
    return file.includes(' -> ') ? file.split(' -> ').at(-1) : file
  })
  return [...new Set([...gitLines(['diff', '--name-only', 'github/main...HEAD']), ...gitLines(['diff', '--name-only']), ...statusFiles])]
}

function assertAllowedScope() {
  const allowed = new Set([
    '.gitignore',
    'app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx',
    'app/src/features/paper-import-ai/paperImportAiWorkbench.css',
    'app/src/features/paper-intelligence/PaperIntelligencePaperSurfaceHarness.tsx',
    'app/src/features/paper-intelligence/grammarFillPaperViewAdapter.ts',
    'app/src/services/paperImportAi.ts',
    'docs/cuts/I2-seven-choices-ai-import/agent-entrypoint.md',
    'docs/cuts/I2-seven-choices-ai-import/plan.md',
    'server/api.mjs',
    'server/ai-providers/chatCompletions.mjs',
    'server/ai-providers/deepseek.mjs',
    'server/ai-providers/gptRelay.mjs',
    'server/package.json',
    'server/package-lock.json',
    'server/paper-import/publisher.mjs',
    'server/paper-import/storage.mjs',
    'server/paper-import/validator.mjs',
    'server/paper-import-ai/analyzeReading.mjs',
    'server/paper-import-ai/analyzeSevenChoices.mjs',
    'server/paper-import-ai/docxSplitter.mjs',
    'server/paper-import-ai/packageBuilder.mjs',
    'server/paper-import-ai/routes.mjs',
    'scripts/README.md',
    'scripts/verify-c7-paper-import-publish.mjs',
    'scripts/verify-ci.mjs',
    'scripts/verify-i1-paper-import-analysis.mjs',
    'scripts/verify-i1-paper-import-route.mjs',
    'scripts/verify-i1-paper-import-splitter.mjs',
    'scripts/verify-i2-seven-choices-ai-import.mjs',
    'scripts/verify-i3-cloze-ai-import.mjs',
    'scripts/verify-i4-grammar-fill-ai-import.mjs',
  ])
  const files = changedFiles()
  const scopeRelevantPrefixes = [
    'server/paper-import-ai/',
    'server/ai-providers/',
    'app/src/features/paper-import-ai/',
  ]
  const scopeRelevantFiles = new Set([
    'app/src/App.tsx',
    'app/src/services/paperImportAi.ts',
    'server/api.mjs',
    'server/package.json',
    'server/package-lock.json',
    'server/paper-import/publisher.mjs',
    'server/paper-import/storage.mjs',
    'server/paper-import/validator.mjs',
  ])
  const shouldCheckScope = files.some(
    (file) => scopeRelevantFiles.has(file) || scopeRelevantPrefixes.some((prefix) => file.startsWith(prefix)),
  )
  if (!shouldCheckScope) {
    assert('I1 Step 1 scope skipped for non-I1 diff', true)
    assert('I1 Step 1 forbidden scope skipped for non-I1 diff', true)
    return
  }
  const unexpected = files.filter((file) => !allowed.has(file))
  assert('I1 Step 1 changed files stay in the splitter whitelist', unexpected.length === 0, unexpected.join('\n'))

  const crossCutAllowed = new Set([
    'app/src/features/paper-intelligence/grammarFillPaperViewAdapter.ts',
  ])
  const forbidden = files.filter(
    (file) =>
      !crossCutAllowed.has(file) && (
        file.startsWith('prompts/') ||
        file.startsWith('shared/papersurface/') ||
        file.startsWith('app/src/domain/') ||
        file.startsWith('schemas/') ||
        file.endsWith('Adapter.ts')
      )
  )
  assert('I1 Step 1 forbidden scopes are untouched', forbidden.length === 0, forbidden.join('\n'))
}

function assertRouteContract() {
  const splitterSource = readRepoFile('server/paper-import-ai/docxSplitter.mjs')
  const packageJson = JSON.parse(readRepoFile('server/package.json'))

  assert('DOCX splitter uses mammoth raw-text extraction', splitterSource.includes('mammoth.extractRawText'))
  assert('server dependency declares mammoth', Boolean(packageJson.dependencies?.mammoth))
}

function fixtureText() {
  return `
第二部分 阅读理解
第一节
阅读下列短文，从每题所给的A、B、C、D四个选项中选出最佳选项。
A
Cloud farms can help small villages predict weather changes.
21. What does the village use to plan the harvest?
A. A notebook B. A weather app C. A city map D. A music lesson
B
Museum volunteers keep old letters safe for local families.
22. Why do the volunteers scan the letters?
A. To sell them B. To print posters C. To preserve them D. To change dates
C
A quiet library started lending tools on weekends.
23. What is special about the library?
A. It lends tools B. It closes early C. It grows apples D. It teaches driving
D
Students built a small bridge after testing several paper models.
24. What did the students do before building?
A. Bought tickets B. Tested models C. Painted walls D. Wrote songs
21-24 ABCD
第二节 七选五
阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项。选项中有两项为多余选项。
E. Keep one extra choice.
第三部分 语言运用
第一节 完形填空
`
}

function readingGroupText(readingGroups) {
  return JSON.stringify(readingGroups)
}

function assertTextFixture() {
  const result = parseReadingCandidatesFromText(fixtureText(), {
    sourceFilename: '2026-owner-sample.docx',
    paperId: 'paper-2026-owner-sample',
  })
  const labels = result.readingGroups.map((group) => group.title.replace('Reading ', '')).join('')
  const questions = result.readingGroups.flatMap((group) => group.questions)

  assertEqual('section heading fixture extracts A-D reading groups', labels, 'ABCD')
  assertEqual('section heading fixture extracts one question per reading group', questions.length, 4)
  assertEqual('section heading fixture applies ranged answer keys', questions.map((question) => question.answerKey).join(''), 'ABCD')
  assert('section heading fixture keeps A-D option objects', questions.every((question) => ['A', 'B', 'C', 'D'].every((label) => question.options[label])))
  assert(
    'later non-reading section does not leak into Reading D paragraphs',
    !result.readingGroups.at(-1).paragraphs.some((paragraph) => /七选五|语言运用|完形/.test(paragraph.text))
  )
  assert('later non-reading headings do not leak into reading group fields', !/第二节|第三部分/.test(readingGroupText(result.readingGroups)))
  assert(
    'seven choices section detected but missing option bank is observable',
    result.sevenChoicesError && result.sevenChoicesError.reason === 'seven_choices_missing_option_bank'
  )
  assert(
    'non-reading sections are recorded as skipped',
    result.skipped.some((entry) => entry.reason === 'grammar_or_language_out_of_scope_for_i1' || entry.reason === 'cloze_out_of_scope_for_i1')
  )

  const looseMarkerResult = parseReadingCandidatesFromText(
    `
21-24 BCDA
第二部分 阅读理解
A
Birding Road Tour offers transport and expert guiding for visitors.
21. What does Birding Road Tour offer?
A. Free transportation. B. Informative guiding. C Expert photo service. D Tailored travel routes.
B
The second passage has ordinary option punctuation.
22. What does the passage describe?
A. A writer. B. A driver. C. A swimmer. D. A painter.
C
The third passage uses a missing final option dot.
23. What is common among ordinary people?
A. Sleep tracking. B. Number games. C. Fitness tracking. D It guarantees performance.
D
The fourth passage has a missing C marker dot.
24. What does the scientist suggest?
A. Listen to physical signals. B. Predict responses from data. C Abandon devices. D. Set clear targets.
`,
    { sourceFilename: 'loose-option-markers.docx', paperId: 'paper-loose-option-markers' },
  )
  const looseQuestions = looseMarkerResult.readingGroups.flatMap((group) => group.questions)
  assertEqual('loose option marker fixture extracts all questions', looseQuestions.length, 4)
  assertEqual('loose option marker fixture applies answer range', looseQuestions.map((question) => question.answerKey).join(''), 'BCDA')
  assert('loose option marker fixture keeps missing-dot C option', looseQuestions[0].options.C === 'Expert photo service.')
  assert('loose option marker fixture keeps missing-dot D option', looseQuestions[2].options.D === 'It guarantees performance.')
  assert('loose option marker fixture keeps missing-dot C before dotted D', looseQuestions[3].options.C === 'Abandon devices.')

  const imageOptionResult = parseReadingCandidatesFromText(
    `
32-35 CDBA
第二部分 阅读理解
D
A passage explains a rain-powered device.
32. What problem do the researchers aim to solve?
A. The difficulty of separating charges. B. The lack of clean electricity sources. C. The inefficiency of charge harvesting. D. The damage of traditional hydropower.
33. Which of the following best illustrates plug flow?
A. B. C. D.
34. What is the last paragraph mainly about concerning the model?
A. Its potential cost in urban areas. B. Its promising use in green energy. C. Its complex design for rain power. D. Its practical need for more devices.
35. What is a suitable title for the text?
A. Revolutionary Energy from Raindrops B. Urgent Demand for Sustainable Energy C. Capturing Raindrops through Innovation D. Turning Charge Separation into Electricity
`,
    { sourceFilename: 'image-options.docx', paperId: 'paper-image-options' },
  )
  const imageQuestions = imageOptionResult.readingGroups.flatMap((group) => group.questions)
  assertEqual('image option marker fixture keeps all questions', imageQuestions.length, 4)
  assertEqual('image option marker fixture applies answer range', imageQuestions.map((question) => question.answerKey).join(''), 'CDBA')
  assert('image option marker fixture marks image-only options for review', imageQuestions[1].options.A.includes('图片选项'))
}

function assertFalsePositiveRejection() {
  const clozeResult = parseReadingCandidatesFromText(
    `
第三部分 语言运用
第一节 完形填空
A
21. Which word fits the blank?
A. rise B. fall C. turn D. move
21-21 A
`,
    { sourceFilename: 'cloze-only.docx', paperId: 'paper-cloze-only' }
  )
  assertEqual('standalone A under cloze is not treated as Reading A', clozeResult.readingGroups.length, 0)

  const titleResult = parseReadingCandidatesFromText(
    `
A Better Way to Sleep
21. What is the text mainly about?
A. Sleep habits B. Train tickets C. Old maps D. River banks
21-21 A
`,
    { sourceFilename: 'title-starting-with-a.docx', paperId: 'paper-title-starting-with-a' }
  )
  assertEqual('title beginning with A is not treated as a group marker', titleResult.readingGroups.length, 0)
}

function assertTitleNormalization() {
  // SW-1: the reading group title (docxSplitter.mjs L356) must flow through
  // normalizePassageText, like the title-fallback paragraph already does (L340).
  // A titled `Passage A` marker carrying a CJK gloss must come back normalized
  // (half-width spaced parens), while the A-D label still derives from the marker.
  const result = parseReadingCandidatesFromText(
    `
第二部分 阅读理解
第一节
阅读下列短文，从每题所给的A、B、C、D四个选项中选出最佳选项。
Passage A The Cloud Farm（云农场）guide
Cloud farms can help small villages predict weather changes.
21. What does the village use to plan the harvest?
A. A notebook B. A weather app C. A city map D. A music lesson
21-21 A
`,
    { sourceFilename: 'titled-marker.docx', paperId: 'paper-titled-marker' }
  )
  assert('SW-1 titled Passage A marker yields one reading group', result.readingGroups.length === 1)
  const group = result.readingGroups[0]
  assertEqual(
    'SW-1 reading group title is normalized (CJK gloss → half-width spaced parens)',
    group.title,
    'The Cloud Farm (云农场) guide',
  )
  assert('SW-1 group A-D label still derives from marker (groupId)', group.groupId.endsWith('-reading-a'))
}

function collectDocxFiles() {
  const roots = ['docs/sources', 'test-fixtures', 'imports']
  const files = []

  function walk(absDir) {
    if (!existsSync(absDir)) return
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const absPath = path.join(absDir, entry.name)
      if (entry.isDirectory()) {
        walk(absPath)
      } else if (/\.docx$/i.test(entry.name)) {
        files.push(absPath)
      }
    }
  }

  for (const root of roots) {
    walk(path.join(repoRoot, root))
  }

  return files.sort()
}

async function assertRealDocxFixtures() {
  const docxFiles = collectDocxFiles()
  assert('at least three owner-supplied DOCX files are available locally', docxFiles.length >= 3, docxFiles.join('\n'))

  const canonicalPath = path.join(repoRoot, 'docs/sources/paper-2024-jslk-english/2024-jslk-english-source.docx')
  assert('canonical 2024 JSLK source DOCX exists', existsSync(canonicalPath))
  const canonical = await parseReadingDocxBuffer(readFileSync(canonicalPath), {
    sourceFilename: path.basename(canonicalPath),
  })
  assertEqual('canonical 2024 JSLK extracts four reading groups', canonical.readingGroups.length, 4)
  assertEqual('canonical 2024 JSLK extracts fifteen reading questions', canonical.readingGroups.flatMap((group) => group.questions).length, 15)
  assertEqual(
    'canonical 2024 JSLK preserves group order A-D',
    canonical.readingGroups.map((group) => group.title.replace('Reading ', '')).join(''),
    'ABCD'
  )
  assert(
    'canonical 2024 JSLK parses seven choices group (I2)',
    canonical.sevenChoicesGroup && canonical.sevenChoicesGroup.groupType === 'sevenChoices'
  )
  assert(
    'canonical 2024 JSLK seven choices group has 5 questions',
    canonical.sevenChoicesGroup?.questions?.length === 5
  )
  assert(
    'canonical 2024 JSLK seven choices group has A-G option bank',
    canonical.sevenChoicesGroup?.optionBank?.length === 7
  )
  assert('canonical 2024 JSLK option text does not absorb later section heading', !/第二节|第三部分|第四部分/.test(readingGroupText(canonical.readingGroups)))

  for (const absPath of docxFiles) {
    const result = await parseReadingDocxBuffer(readFileSync(absPath), {
      sourceFilename: path.basename(absPath),
    })
    const questionCount = result.readingGroups.flatMap((group) => group.questions).length
    realDocxSummaries.push({
      file: path.relative(repoRoot, absPath),
      groups: result.readingGroups.length,
      questions: questionCount,
      skipped: result.skipped.length,
    })
    assert(`real DOCX extracts reading groups: ${path.relative(repoRoot, absPath)}`, result.readingGroups.length >= 3)
    assert(`real DOCX extracts reading questions: ${path.relative(repoRoot, absPath)}`, questionCount >= 10)
  }
}

async function main() {
  assertAllowedScope()
  assertRouteContract()
  assertTextFixture()
  assertTitleNormalization()
  assertFalsePositiveRejection()
  await assertRealDocxFixtures()

  console.log('')
  for (const summary of realDocxSummaries) {
    console.log(`REAL_DOCX ${summary.file}: groups=${summary.groups} questions=${summary.questions} skipped=${summary.skipped}`)
  }
  console.log(`I1 splitter verify PASSED: ${passed} checks; realDocx=${realDocxSummaries.length}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
