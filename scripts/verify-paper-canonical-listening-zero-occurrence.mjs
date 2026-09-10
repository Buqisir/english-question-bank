#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  canonicalAuthorityRef,
  resolveCanonicalAuthority,
  slotsForProfile,
} from '../shared/paper-canonical/authority.mjs'
import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import {
  projectCanonicalConsumerGroup,
} from '../shared/paper-canonical/consumerProjection.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
  sealCanonicalPublication,
  validateCanonicalPublicationBundle,
} from '../server/paper-canonical/publication.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import {
  makeListeningInactiveReferenceFixture,
} from '../test-fixtures/paper-canonical/listeningInactiveReferenceFixture.mjs'

const ACTIVE_GROUP_COUNT = 9
const LISTENING_SLOT_IDS = [
  'listening.short-dialogue',
  'listening.long-form',
]
const CONSUMER_CASES = {
  screen: consumerContractRefs.screen,
  printPdf: consumerContractRefs.print_pdf,
}
const persistActualArtifacts = process.argv.includes('--actual-artifacts')
const exactHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim()
const actualArtifactRoot = persistActualArtifacts
  ? path.resolve(
      '.scratch/paper-canonical-ticket-15-listening-zero-occurrence',
      exactHead,
    )
  : mkdtempSync(path.join(tmpdir(), 'eqb-listening-zero-occurrence-'))
mkdirSync(actualArtifactRoot, { recursive: true })

function bookmarkName(kind, value) {
  return `${kind}_${createHash('sha256')
    .update(`${kind}:${value}`)
    .digest('hex')
    .slice(0, 24)}`
}

function compactText(value) {
  return String(value).replaceAll(/\s+/g, '')
}

function assertZeroListeningOccurrence(value, label, sourcePhrases) {
  // Shared styles describe supported families even when their content is absent.
  // Keep checking all emitted markup/attributes and source phrases, not CSS.
  const text = String(value).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  assert.equal(
    /listening/i.test(text),
    false,
    `${label} contains no listening identifier or visible chrome`,
  )
  assert.equal(
    text.includes('听力'),
    false,
    `${label} contains no invented Chinese listening chrome`,
  )
  const compact = compactText(text)
  for (const phrase of sourcePhrases) {
    assert.equal(
      compact.includes(compactText(phrase)),
      false,
      `${label} contains no inactive source phrase: ${phrase}`,
    )
  }
}

function listeningSourcePhrases(fixture) {
  const documents = new Map(
    fixture.request.evidence.documents.map((document) => [
      document.inputKey,
      document,
    ]),
  )
  const questions = JSON.parse(
    new TextDecoder().decode(documents.get('listening_questions').bytes),
  )
  const transcript = JSON.parse(
    new TextDecoder().decode(documents.get('listening_transcript').bytes),
  )
  return [
    questions.section2.questions[0].stem,
    transcript.texts[0].lines[1].line,
    transcript.texts[1].lines[0].line,
  ]
}

function projectedGroups(consumption) {
  return consumption.selections.flatMap((selection) =>
    selection.projectedOccurrences.map((occurrence) => ({
      occurrence,
      group: projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId: occurrence.groupId,
      }),
    })),
  )
}

function exportGroupType(canonicalGroup) {
  if (canonicalGroup.groupType === 'grammarFill') return 'grammar_cloze'
  if (canonicalGroup.groupType === 'sevenChoices') return 'seven_choices'
  if (canonicalGroup.groupType === 'continuation') return 'writing'
  return canonicalGroup.groupType
}

function paperAssetGroupType(canonicalGroup) {
  if (canonicalGroup.groupType === 'grammarFill') return 'grammarFill'
  if (canonicalGroup.groupType === 'sevenChoices') return 'sevenChoices'
  if (['writing', 'continuation'].includes(canonicalGroup.groupType)) {
    return 'writing'
  }
  return canonicalGroup.groupType
}

function canonicalExportItem(canonicalGroup) {
  return {
    detail: {
      id: canonicalGroup.groupId,
      paperId: canonicalGroup.paperId,
      title: `Active ${canonicalGroup.familyContractId}`,
      source: 'Canonical inactive-slot whole-paper proof',
      groupType: exportGroupType(canonicalGroup),
      passage: {
        title: `Active ${canonicalGroup.familyContractId}`,
        materialText: 'POISONED LEGACY ACTIVE-GROUP CONTENT',
      },
      writingTask: {
        taskType:
          canonicalGroup.groupType === 'continuation'
            ? 'application'
            : 'continuation',
        continuationStarters: [
          'POISONED LEGACY STARTER ONE',
          'POISONED LEGACY STARTER TWO',
        ],
        applicationGiven: {
          top: ['POISONED LEGACY FIXED TOP'],
          bottom: ['POISONED LEGACY FIXED BOTTOM'],
        },
      },
      questions: canonicalGroup.questions.map((question) => ({
        id: question.questionId,
        questionNo: String(question.questionNo),
        stem: 'POISONED LEGACY STEM',
        answer: 'POISONED LEGACY ANSWER',
        explanation: 'POISONED LEGACY EXPLANATION',
        options: [{ label: 'A', content: 'POISONED LEGACY OPTION' }],
      })),
    },
    score: 1,
    sectionTitle: `Active ${canonicalGroup.familyContractId}`,
    note: '',
  }
}

function makeWholePaperSurfaceAsset(consumption) {
  const asset = JSON.parse(
    readFileSync(
      'app/public/paper-assets/paper-2026-i/latest/paper-asset.json',
      'utf8',
    ),
  )
  const activeGroups = projectedGroups(consumption)
  assert.equal(activeGroups.length, ACTIVE_GROUP_COUNT)
  const oldGroupIds = asset.content.blocks.flatMap((block) =>
    block.type === 'group' ? [block.groupId] : [],
  )
  assert.equal(oldGroupIds.length, ACTIVE_GROUP_COUNT)
  const groupIdMap = new Map(
    oldGroupIds.map((oldGroupId, index) => [
      oldGroupId,
      activeGroups[index].group.groupId,
    ]),
  )
  const writingTaskIdMap = new Map()
  const groups = {}
  const questions = {}
  const blanks = {}
  const writingTasks = {}
  const answers = {}

  for (const { occurrence, group } of activeGroups) {
    const blankIds = occurrence.blanks.map((blank) => blank.blankId)
    const paperGroup = {
      groupId: group.groupId,
      groupType: paperAssetGroupType(group),
      title: `Active ${group.familyContractId}`,
      questionIds: group.questions.map((question) => question.questionId),
      ...(blankIds.length > 0 ? { blankIds } : {}),
      passage: {
        paragraphs: [{
          paragraphId: `legacy-paragraph:${group.groupId}`,
          text: 'POISONED LEGACY ACTIVE-GROUP CONTENT',
        }],
      },
    }
    if (group.optionBank) {
      paperGroup.optionBank = group.optionBank.options.map((option) => ({
        label: option.label,
        text: 'POISONED LEGACY SHARED OPTION',
      }))
    }
    if (['writing', 'continuation'].includes(group.groupType)) {
      paperGroup.writingTaskId = group.writingTaskId
      const oldGroupId = oldGroupIds[
        activeGroups.findIndex((candidate) =>
          candidate.group.groupId === group.groupId)
      ]
      const oldWritingTaskId =
        asset.content.groups[oldGroupId]?.writingTaskId
      if (oldWritingTaskId) {
        writingTaskIdMap.set(oldWritingTaskId, group.writingTaskId)
      }
      writingTasks[group.writingTaskId] = {
        writingTaskId: group.writingTaskId,
        groupId: group.groupId,
        taskType:
          group.groupType === 'continuation'
            ? 'continuation'
            : 'application',
        title: `Active ${group.familyContractId}`,
        instruction: 'POISONED LEGACY WRITING INSTRUCTION',
        materialText: 'POISONED LEGACY WRITING MATERIAL',
        continuationStarters: [
          'POISONED LEGACY STARTER ONE',
          'POISONED LEGACY STARTER TWO',
        ],
        applicationGiven: 'POISONED LEGACY APPLICATION GIVEN',
        wordCountTarget:
          group.groupType === 'continuation' ? 150 : 80,
      }
    }
    groups[group.groupId] = paperGroup
    for (const question of group.questions) {
      questions[question.questionId] = {
        questionId: question.questionId,
        questionNo: question.questionNo,
        groupId: group.groupId,
        stem: 'POISONED LEGACY STEM',
        options: question.options.map((option) => ({
          label: option.label,
          text: 'POISONED LEGACY OPTION',
        })),
      }
      answers[question.questionId] = {
        questionId: question.questionId,
        questionNo: question.questionNo,
        answer: 'A',
        score: 1,
        note: 'POISONED LEGACY ANSWER',
      }
    }
    for (const blank of occurrence.blanks) {
      blanks[blank.blankId] = {
        blankId: blank.blankId,
        groupId: group.groupId,
        questionId: blank.questionId,
        prompt: 'POISONED LEGACY BLANK',
      }
    }
  }

  asset.content.blocks = asset.content.blocks.map((block) => {
    if (block.type === 'group') {
      return { ...block, groupId: groupIdMap.get(block.groupId) }
    }
    if (
      block.type === 'answerBox'
      && writingTaskIdMap.has(block.writingTaskId)
    ) {
      return {
        ...block,
        writingTaskId: writingTaskIdMap.get(block.writingTaskId),
      }
    }
    return block
  })
  asset.content.groups = groups
  asset.content.questions = questions
  asset.content.blanks = blanks
  asset.content.writingTasks = writingTasks
  asset.answerKey = { answers }
  asset.analysis = {}
  return asset
}

async function compilePublishAndLoad(fixture) {
  const compilation = compileCanonicalPaper(fixture.request)
  assert.equal(compilation.disposition, 'ready')

  const plan = compilation.artifacts.canonicalPaper.paperPlan
  const authority =
    resolveCanonicalAuthority(plan.authorityRef || canonicalAuthorityRef)
  assert.equal(authority.ok, true)
  const expectedSlots = slotsForProfile(
    authority.closure.profiles.get(plan.profileRef.profileId),
  )
  assert.equal(plan.slotBindings.length, expectedSlots.length)
  assert.equal(plan.slotBindings.length, 11)
  assert.deepEqual(
    plan.slotBindings
      .filter((binding) => binding.state === 'inactive')
      .map((binding) => binding.slotId),
    LISTENING_SLOT_IDS,
  )
  for (const binding of plan.slotBindings.filter(
    (candidate) => candidate.state === 'inactive',
  )) {
    assert.equal(Object.hasOwn(binding, 'groupRef'), false)
    assert.equal(
      binding.sourceClosureRef.contractId,
      'listening-raw-closure',
    )
    assert.match(
      binding.sourceClosureRef.closureDigest,
      /^sha256:[a-f0-9]{64}$/,
    )
  }
  assert.equal(
    compilation.artifacts.canonicalPaper.questionGroups.length,
    ACTIVE_GROUP_COUNT,
  )
  assert.equal(
    compilation.artifacts.canonicalPaper.questionGroups.some(
      (group) => group.contractRef.familyContractId === 'listening',
    ),
    false,
  )
  assert.deepEqual(
    compilation.artifacts.normalizationReport.inactiveSourceClosures.map(
      (closure) => ({
        slotId: closure.slotId,
        status: closure.status,
        questionCount: closure.questionCount,
      }),
    ),
    [
      {
        slotId: 'listening.short-dialogue',
        status: 'closed',
        questionCount: 5,
      },
      {
        slotId: 'listening.long-form',
        status: 'closed',
        questionCount: 15,
      },
    ],
  )

  const projection = projectCanonicalPaper({
    plan,
    groups: compilation.artifacts.canonicalPaper.questionGroups,
    sourceCapture: compilation.artifacts.sourceCapture,
    authorityClosure: authority.closure,
  })
  assert.equal(
    projection.nodes.filter((node) => node.kind === 'group').length,
    ACTIVE_GROUP_COUNT,
  )
  assert.equal(
    projection.nodes.some(
      (node) =>
        node.kind === 'group'
        && node.familyContractId === 'listening',
    ),
    false,
  )

  const sealed = sealCanonicalPublication({
    compilation,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
  })
  const reopened = validateCanonicalPublicationBundle({
    manifest: sealed.manifest,
    sourceAsset: sealed.sourceAsset,
    readArtifact: (relativePath) =>
      sealed.artifacts[relativePath] || sealed.sourceEvidence[relativePath],
  })
  assert.equal(reopened.plan.slotBindings.length, expectedSlots.length)
  assert.equal(reopened.normalizationReport.inactiveSourceClosures.length, 2)
  assert.equal(reopened.groups.length, ACTIVE_GROUP_COUNT)

  const publicationRoot = mkdtempSync(
    path.join(tmpdir(), 'eqb-listening-zero-publication-'),
  )
  const db = new DatabaseSync(path.join(publicationRoot, 'publication.sqlite'))
  try {
    const published = publishCanonicalPaperPublication({
      rootDir: publicationRoot,
      db,
      request: fixture.request,
      sourceAssetVersion: 1,
      sourceAsset: fixture.sourceAsset,
    })
    assert.equal(published.status, 'published')
    const store = createFileSystemCanonicalPublicationStore({
      rootDir: publicationRoot,
      db,
    })
    const consumptions = {}
    for (const [label, consumerContract] of Object.entries(CONSUMER_CASES)) {
      const loaded = await loadPaperForConsumption(
        { paperId: fixture.paperId, consumerContract },
        store,
      )
      assert.equal(
        loaded.disposition,
        'ready',
        JSON.stringify(loaded.diagnostics),
      )
      assert.equal(
        loaded.selections.some(
          (selection) => selection.familyContractId === 'listening',
        ),
        false,
      )
      assert.equal(
        loaded.selections.flatMap(
          (selection) => selection.projectedOccurrences,
        ).length,
        ACTIVE_GROUP_COUNT,
      )
      consumptions[label] = loaded
    }
    assert.equal(
      new Set(
        Object.values(consumptions).map(
          (consumption) => consumption.publicationDigest,
        ),
      ).size,
      1,
    )
    return { compilation, consumptions }
  } finally {
    db.close()
    rmSync(publicationRoot, { recursive: true, force: true })
  }
}

async function verifyActualPaperSurface({
  consumption,
  asset,
  sourcePhrases,
}) {
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({
    root: path.resolve('app'),
    server: { host: '127.0.0.1', port: 0 },
  })
  await viteServer.listen()
  const appUrl = viteServer.resolvedUrls?.local?.[0]
  assert.ok(appUrl)
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
  try {
    const firstGroup = projectedGroups(consumption)[0].group
    for (const lecture of [false, true]) {
      const page = await browser.newPage()
      await page.route('**/api/paper-canonical/consumption?*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(consumption),
        }))
      await page.route('**/paper-assets/**/paper-asset.json', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(asset),
        }))
      await page.route('**/paper-assets/**/analyses/**', (route) =>
        route.fulfill({ status: 404, body: '' }))
      await page.route('**/paper-assets/**/figures/**', (route) =>
        route.fulfill({ status: 404, body: '' }))
      const url = new URL('canonical-consumption-qa.html', appUrl)
      url.searchParams.set('paperId', consumption.paperId)
      url.searchParams.set('focusGroupId', firstGroup.groupId)
      if (lecture) {
        url.searchParams.set('lecture', '1')
        url.searchParams.set(
          'questionId',
          firstGroup.questions[0].questionId,
        )
      }
      await page.goto(url.href)
      await page.locator('.paper-browse-group-card').first().waitFor({
        timeout: 15_000,
      })
      assert.equal(
        await page.locator('.paper-browse-group-card').count(),
        ACTIVE_GROUP_COUNT,
      )
      assert.equal(await page.locator('.paper-browse-placeholder').count(), 0)
      assert.equal(await page.locator('.paper-browse-error').count(), 0)
      assert.equal(
        await page.locator('.paper-browse-lecture-panel').count(),
        lecture ? 1 : 0,
      )
      for (const { group } of projectedGroups(consumption)) {
        assert.equal(
          await page.locator(
            `.paper-browse-group-card[data-paper-browse-anchor="${group.groupId}"]`,
          ).count(),
          1,
        )
      }
      const label = `PaperSurface ${lecture ? 'lecture' : 'plain'}`
      assertZeroListeningOccurrence(
        await page.locator('body').innerText(),
        label,
        sourcePhrases,
      )
      assertZeroListeningOccurrence(
        await page.locator('body').innerHTML(),
        `${label} DOM`,
        sourcePhrases,
      )
      writeFileSync(
        path.join(
          actualArtifactRoot,
          `papersurface-${lecture ? 'lecture' : 'plain'}.html`,
        ),
        await page.content(),
      )
      await page.screenshot({
        path: path.join(
          actualArtifactRoot,
          `papersurface-${lecture ? 'lecture' : 'plain'}.png`,
        ),
        fullPage: true,
      })
      await page.close()
    }
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

function canonicalExportPayload(consumption) {
  const groups = projectedGroups(consumption).map(({ group }) => group)
  return {
    groups,
    items: groups.map(canonicalExportItem),
    blocks: groups.map((group) => ({
      type: 'question_group',
      questionGroupId: group.groupId,
      score: 1,
    })),
  }
}

async function verifyPrintArtifacts({
  consumption,
  sourcePhrases,
}) {
  const { items, blocks } = canonicalExportPayload(consumption)
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
  try {
    for (const versionType of ['student', 'teacher']) {
      const html = buildPrintHtml({
        title: 'Canonical inactive-slot whole-paper proof',
        versionType,
        printStyle: 'exam',
        items,
        blocks,
        questionNumberStart: 1,
        canonicalConsumption: consumption,
      })
      assert.equal(
        (html.match(/<section class="question-group"[^>]*>/g) || []).length,
        ACTIVE_GROUP_COUNT,
      )
      assertZeroListeningOccurrence(
        html,
        `Print HTML ${versionType}`,
        sourcePhrases,
      )
      const htmlPath = path.join(
        actualArtifactRoot,
        `print-${versionType}.html`,
      )
      const pdfPath = path.join(
        actualArtifactRoot,
        `print-${versionType}.pdf`,
      )
      writeFileSync(htmlPath, html)
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      assert.equal(
        await page.locator('section.question-group').count(),
        ACTIVE_GROUP_COUNT,
      )
      const pdfBytes = await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      })
      assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
      const pdfText = execFileSync(
        'pdftotext',
        ['-layout', pdfPath, '-'],
        { encoding: 'utf8' },
      )
      assertZeroListeningOccurrence(
        pdfText,
        `Print PDF ${versionType}`,
        sourcePhrases,
      )
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

const fixture = makeListeningInactiveReferenceFixture()
const sourcePhrases = listeningSourcePhrases(fixture)
try {
  const { consumptions } = await compilePublishAndLoad(fixture)
  const surfaceAsset = makeWholePaperSurfaceAsset(consumptions.screen)
  await verifyActualPaperSurface({
    consumption: consumptions.screen,
    asset: surfaceAsset,
    sourcePhrases,
  })
  await verifyPrintArtifacts({
    consumption: consumptions.printPdf,
    sourcePhrases,
  })
  if (persistActualArtifacts) {
    writeFileSync(
      path.join(actualArtifactRoot, 'artifact-manifest.json'),
      `${JSON.stringify({
        exactHead,
        paperId: fixture.paperId,
        inactiveSlotIds: LISTENING_SLOT_IDS,
        activeGroupCount: ACTIVE_GROUP_COUNT,
        artifacts: readdirSync(actualArtifactRoot).sort(),
      }, null, 2)}\n`,
    )
  }
  console.log(
    'PASS: complete inactive listening slots produce zero current-surface occurrences across whole-paper Screen and Print/PDF artifacts',
  )
} finally {
  if (!persistActualArtifacts) {
    rmSync(actualArtifactRoot, { recursive: true, force: true })
  }
}
