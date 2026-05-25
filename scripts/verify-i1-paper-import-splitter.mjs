#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseReadingCandidatesFromText, parseReadingDocxBuffer } from '../server/paper-import-ai/docxSplitter.mjs'
import { createPaperImportAiRoutes } from '../server/paper-import-ai/routes.mjs'
import { createPaperImportRoutes } from '../server/paper-import/paperImportRoutes.mjs'

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
    'server/api.mjs',
    'server/package.json',
    'server/package-lock.json',
    'server/paper-import-ai/docxSplitter.mjs',
    'server/paper-import-ai/routes.mjs',
    'scripts/README.md',
    'scripts/verify-i1-paper-import-splitter.mjs',
  ])
  const files = changedFiles()
  const unexpected = files.filter((file) => !allowed.has(file))
  assert('I1 Step 1 changed files stay in the splitter whitelist', unexpected.length === 0, unexpected.join('\n'))

  const forbidden = files.filter(
    (file) =>
      file.startsWith('prompts/') ||
      file.startsWith('shared/papersurface/') ||
      file.startsWith('app/src/domain/') ||
      file.startsWith('schemas/') ||
      file.endsWith('Adapter.ts') ||
      file === 'app/src/features/paper-import/PaperImportWorkbench.tsx'
  )
  assert('I1 Step 1 forbidden scopes are untouched', forbidden.length === 0, forbidden.join('\n'))
}

function assertRouteContract() {
  const apiSource = readRepoFile('server/api.mjs')
  const routeSource = readRepoFile('server/paper-import-ai/routes.mjs')
  const splitterSource = readRepoFile('server/paper-import-ai/docxSplitter.mjs')
  const packageJson = JSON.parse(readRepoFile('server/package.json'))
  const routes = createPaperImportAiRoutes()
  const parseRoute = routes.find((route) => route.method === 'POST' && route.pattern.test('/api/paper-import-ai/parse'))
  const c7Routes = createPaperImportRoutes()

  assert('server route registry includes Paper Import AI routes', apiSource.includes('createPaperImportAiRoutes'))
  assert('POST /api/paper-import-ai/parse is registered', Boolean(parseRoute))
  assert('Paper Import AI route rejects non-matching paths', !parseRoute.pattern.test('/api/paper-import-ai/parse/extra'))
  assert('Paper Import AI route requires docx input', routeSource.includes('isDocxFile'))
  assert('DOCX splitter uses mammoth raw-text extraction', splitterSource.includes('mammoth.extractRawText'))
  assert('server dependency declares mammoth', Boolean(packageJson.dependencies?.mammoth))
  assert('existing C7 validate route remains present', c7Routes.some((route) => route.pattern.test('/api/paper-import/validate')))
  assert('existing C7 publish route remains present', c7Routes.some((route) => route.pattern.test('/api/paper-import/publish')))
  assert('existing C7 revalidate-latest route remains present', c7Routes.some((route) => route.pattern.test('/api/paper-import/revalidate-latest')))
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
    'seven choices section is skipped for I2',
    result.skipped.some((entry) => entry.reason === 'seven_choices_deferred_to_i2')
  )
  assert(
    'non-reading sections are recorded as skipped',
    result.skipped.some((entry) => entry.reason === 'grammar_or_language_out_of_scope_for_i1' || entry.reason === 'cloze_out_of_scope_for_i1')
  )
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
    'canonical 2024 JSLK skips seven choices for I2',
    canonical.skipped.some((entry) => entry.reason === 'seven_choices_deferred_to_i2')
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
