#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import {
  projectCanonicalConsumerGroup,
} from '../shared/paper-canonical/consumerProjection.mjs'
import {
  buildCanonicalApplicationWritingConsumptionSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import {
  makeApplicationWritingReferenceFixture,
} from '../test-fixtures/paper-canonical/applicationWritingReferenceFixture.mjs'

const persistActualArtifacts =
  process.env.EQB_PERSIST_ACTUAL_ARTIFACTS === '1'
const actualArtifactRoot = path.resolve(
  process.env.EQB_ACTUAL_ARTIFACT_ROOT
    || '.scratch/ticket-11-application-writing',
)
const providedNoticeLines = Object.freeze([
  '注意：',
  '（1）写作词数应为80个左右；',
  '（2）请按如下格式在答题卡的相应位置作答。',
])
const providedNoticeText = providedNoticeLines.join('')
const providedPromptText =
  '你校英文报”Opinion”栏目正在征稿，请同学们对未来大学生活的学习(Study)、社交(Socialize)、睡眠(Sleep)这三件事按重要性进行排序，并阐述理由。请你写一篇短文向该栏目投稿。'
const providedNoticeBlockId = 'para-2026-i-writing-app-word-rule'
const providedNoticeInlineId = `text:${providedNoticeBlockId}`
const providedTitleBlockId =
  'paragraph:group-2026-i-writing-application:given:title'
const providedTitlePartId =
  'given-part:group-2026-i-writing-application:title'
if (persistActualArtifacts) {
  mkdirSync(actualArtifactRoot, { recursive: true })
}

async function publishAndLoad(paperId, consumerContract) {
  const fixture = makeApplicationWritingReferenceFixture(paperId)
  const compilation = compileCanonicalPaper(fixture.request)
  assert.equal(compilation.disposition, 'ready')
  const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-application-writing-rendered-'))
  const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
  try {
    publishCanonicalPaperPublication({
      rootDir,
      db,
      request: fixture.request,
      sourceAssetVersion: 1,
      sourceAsset: fixture.sourceAsset,
    })
    const consumption = await loadPaperForConsumption({
      paperId,
      consumerContract,
    }, createFileSystemCanonicalPublicationStore({ rootDir, db }))
    assert.equal(consumption.disposition, 'ready')
    return consumption
  } finally {
    db.close()
    rmSync(rootDir, { recursive: true, force: true })
  }
}

function applicationGroup(consumption) {
  const selection = consumption.selections.find(
    (candidate) => candidate.familyContractId === 'application-writing',
  )
  assert.equal(selection.mode, 'canonical')
  assert.equal(selection.groupIds.length, 1)
  return projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'application-writing',
    groupId: selection.groupIds[0],
  })
}

function applicationSurface(consumption) {
  const selection = consumption.selections.find(
    (candidate) => candidate.familyContractId === 'application-writing',
  )
  assert.equal(selection.groupIds.length, 1)
  return buildCanonicalApplicationWritingConsumptionSurfaceData({
    consumption,
    groupId: selection.groupIds[0],
  })
}

function applicationExportItem(paperId, groupId) {
  const asset = JSON.parse(readFileSync(
    new URL(
      `../app/public/paper-assets/${paperId}/latest/paper-asset.json`,
      import.meta.url,
    ),
    'utf8',
  ))
  const group = asset.content.groups[groupId]
  assert.equal(group.groupType, 'writing')
  return {
    detail: {
      id: groupId,
      paperId,
      title: 'POISONED LEGACY APPLICATION TITLE',
      source: 'POISONED LEGACY APPLICATION SOURCE',
      groupType: 'writing',
      passage: {
        title: 'POISONED LEGACY APPLICATION PASSAGE TITLE',
        materialText:
          'POISONED LEGACY PROMPT\nDear Invented,\nPOISONED LEGACY OPENING\nYours,\nLegacy Writer',
      },
      writingTask: {
        taskType: 'application',
        applicationGiven: {
          top: ['POISONED LEGACY SALUTATION'],
          bottom: ['POISONED LEGACY SIGNATURE'],
        },
      },
      questions: [],
    },
    score: 15,
    sectionTitle: 'POISONED LEGACY APPLICATION SECTION HEADING',
    note: 'POISONED LEGACY APPLICATION INSTRUCTION',
  }
}

function continuationExportItem() {
  return {
    detail: {
      id: 'group-continuation-regression',
      paperId: 'paper-continuation-regression',
      title: '读后续写',
      source: 'Continuation regression fixture',
      groupType: 'writing',
      passage: {
        title: '读后续写',
        materialText: 'CONTINUATION LEGACY MATERIAL',
      },
      writingTask: {
        taskType: 'continuation',
        continuationStarters: [
          'CONTINUATION STARTER ONE',
          'CONTINUATION STARTER TWO',
        ],
      },
      questions: [],
    },
    score: 25,
    sectionTitle: '读后续写',
    note: '',
  }
}

function applicationGroupId(consumption) {
  const selection = consumption.selections.find(
    (candidate) => candidate.familyContractId === 'application-writing',
  )
  assert.equal(selection.groupIds.length, 1)
  return selection.groupIds[0]
}

function consumptionForAssetBlocks(consumption, asset) {
  const blockGroupIds = new Set(
    asset.content.blocks.flatMap((block) =>
      block.type === 'group' ? [block.groupId] : []),
  )
  const next = structuredClone(consumption)
  next.selections = next.selections
    .map((selection) => ({
      ...selection,
      groupIds: selection.groupIds.filter((groupId) =>
        blockGroupIds.has(groupId)),
      ...(selection.projectedOccurrences
        ? {
            projectedOccurrences: selection.projectedOccurrences.filter(
              (occurrence) => blockGroupIds.has(occurrence.groupId),
            ),
          }
        : {}),
    }))
    .filter((selection) => selection.groupIds.length > 0)
  return next
}

function alignAssetGroupsToConsumption(asset, consumption) {
  const familyGroupType = {
    reading: 'reading',
    'seven-choices': 'sevenChoices',
    cloze: 'cloze',
    'grammar-fill': 'grammarFill',
    'application-writing': 'writing',
    'continuation-writing': 'writing',
  }
  const existingGroups = Object.values(asset.content.groups)
  const alignedGroups = {}
  for (const selection of consumption.selections) {
    const groupType = familyGroupType[selection.familyContractId]
    for (const groupId of selection.groupIds) {
      const existing = asset.content.groups[groupId]
      const template = existing || existingGroups.find((group) => {
        if (group.groupType !== groupType) return false
        if (groupType !== 'writing') return true
        const task = asset.content.writingTasks?.[group.writingTaskId]
        return task?.taskType === (
          selection.familyContractId === 'application-writing'
            ? 'application'
            : 'continuation'
        )
      })
      assert.ok(
        template,
        `browser fixture has a ${selection.familyContractId} Group template`,
      )
      alignedGroups[groupId] = {
        ...structuredClone(template),
        groupId,
      }
    }
  }
  asset.content.groups = alignedGroups
  asset.content.blocks = asset.content.blocks.filter(
    (block) =>
      block.type !== 'group'
      || asset.content.groups[block.groupId],
  )
  const blockGroupIds = new Set(
    asset.content.blocks
      .filter((block) => block.type === 'group')
      .map((block) => block.groupId),
  )
  for (const groupId of Object.keys(asset.content.groups)) {
    if (!blockGroupIds.has(groupId)) {
      asset.content.blocks.push({ type: 'group', groupId })
    }
  }
  assert.deepEqual(
    consumption.visibleStructure
      .filter((node) => node.kind === 'group')
      .map((node) => node.groupId)
      .filter((groupId) => !asset.content.groups[groupId]),
    [],
    'browser fixture closes every current visible Group identity',
  )
  assert.deepEqual(
    asset.content.blocks
      .filter((block) =>
        block.type === 'group' && !asset.content.groups[block.groupId])
      .map((block) => block.groupId),
    [],
    'browser fixture keeps every source block Group resolvable',
  )
  return asset
}

function bookmarkName(kind, value) {
  return `${kind}_${createHash('sha256').update(`${kind}:${value}`)
    .digest('hex').slice(0, 24)}`
}

function pdfPageCount(pdfPath) {
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
  const match = info.match(/^Pages:\s+([1-9]\d*)$/m)
  assert.ok(match)
  return Number(match[1])
}

function pdfPageContainingText(pdfPath, text) {
  const expected = text.replaceAll(/\s/g, '')
  for (let page = 1; page <= pdfPageCount(pdfPath); page += 1) {
    const pageText = execFileSync(
      'pdftotext',
      ['-f', String(page), '-l', String(page), '-layout', pdfPath, '-'],
      { encoding: 'utf8' },
    ).replaceAll(/\s/g, '')
    if (pageText.includes(expected)) return page
  }
  return null
}

function pdfWords(pdfPath) {
  const bbox = execFileSync(
    'pdftotext',
    ['-bbox-layout', pdfPath, '-'],
    { encoding: 'utf8' },
  )
  return [...bbox.matchAll(
    /<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([^<]+)<\/word>/g,
  )].map((match) => ({
    xMin: Number(match[1]),
    yMin: Number(match[2]),
    xMax: Number(match[3]),
    yMax: Number(match[4]),
    text: match[5],
  }))
}

function pdfTextBounds(pdfPath, text, label) {
  const words = pdfWords(pdfPath)
  const target = text.replaceAll(/\s/g, '')
  const sequences = []
  for (let start = 0; start < words.length; start += 1) {
    let joined = ''
    for (let end = start; end < words.length; end += 1) {
      joined += words[end].text.replaceAll(/\s/g, '')
      if (joined === target) {
        sequences.push(words.slice(start, end + 1))
        break
      }
      if (joined.length >= target.length || !target.startsWith(joined)) break
    }
  }
  assert.equal(sequences.length, 1, `${label}: PDF contains one ${text}`)
  return {
    left: Math.min(...sequences[0].map((word) => word.xMin)),
    right: Math.max(...sequences[0].map((word) => word.xMax)),
    top: Math.min(...sequences[0].map((word) => word.yMin)),
    bottom: Math.max(...sequences[0].map((word) => word.yMax)),
  }
}

function convertedPdfResponseFrameBounds(pdfPath) {
  const svgRoot = mkdtempSync(path.join(tmpdir(), 'eqb-application-frame-'))
  try {
    const svgPath = path.join(svgRoot, 'page.svg')
    execFileSync('pdftocairo', [
      '-f',
      '1',
      '-l',
      '1',
      '-svg',
      pdfPath,
      svgPath,
    ])
    const svg = readFileSync(svgPath, 'utf8')
    const expectedWidthPt = 144 / 25.4 * 72
    const expectedHeightPt = 65 / 25.4 * 72
    const rectangles = [...svg.matchAll(/<path\b[^>]*\bd="[^"]+"[^>]*>/g)]
      .map(([tag]) => {
        const points = [...(tag.match(/\bd="([^"]+)"/)?.[1] || '').matchAll(
          /[ML]\s*([\d.-]+)\s+([\d.-]+)/g,
        )].slice(0, 4).map((match) => [Number(match[1]), Number(match[2])])
        if (points.length !== 4) return null
        const matrix = tag.match(
          /transform="matrix\(([\d.-]+),\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)\)"/,
        )?.slice(1).map(Number) || [1, 0, 0, 1, 0, 0]
        const transformed = points.map(([x, y]) => ({
          x: matrix[0] * x + matrix[2] * y + matrix[4],
          y: matrix[1] * x + matrix[3] * y + matrix[5],
        }))
        const left = Math.min(...transformed.map((point) => point.x))
        const right = Math.max(...transformed.map((point) => point.x))
        const top = Math.min(...transformed.map((point) => point.y))
        const bottom = Math.max(...transformed.map((point) => point.y))
        if (right <= left || bottom <= top) return null
        return {
          left,
          right,
          top,
          bottom,
          width: right - left,
          height: bottom - top,
          stroked: /\bfill="none"/.test(tag),
        }
      })
      .filter(Boolean)
    const unique = [
      ...new Map(rectangles.map((rectangle) => [
        [
          rectangle.left.toFixed(2),
          rectangle.top.toFixed(2),
          rectangle.right.toFixed(2),
          rectangle.bottom.toFixed(2),
        ].join(':'),
        rectangle,
      ])).values(),
    ]
    const horizontal = unique.filter((rectangle) =>
      !rectangle.stroked
      && Math.abs(rectangle.width - expectedWidthPt) <= 2.5
      && rectangle.height >= 0.35
      && rectangle.height <= 0.65)
    const vertical = unique.filter((rectangle) =>
      !rectangle.stroked
      && Math.abs(rectangle.height - expectedHeightPt) <= 2.5
      && rectangle.width >= 0.35
      && rectangle.width <= 0.65)
    const frames = []
    for (const top of horizontal) {
      for (const bottom of horizontal) {
        if (
          bottom.top <= top.top
          || Math.abs(top.left - bottom.left) > 1
          || Math.abs(top.right - bottom.right) > 1
          || Math.abs(bottom.bottom - top.top - expectedHeightPt) > 2.5
        ) continue
        const left = vertical.find((edge) =>
          Math.abs(edge.left - top.left) <= 1
          && Math.abs(edge.top - top.top) <= 1)
        const right = vertical.find((edge) =>
          Math.abs(edge.right - top.right) <= 1
          && Math.abs(edge.top - top.top) <= 1)
        if (!left || !right) continue
        frames.push({
          left: top.left,
          right: top.right,
          top: top.top,
          bottom: bottom.bottom,
          ruleThicknesses: [
            top.height,
            bottom.height,
            left.width,
            right.width,
          ],
        })
      }
    }
    assert.equal(
      frames.length,
      1,
      'converted PDF exposes one 144 mm by 65 mm filled-rule response frame',
    )
    assert.equal(
      frames[0].ruleThicknesses.every(
        (thickness) => Math.abs(thickness - 0.5) <= 0.12,
      ),
      true,
      'converted PDF response frame uses approximately 0.5pt rules',
    )
    return frames[0]
  } finally {
    rmSync(svgRoot, { recursive: true, force: true })
  }
}

function assertApplicationFixedPartPdfAlignment(pdfPath, canonical, label) {
  const frame = convertedPdfResponseFrameBounds(pdfPath)
  const frameCenter = (frame.left + frame.right) / 2
  const lastBottomPart = canonical.answerRegion.givenBottom.at(-1)
  for (const part of [
    ...canonical.answerRegion.givenTop,
    ...canonical.answerRegion.givenBottom,
  ]) {
    const bounds = pdfTextBounds(pdfPath, part.text, label)
    if (part.role === 'title') {
      assert.ok(
        Math.abs(((bounds.left + bounds.right) / 2) - frameCenter) <= 1,
        `${label}: title is centered in the response frame`,
      )
      assert.ok(
        bounds.top - frame.top <= 20,
        `${label}: title stays at the top of the response frame`,
      )
    } else if (['salutation', 'opening'].includes(part.role)) {
      assert.ok(
        bounds.left - frame.left <= 20,
        `${label}: ${part.role} stays left-aligned`,
      )
    } else {
      assert.ok(
        frame.right - bounds.right <= 20,
        `${label}: ${part.role} stays right-aligned`,
      )
      if (part === lastBottomPart) {
        assert.ok(
          frame.bottom - bounds.bottom <= 40,
          `${label}: ${part.role} stays at the bottom of the response frame`,
        )
      }
    }
  }
}

function assertNumberedNoticePdfLayout(pdfPath, canonical, label) {
  const block = canonical.promptBlocks.find(
    (candidate) => candidate.text === providedNoticeText,
  )
  if (!block) return
  const bounds = providedNoticeLines.map((line) =>
    pdfTextBounds(pdfPath, line, `${label} notice`))
  assert.ok(bounds[1].top > bounds[0].top)
  assert.ok(bounds[2].top > bounds[1].top)
  assert.ok(bounds[1].left > bounds[0].left)
  assert.ok(bounds[2].left > bounds[0].left)
}

function assertFixedBottomInsideConvertedPdfFrame(
  pdfPath,
  fixedBottom,
  label,
) {
  if (fixedBottom.length === 0) return
  const words = pdfWords(pdfPath)
  const frame = convertedPdfResponseFrameBounds(pdfPath)
  const inset = 0.5
  for (const part of fixedBottom) {
    const tokens = part.text.split(/\s+/)
    const sequences = words
      .map((word, index) => ({ word, index }))
      .filter(({ index }) =>
        tokens.every(
          (token, offset) => words[index + offset]?.text === token,
        ))
      .map(({ index }) => words.slice(index, index + tokens.length))
    assert.equal(
      sequences.length,
      1,
      `${label}: converted PDF contains one fixed text sequence ${part.text}`,
    )
    for (const word of sequences[0]) {
      assert.ok(
        word.xMin >= frame.left + inset
        && word.xMax <= frame.right - inset
        && word.yMin >= frame.top + inset
        && word.yMax <= frame.bottom - inset,
        `${label}: fixed token ${word.text} bbox stays inside the response frame`,
      )
    }
  }
}

function withAllApplicationFixedParts(consumption) {
  const next = structuredClone(consumption)
  const selection = next.selections.find(
    (candidate) => candidate.familyContractId === 'application-writing',
  )
  assert.equal(selection.projectedOccurrences.length, 1)
  const occurrence = selection.projectedOccurrences[0]
  const parts = [
    ['salutation', 'answer_region_top', 'Dear Canonical Reader,'],
    ['opening', 'answer_region_top', 'This opening is source-provided.'],
    ['closing', 'answer_region_bottom', 'Yours,'],
    ['signature', 'answer_region_bottom', 'Li Hua'],
  ].map(([role, placement, text]) => {
    const givenPartId = `given-part:synthetic:${role}`
    const blockRef = `paragraph:synthetic:${role}`
    const nodeId = `text:synthetic:${role}`
    occurrence.content.blocks.push({
      kind: 'paragraph',
      nodeId: blockRef,
      inlines: [{ kind: 'text', nodeId, text }],
    })
    occurrence.anchors.contentNodeIds.push(blockRef, nodeId)
    return {
      givenPartId,
      role,
      placement,
      blockRef,
      authorityAssertionRef: `observation:synthetic:${role}`,
    }
  })
  occurrence.answerRegion.givenTop.push(...parts.slice(0, 2))
  occurrence.answerRegion.givenBottom.push(...parts.slice(2))
  occurrence.anchors.givenPartIds = [
    ...occurrence.answerRegion.givenTop,
    ...occurrence.answerRegion.givenBottom,
  ].map((part) => part.givenPartId)
  return next
}

async function assertBrowserFixedPartAlignment(
  page,
  response,
  canonical,
  label,
) {
  const responseBox = await response.boundingBox()
  assert.ok(responseBox)
  const responseCenter = responseBox.x + (responseBox.width / 2)
  const lastBottomPart = canonical.answerRegion.givenBottom.at(-1)
  for (const part of [
    ...canonical.answerRegion.givenTop,
    ...canonical.answerRegion.givenBottom,
  ]) {
    const fixed = page.locator(
      `[data-canonical-given-part-id="${part.givenPartId}"]`,
    )
    const textBox = await fixed.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const rect = range.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      }
    })
    if (part.role === 'title') {
      assert.ok(
        Math.abs(((textBox.left + textBox.right) / 2) - responseCenter) <= 1,
        `${label}: title is centered in the response box`,
      )
      assert.ok(
        textBox.top - responseBox.y <= 30,
        `${label}: title stays at the response-box top`,
      )
    } else if (['salutation', 'opening'].includes(part.role)) {
      assert.ok(
        textBox.left - responseBox.x <= 30,
        `${label}: ${part.role} stays left-aligned`,
      )
    } else {
      assert.ok(
        (responseBox.x + responseBox.width) - textBox.right <= 30,
        `${label}: ${part.role} stays right-aligned`,
      )
      if (part === lastBottomPart) {
        assert.ok(
          (responseBox.y + responseBox.height) - textBox.bottom <= 30,
          `${label}: ${part.role} stays at the response-box bottom`,
        )
      }
    }
  }
}

const printArtifacts = []
const providedConsumerIdentities = []

for (const consumerContract of [
  consumerContractRefs.screen,
  consumerContractRefs.print_pdf,
]) {
  const absent = applicationGroup(await publishAndLoad(
    'paper-zj-2020-jan',
    consumerContract,
  ))
  assert.equal(absent.groupType, 'writing')
  assert.equal(absent.questions.length, 0)
  assert.deepEqual(absent.answerRegion.givenTop, [])
  assert.deepEqual(absent.answerRegion.givenBottom, [])

  const provided = applicationGroup(await publishAndLoad(
    'paper-2026-i',
    consumerContract,
  ))
  assert.equal(provided.groupType, 'writing')
  assert.equal(provided.questions.length, 0)
  assert.deepEqual(
    provided.answerRegion.givenTop.map((part) => part.role),
    ['title'],
  )
  assert.deepEqual(provided.answerRegion.givenBottom, [])
  assert.equal(
    provided.promptBlocks.some((block) =>
      block.text.includes('投稿')),
    true,
  )
  assert.deepEqual(
    provided.promptBlocks.map((block) => ({
      nodeId: block.nodeId,
      inlineNodeIds: block.inlines.map((inline) => inline.nodeId),
      text: block.text,
    })),
    [
      {
        nodeId: 'para-2026-i-writing-app-title',
        inlineNodeIds: ['text:para-2026-i-writing-app-title'],
        text: providedPromptText,
      },
      {
        nodeId: providedNoticeBlockId,
        inlineNodeIds: [providedNoticeInlineId],
        text: providedNoticeText,
      },
    ],
  )
  assert.deepEqual(provided.wordCountRuling, {
    authorityObservationRef:
      'observation:application:group-2026-i-writing-application:word-count',
    countScope: 'student_authored_only',
    kind: 'approximate_target',
    sourceRef: {
      blockId: providedNoticeBlockId,
      inlineNodeIds: [providedNoticeInlineId],
    },
    target: 80,
  })
  assert.deepEqual(
    provided.answerRegion.givenTop.map((part) => ({
      givenPartId: part.givenPartId,
      blockRef: part.blockRef,
      role: part.role,
      placement: part.placement,
      text: part.text,
    })),
    [{
      givenPartId: providedTitlePartId,
      blockRef: providedTitleBlockId,
      role: 'title',
      placement: 'answer_region_top',
      text: 'Ranking My College Life Essentials',
    }],
  )
  assert.equal(provided.answerRegion.answerRegionRef, 'writing.application-box')
  assert.equal(provided.answerRegion.responseSlotId, 'writing.application')
  providedConsumerIdentities.push({
    semanticSignature: provided.semanticSignature,
    occurrenceSignature: provided.occurrenceSignature,
    responseSlotId: provided.answerRegion.responseSlotId,
    promptNodeIds: provided.promptBlocks.map((block) => block.nodeId),
    givenPartIds: provided.answerRegion.givenTop.map(
      (part) => part.givenPartId,
    ),
  })
}
assert.deepEqual(
  providedConsumerIdentities,
  Array.from(
    { length: 2 },
    () => providedConsumerIdentities[0],
  ),
)

const absentScreenConsumption = await publishAndLoad(
  'paper-zj-2020-jan',
  consumerContractRefs.screen,
)
const absentScreen = applicationSurface(absentScreenConsumption)
assert.equal(absentScreen.surfaceData.questions.length, 0)
assert.equal(absentScreen.surfaceData.textMap.paragraphs.length > 0, true)
assert.deepEqual(
  absentScreen.pageModel.blocks.find((block) => block.kind === 'answerBox'),
  {
    kind: 'answerBox',
    label: '应用文写作答题区',
    answerRegionRef: absentScreen.answerRegion.answerRegionRef,
    responseSlotId: absentScreen.answerRegion.responseSlotId,
    semanticSignature: absentScreen.semanticDigest,
    occurrenceSignature: absentScreen.occurrenceSignature,
    givenTop: [],
    givenBottom: [],
  },
)

const providedScreenConsumption = await publishAndLoad(
  'paper-2026-i',
  consumerContractRefs.screen,
)
const allFixedScreenConsumption = withAllApplicationFixedParts(
  providedScreenConsumption,
)
if (persistActualArtifacts) {
  for (const [label, consumption] of [
    ['absent', absentScreenConsumption],
    ['provided', providedScreenConsumption],
    ['all-fixed', allFixedScreenConsumption],
  ]) {
    writeFileSync(
      path.join(actualArtifactRoot, `consumption-${label}.json`),
      `${JSON.stringify(consumption, null, 2)}\n`,
    )
  }
}
const allFixedScreen = applicationSurface(allFixedScreenConsumption)
const allFixedScreenBox = allFixedScreen.pageModel.blocks.find(
  (block) => block.kind === 'answerBox',
)
assert.deepEqual(
  allFixedScreenBox.givenTop.map((part) => part.role),
  ['title', 'salutation', 'opening'],
)
assert.deepEqual(
  allFixedScreenBox.givenBottom.map((part) => part.role),
  ['closing', 'signature'],
)
const providedScreen = applicationSurface(providedScreenConsumption)
const providedScreenBox = providedScreen.pageModel.blocks.find(
  (block) => block.kind === 'answerBox',
)
const providedAsset = JSON.parse(readFileSync(
  new URL(
    '../app/public/paper-assets/paper-2026-i/latest/paper-asset.json',
    import.meta.url,
  ),
  'utf8',
))
const providedAssetGroupIndex = providedAsset.content.blocks.findIndex(
  (block) =>
    block.type === 'group'
    && block.groupId === 'group-2026-i-writing-application',
)
assert.notEqual(providedAssetGroupIndex, -1)
const providedAssetNotice = providedAsset.content.blocks[
  providedAssetGroupIndex + 1
]
assert.deepEqual(providedAssetNotice, {
  type: 'instruction',
  text: providedNoticeLines.join('\n'),
})
assert.equal(
  providedScreen.promptBlocks.find(
    (block) => block.nodeId === providedNoticeBlockId,
  )?.text,
  providedAssetNotice.text.replaceAll('\n', ''),
)
assert.deepEqual(providedScreenBox.givenTop.map((part) => part.role), ['title'])
assert.deepEqual(providedScreenBox.givenBottom, [])
assert.equal(
  providedScreen.pageModel.blocks.filter((block) => block.kind === 'passage').length,
  1,
)
assert.equal(
  providedScreen.pageModel.blocks.filter((block) => block.kind === 'answerBox').length,
  1,
)

for (const [label, consumption] of [
  ['absent', await publishAndLoad(
    'paper-zj-2020-jan',
    consumerContractRefs.print_pdf,
  )],
  ['provided', await publishAndLoad(
    'paper-2026-i',
    consumerContractRefs.print_pdf,
  )],
  ['all-fixed', withAllApplicationFixedParts(await publishAndLoad(
    'paper-2026-i',
    consumerContractRefs.print_pdf,
  ))],
]) {
  const paperId = consumption.paperId
  const groupId = applicationGroupId(consumption)
  const item = applicationExportItem(paperId, groupId)
  const canonical = applicationGroup(consumption)
  for (const versionType of ['student', 'teacher']) {
    const html = buildPrintHtml({
      title: `Application ${label}`,
      versionType,
      printStyle: 'exam',
      items: [item],
      blocks: [{
        type: 'question_group',
        questionGroupId: groupId,
        score: 15,
      }],
      questionNumberStart: 1,
      canonicalConsumption: consumption,
    })
    assert.equal(
      (html.match(/data-canonical-application-occurrence-signature=/g) || []).length,
      1,
    )
    assert.equal(
      (html.match(/data-canonical-response-slot-id=/g) || []).length,
      1,
    )
    assert.equal(html.includes('POISONED LEGACY'), false)
    assert.equal(html.includes(canonical.promptBlocks[0].text), true)
    assert.equal(
      (html.match(/data-canonical-given-part-id=/g) || []).length,
      canonical.answerRegion.givenTop.length
        + canonical.answerRegion.givenBottom.length,
    )
    if (label === 'provided') {
      assert.equal(
        (html.match(/data-canonical-application-notice-line=/g) || []).length,
        3,
      )
      for (const line of providedNoticeLines) {
        assert.equal((html.split(line).length - 1), 1)
      }
    }
    printArtifacts.push({ label, versionType, html, canonical })
    if (persistActualArtifacts) {
      writeFileSync(
        path.join(actualArtifactRoot, `print-${label}-${versionType}.html`),
        html,
      )
    }
  }
}

{
  const consumption = await publishAndLoad(
    'paper-2026-i',
    consumerContractRefs.print_pdf,
  )
  const groupId = applicationGroupId(consumption)
  const items = [
    applicationExportItem(consumption.paperId, groupId),
    continuationExportItem(),
  ]
  const blocks = items.map((item) => ({
    type: 'question_group',
    questionGroupId: item.detail.id,
    score: item.score,
  }))
  assert.throws(
    () => buildPrintHtml({
      title: 'Mixed writing regression',
      versionType: 'student',
      printStyle: 'exam',
      items,
      blocks,
      questionNumberStart: 1,
      canonicalConsumption: consumption,
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    'a canonical Application Writing plan cannot mix in a raw Continuation Writing group',
  )
}

async function assertActualPaperSurfaceArtifacts() {
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
    for (const { label, consumption } of [
      { label: 'absent', consumption: absentScreenConsumption },
      { label: 'provided', consumption: providedScreenConsumption },
      { label: 'all-fixed', consumption: allFixedScreenConsumption },
    ]) {
      const canonical = applicationGroup(consumption)
      const signatures = []
      for (const teacher of [false, true]) {
        const page = await browser.newPage({
          viewport: { width: 1280, height: 900 },
        })
        await page.route(
          '**/qa/canonical-application-writing-consumption.json',
          (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(consumption),
          }),
        )
        const url = new URL('canonical-application-writing-qa.html', appUrl)
        url.searchParams.set('groupId', canonical.groupId)
        if (teacher) url.searchParams.set('teacher', '1')
        await page.goto(url.href)
        const response = page.locator('[data-canonical-response-slot-id]')
        await response.waitFor()
        assert.equal(await response.count(), 1)
        assert.equal(
          await response.getAttribute(
            'data-canonical-application-semantic-signature',
          ),
          canonical.semanticSignature,
        )
        assert.equal(
          await response.getAttribute(
            'data-canonical-application-occurrence-signature',
          ),
          canonical.occurrenceSignature,
        )
        assert.equal(
          await response.getAttribute('data-canonical-response-slot-id'),
          canonical.answerRegion.responseSlotId,
        )
        assert.equal(
          await response.getAttribute('data-canonical-answer-region-ref'),
          canonical.answerRegion.answerRegionRef,
        )
        const responseBox = await response.boundingBox()
        assert.ok(responseBox)
        assert.ok(Math.abs(responseBox.width - (144 / 25.4 * 96)) <= 1)
        assert.ok(responseBox.height >= 245)
        assert.deepEqual(
          await page.locator(
            '[data-canonical-application-prompt] [data-canonical-block-id]',
          ).evaluateAll((elements) => elements.map(
            (element) => element.getAttribute('data-canonical-block-id'),
          )),
          canonical.promptBlocks.map((block) => block.nodeId),
        )
        assert.equal(
          await page.locator('[data-canonical-given-part-id]').count(),
          canonical.answerRegion.givenTop.length
            + canonical.answerRegion.givenBottom.length,
        )
        await assertBrowserFixedPartAlignment(
          page,
          response,
          canonical,
          `Screen ${label} ${teacher ? 'teacher' : 'student'}`,
        )
        const noticeLines = page.locator(
          '[data-canonical-application-notice-line]',
        )
        const numberedNoticeBlock = canonical.promptBlocks.find((block) =>
          /^注意[：:]\s*[(（]\d+[)）]/.test(block.text))
        if (numberedNoticeBlock) {
          const renderedNoticeLines = await noticeLines.evaluateAll(
            (elements) => elements.map((element) => ({
              kind: element.getAttribute(
                'data-canonical-application-notice-line',
              ),
              text: element.textContent,
              x: element.getBoundingClientRect().x,
              y: element.getBoundingClientRect().y,
            })),
          )
          assert.equal(renderedNoticeLines[0].kind, 'label')
          assert.equal(renderedNoticeLines[0].text, '注意：')
          assert.ok(renderedNoticeLines.length >= 2)
          for (const [index, line] of renderedNoticeLines.slice(1).entries()) {
            assert.equal(line.kind, 'instruction')
            assert.ok(line.y > renderedNoticeLines[index].y)
            assert.ok(line.x > renderedNoticeLines[0].x)
          }
          assert.equal(
            renderedNoticeLines.map((line) => line.text).join(''),
            numberedNoticeBlock.text.replaceAll(/\s/g, ''),
          )
          if (numberedNoticeBlock.text === providedNoticeText) {
            assert.deepEqual(
              renderedNoticeLines.map(({ kind, text }) => ({ kind, text })),
              providedNoticeLines.map((text, index) => ({
                kind: index === 0 ? 'label' : 'instruction',
                text,
              })),
            )
          }
        } else {
          assert.equal(await noticeLines.count(), 0)
        }
        if (
          canonical.answerRegion.givenTop.length > 0
          && canonical.answerRegion.givenBottom.length > 0
        ) {
          const firstTop = page.locator(
            `[data-canonical-given-part-id="${canonical.answerRegion.givenTop[0].givenPartId}"]`,
          )
          const firstBottom = page.locator(
            `[data-canonical-given-part-id="${canonical.answerRegion.givenBottom[0].givenPartId}"]`,
          )
          const [topY, bottomY, responseBottom] = await Promise.all([
            firstTop.evaluate((element) => element.getBoundingClientRect().top),
            firstBottom.evaluate((element) => element.getBoundingClientRect().top),
            response.evaluate((element) => element.getBoundingClientRect().bottom),
          ])
          assert.ok(topY < bottomY)
          assert.ok(responseBottom - bottomY < 80)
        }
        for (const part of [
          ...canonical.answerRegion.givenTop,
          ...canonical.answerRegion.givenBottom,
        ]) {
          const fixed = page.locator(
            `[data-canonical-given-part-id="${part.givenPartId}"]`,
          )
          assert.equal(await fixed.count(), 1)
          assert.equal(await fixed.innerText(), part.text)
        }
        const promptBottom = await page.locator(
          '[data-canonical-application-prompt]',
        ).evaluate((element) => element.getBoundingClientRect().bottom)
        const responseTop = await response.evaluate(
          (element) => element.getBoundingClientRect().top,
        )
        assert.ok(responseTop >= promptBottom)
        const bodyText = await page.locator('body').innerText()
        assert.equal(
          bodyText.includes('TEACHER SUPPLEMENT — not paper semantics'),
          teacher,
        )
        const compactBodyText = bodyText.replaceAll(/\s/g, '')
        for (const block of canonical.promptBlocks) {
          assert.equal(
            compactBodyText.split(block.text.replaceAll(/\s/g, '')).length - 1,
            1,
          )
        }
        signatures.push({
          semantic: await response.getAttribute(
            'data-canonical-application-semantic-signature',
          ),
          occurrence: await response.getAttribute(
            'data-canonical-application-occurrence-signature',
          ),
          response: await response.getAttribute(
            'data-canonical-response-slot-id',
          ),
          width: responseBox.width,
          height: responseBox.height,
        })
        if (persistActualArtifacts) {
          await page.screenshot({
            path: path.join(
              actualArtifactRoot,
              `${label}-${teacher ? 'teacher' : 'student'}.png`,
            ),
            fullPage: true,
          })
        }
        await page.close()
      }
      assert.deepEqual(signatures[0], signatures[1])
    }
    for (const { label, consumption } of [
      { label: 'provided', consumption: providedScreenConsumption },
      { label: 'all-fixed', consumption: allFixedScreenConsumption },
    ]) {
      const canonical = applicationGroup(consumption)
      const asset = JSON.parse(readFileSync(
        new URL(
          `../app/public/paper-assets/${consumption.paperId}/latest/paper-asset.json`,
          import.meta.url,
        ),
        'utf8',
      ))
      alignAssetGroupsToConsumption(asset, consumption)
      const legacyGroup = asset.content.groups[canonical.groupId]
      assert.equal(
        asset.content.blocks.some(
          (block) =>
            block.type === 'group'
            && block.groupId === canonical.groupId,
        ),
        true,
        'current Screen fixture keeps Application inside the complete whole paper',
      )
      legacyGroup.passage.paragraphs = [
        {
          paragraphId: 'poisoned-legacy-salutation',
          text: 'Dear Invented Legacy Reader,',
        },
        {
          paragraphId: 'poisoned-legacy-opening',
          text: 'POISONED LEGACY OPENING',
        },
        {
          paragraphId: 'poisoned-legacy-signature',
          text: 'Yours, Legacy Writer',
        },
      ]
      asset.content.writingTasks[legacyGroup.writingTaskId].applicationGiven = {
        top: ['POISONED LEGACY FIXED TOP'],
        bottom: ['POISONED LEGACY FIXED BOTTOM'],
      }
      const browserConsumption = consumption
      for (const lecture of [false, true]) {
        const page = await browser.newPage({
          viewport: { width: 1280, height: 900 },
        })
        await page.route(
          '**/api/paper-canonical/consumption?*',
          (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(browserConsumption),
          }),
        )
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
        url.searchParams.set('focusGroupId', canonical.groupId)
        if (lecture) url.searchParams.set('lecture', '1')
        await page.goto(url.href)
        const response = page.locator(
          `[data-canonical-response-slot-id="${canonical.answerRegion.responseSlotId}"]`,
        )
        try {
          await response.waitFor({ timeout: 10_000 })
        } catch (error) {
          throw new Error(
            `PaperBrowse did not mount canonical Application Writing (${label}, lecture=${lecture}): ${
              await page.locator('body').innerText()
            }`,
            { cause: error },
          )
        }
        assert.equal(await response.count(), 1)
        assert.equal(
          await response.getAttribute(
            'data-canonical-application-semantic-signature',
          ),
          canonical.semanticSignature,
        )
        const writingPage = response.locator('xpath=ancestor::*[@data-pi-writing-page]')
        const writingText = await writingPage.innerText()
        assert.equal(writingText.includes('POISONED LEGACY'), false)
        const compactWritingText = writingText.replaceAll(/\s/g, '')
        for (const block of canonical.promptBlocks) {
          assert.equal(
            compactWritingText.split(block.text.replaceAll(/\s/g, '')).length - 1,
            1,
          )
        }
        assert.equal(
          await writingPage.locator('[data-canonical-given-part-id]').count(),
          canonical.answerRegion.givenTop.length
            + canonical.answerRegion.givenBottom.length,
        )
        await page.close()
      }
    }
    {
      const pilotPaperId = 'paper-960d0f8d'
      const pilotGroupId = 'group-960d0f8d-writing-application'
      const pilotConsumption = structuredClone(providedScreenConsumption)
      pilotConsumption.paperId = pilotPaperId
      const applicationSelection = pilotConsumption.selections.find(
        (selection) =>
          selection.familyContractId === 'application-writing',
      )
      assert.ok(applicationSelection)
      applicationSelection.groupIds = [pilotGroupId]
      applicationSelection.projectedOccurrences =
        applicationSelection.projectedOccurrences.map((occurrence) => ({
          ...occurrence,
          groupId: pilotGroupId,
        }))
      const pilotAsset = JSON.parse(readFileSync(
        new URL(
          `../app/public/paper-assets/${pilotPaperId}/latest/paper-asset.json`,
          import.meta.url,
        ),
        'utf8',
      ))
      pilotAsset.content.blocks = pilotAsset.content.blocks.filter(
        (block) =>
          block.type === 'group'
          && block.groupId === pilotGroupId,
      )
      const browserPilotConsumption = consumptionForAssetBlocks(
        pilotConsumption,
        pilotAsset,
      )
      const pilotAnalysis = JSON.parse(readFileSync(
        new URL(
          `../app/public/paper-assets/${pilotPaperId}/latest/analyses/writing-analysis-v1.json`,
          import.meta.url,
        ),
        'utf8',
      ))
      assert.equal(
        Object.hasOwn(
          pilotAnalysis.groups[pilotGroupId].writing,
          'highlightExpressions',
        ),
        false,
        'accepted Application pilot keeps highlightExpressions optional',
      )
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      })
      let writingAnalysisRequestCount = 0
      await page.route(
        '**/api/paper-canonical/consumption?*',
        (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(browserPilotConsumption),
        }),
      )
      await page.route('**/paper-assets/**/paper-asset.json', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(pilotAsset),
        }))
      await page.route('**/paper-assets/**/analyses/**', (route) => {
        if (route.request().url().endsWith(
          '/analyses/writing-analysis-v1.json',
        )) {
          writingAnalysisRequestCount += 1
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(pilotAnalysis),
          })
        }
        return route.fulfill({ status: 404, body: '' })
      })
      await page.route('**/paper-assets/**/figures/**', (route) =>
        route.fulfill({ status: 404, body: '' }))
      const url = new URL('canonical-consumption-qa.html', appUrl)
      url.searchParams.set('paperId', pilotPaperId)
      url.searchParams.set('focusGroupId', pilotGroupId)
      url.searchParams.set('lecture', '1')
      await page.goto(url.href)
      await page.locator('.paper-browse-error').waitFor({
        timeout: 10_000,
      })
      assert.equal(
        writingAnalysisRequestCount,
        0,
        'a remapped partial current Plan rejects before optional Analysis fetch',
      )
      assert.match(
        await page.locator('.paper-browse-error').innerText(),
        /absent, duplicated, or outside the Consumption Plan|partial or ambiguous|disagrees with ordered Consumption Plan Groups/,
      )
      await page.close()
    }
    {
      const consumption = providedScreenConsumption
      const canonical = applicationGroup(consumption)
      const asset = JSON.parse(readFileSync(
        new URL(
          '../app/public/paper-assets/paper-2026-i/latest/paper-asset.json',
          import.meta.url,
        ),
        'utf8',
      ))
      alignAssetGroupsToConsumption(asset, consumption)
      const writingPartIndex = asset.content.blocks.findIndex(
        (block) =>
          block.type === 'partHeading'
          && block.partId === 'part-2026-i-writing',
      )
      assert.notEqual(writingPartIndex, -1)
      const applicationGroupIndex = asset.content.blocks.findIndex(
        (block) =>
          block.type === 'group'
          && block.groupId === canonical.groupId,
      )
      assert.notEqual(applicationGroupIndex, -1)
      const applicationAnswerBoxIndex = asset.content.blocks.findIndex(
        (block) =>
          block.type === 'answerBox'
          && block.writingTaskId
            === asset.content.groups[canonical.groupId].writingTaskId,
      )
      assert.ok(applicationAnswerBoxIndex > applicationGroupIndex)
      asset.content.blocks = asset.content.blocks.map((block, index) => {
        if (
          index < writingPartIndex
          || index > applicationAnswerBoxIndex
        ) return block
        if (block.type === 'partHeading') {
          return { ...block, text: 'POISONED LEGACY APPLICATION PART HEADING' }
        }
        if (block.type === 'sectionHeading') {
          return { ...block, text: 'POISONED LEGACY APPLICATION SECTION HEADING' }
        }
        if (block.type === 'instruction') {
          return { ...block, text: 'POISONED LEGACY APPLICATION INSTRUCTION' }
        }
        return block
      })
      const chromeConsumption = structuredClone(consumption)
      const continuationGroupId = asset.content.blocks.find(
        (block) =>
          block.type === 'group'
          && asset.content.groups[block.groupId]?.groupType === 'writing'
          && asset.content.writingTasks[
            asset.content.groups[block.groupId].writingTaskId
          ]?.taskType === 'continuation',
      )?.groupId
      assert.ok(continuationGroupId)
      const continuationSelection = chromeConsumption.selections.find(
        (selection) =>
          selection.familyContractId === 'continuation-writing',
      )
      assert.ok(continuationSelection)
      continuationSelection.groupIds = [continuationGroupId]
      continuationSelection.projectedOccurrences =
        continuationSelection.projectedOccurrences.map((occurrence) => ({
          ...occurrence,
          groupId: continuationGroupId,
        }))
      const browserConsumption = chromeConsumption
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      })
      await page.route(
        '**/api/paper-canonical/consumption?*',
        (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(browserConsumption),
        }),
      )
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
      url.searchParams.set('focusGroupId', canonical.groupId)
      await page.goto(url.href)
      const response = page.locator(
        `[data-canonical-response-slot-id="${canonical.answerRegion.responseSlotId}"]`,
      )
      await response.waitFor({ timeout: 10_000 })
      const writingPages = page.locator('[data-pi-writing-page]')
      assert.equal(await writingPages.count(), 2)
      const applicationPage = response.locator(
        'xpath=ancestor::*[@data-pi-writing-page]',
      )
      const applicationText = await applicationPage.innerText()
      for (const expected of [
        '第四部分 写作（共两节，满分40分）',
        '第一节 （满分 15 分）',
      ]) {
        assert.equal(
          applicationText.includes(expected),
          true,
          `real mixed Screen consumes canonical Application chrome: ${expected}`,
        )
      }
      assert.equal(
        applicationText.includes('POISONED LEGACY APPLICATION'),
        false,
        'real mixed Screen rejects legacy Application chrome',
      )
      assert.equal(canonical.paperChrome.instructions.length, 0)
      assert.equal(
        await applicationPage.locator('.pi-writing-instruction').count(),
        0,
        'real mixed Screen preserves the Profile-owned empty instruction set',
      )
      const continuationText = await writingPages.nth(1).innerText()
      const canonicalContinuation = projectCanonicalConsumerGroup({
        consumption: browserConsumption,
        familyContractId: 'continuation-writing',
        groupId: continuationGroupId,
      })
      for (const expected of [
        canonicalContinuation.paperChrome.section.text,
        ...canonicalContinuation.paperChrome.instructions.map(
          (instruction) => instruction.text,
        ),
      ]) {
        assert.equal(
          continuationText.includes(expected),
          true,
          `real mixed Screen preserves Continuation chrome: ${expected}; actual: ${continuationText}`,
        )
      }
      await page.close()
    }
    const printGeometry = new Map()
    for (const { label, versionType, html, canonical } of printArtifacts) {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      assert.equal(
        await page.locator(
          '[data-canonical-application-occurrence-signature]',
        ).count(),
        1,
      )
      const response = page.locator('[data-canonical-response-slot-id]')
      const responseBox = await response.boundingBox()
      assert.ok(responseBox)
      assert.ok(Math.abs(responseBox.width - (144 / 25.4 * 96)) <= 1)
      assert.ok(Math.abs(responseBox.height - (65 / 25.4 * 96)) <= 1)
      assert.equal(html.includes('（教师版 含答案解析）'), versionType === 'teacher')
      const geometryKey = `${responseBox.width.toFixed(2)}:${responseBox.height.toFixed(2)}`
      const priorGeometry = printGeometry.get(label)
      if (priorGeometry) assert.equal(geometryKey, priorGeometry)
      else printGeometry.set(label, geometryKey)
      if (
        canonical.answerRegion.givenTop.length > 0
        && canonical.answerRegion.givenBottom.length > 0
      ) {
        const topY = await page.locator(
          `[data-canonical-given-part-id="${canonical.answerRegion.givenTop[0].givenPartId}"]`,
        ).evaluate((element) => element.getBoundingClientRect().top)
        const bottomY = await page.locator(
          `[data-canonical-given-part-id="${canonical.answerRegion.givenBottom[0].givenPartId}"]`,
        ).evaluate((element) => element.getBoundingClientRect().top)
        assert.ok(topY < bottomY)
      }
      await assertBrowserFixedPartAlignment(
        page,
        response,
        canonical,
        `Print HTML ${label} ${versionType}`,
      )
      const pdfRoot = mkdtempSync(path.join(tmpdir(), 'eqb-application-pdf-'))
      try {
        const pdfPath = path.join(pdfRoot, `${label}-${versionType}.pdf`)
        await page.pdf({
          path: pdfPath,
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
        })
        const bytes = readFileSync(pdfPath)
        assert.equal(bytes.subarray(0, 4).toString(), '%PDF')
        const renderedPageCount = pdfPageCount(pdfPath)
        const pageCountKey = `${label}:pages`
        const priorPageCount = printGeometry.get(pageCountKey)
        if (priorPageCount) assert.equal(renderedPageCount, priorPageCount)
        else printGeometry.set(pageCountKey, renderedPageCount)
        const pdfText = execFileSync(
          'pdftotext',
          ['-layout', pdfPath, '-'],
          { encoding: 'utf8' },
        )
        const compactPdfText = pdfText.replaceAll(/\s/g, '')
        assert.equal(compactPdfText.includes('POISONEDLEGACY'), false)
        for (const block of canonical.promptBlocks) {
          assert.equal(
            compactPdfText.split(block.text.replaceAll(/\s/g, '')).length - 1,
            1,
          )
        }
        for (const part of [
          ...canonical.answerRegion.givenTop,
          ...canonical.answerRegion.givenBottom,
        ]) {
          assert.equal(
            compactPdfText.split(part.text.replaceAll(/\s/g, '')).length - 1,
            1,
          )
        }
        if (
          canonical.answerRegion.givenTop.length > 0
          && canonical.answerRegion.givenBottom.length > 0
        ) {
          assert.equal(
            pdfPageContainingText(
              pdfPath,
              canonical.answerRegion.givenTop[0].text,
            ),
            pdfPageContainingText(
              pdfPath,
              canonical.answerRegion.givenBottom[0].text,
            ),
          )
        }
        assertApplicationFixedPartPdfAlignment(
          pdfPath,
          canonical,
          `Print PDF ${label} ${versionType}`,
        )
        assertNumberedNoticePdfLayout(
          pdfPath,
          canonical,
          `Print PDF ${label} ${versionType}`,
        )
        if (persistActualArtifacts) {
          copyFileSync(
            pdfPath,
            path.join(
              actualArtifactRoot,
              `print-${label}-${versionType}.pdf`,
            ),
          )
        }
      } finally {
        rmSync(pdfRoot, { recursive: true, force: true })
      }
      await page.close()
    }
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

await assertActualPaperSurfaceArtifacts()

console.log('paper canonical Application Writing rendered behavior verification passed')
