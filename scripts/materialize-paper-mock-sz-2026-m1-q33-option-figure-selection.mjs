import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createVisualImportCandidate } from '../server/paper-canonical/visualCandidate.mjs'
import { inspectPng } from '../shared/paper-canonical/png.mjs'
import { readingOptionFigureLayoutRef } from '../shared/paper-canonical/readingOptionFigureLayout.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const paperRoot = path.join(
  repoRoot,
  'scripts/import-pipeline/papers/paper-mock-sz-2026-m1',
)
const evidenceRoot = path.join(paperRoot, 'visual-candidates/q33')
const sourcePdfPath = '/Users/huangxuewei/Desktop/试卷题库/05_真题模拟与试卷库/各地模拟/2026年3月高三试卷/26年3月高三试卷/26.3广东深圳高三一模英语试卷.pdf'
const pipelineStripPath = path.join(paperRoot, 'figures/reading-d-q33.png')
const publicStripPath = path.join(
  repoRoot,
  'app/public/paper-assets/paper-mock-sz-2026-m1/latest/figures/reading-d-q33.png',
)

const groupId = 'group-mock-sz-2026-m1-reading-d'
const questionId = 'q-mock-sz-2026-m1-033'
const labels = ['A', 'B', 'C', 'D']
const placementByLabel = {
  A: {
    pdfXObject: '/IM58',
    pdfObject: '58 0',
    intrinsicWidth: 43,
    intrinsicHeight: 105,
    matrix: [20.52, 0, 0, -51.48, 74.64, 658.56],
    command: 'q 20.52 0 0 -51.48 74.64 658.56 cm /IM58 Do Q',
  },
  B: {
    pdfXObject: '/IM59',
    pdfObject: '59 0',
    intrinsicWidth: 49,
    intrinsicHeight: 105,
    matrix: [24.6, 0, 0, -51.96, 194.04, 658.56],
    command: 'q 24.6 0 0 -51.96 194.04 658.56 cm /IM59 Do Q',
  },
  C: {
    pdfXObject: '/IM60',
    pdfObject: '60 0',
    intrinsicWidth: 45,
    intrinsicHeight: 105,
    matrix: [22.08, 0, 0, -51.96, 314.04, 657.84],
    command: 'q 22.08 0 0 -51.96 314.04 657.84 cm /IM60 Do Q',
  },
  D: {
    pdfXObject: '/IM61',
    pdfObject: '61 0',
    intrinsicWidth: 40,
    intrinsicHeight: 105,
    matrix: [19.56, 0, 0, -51.96, 410.16, 659.52],
    command: 'q 19.56 0 0 -51.96 410.16 659.52 cm /IM61 Do Q',
  },
}

const restorationPrompts = {
  A: 'Use case: scientific-educational. Edit mode: precise preservation. Asset type: Option A source-faithful diagram restoration for exact teacher comparison. Input image 1 is the sole edit target. Primary request: only remove JPEG/capture noise, improve edge clarity, and upscale this exact black-and-white diagram. Preserve exactly the outer bordered vertical tube, the count and top-to-bottom order of every visible connected wavy lobe and constriction, their orientation, containment, connectivity, gaps, dark/light topology, relative aspect ratio, and internal whitespace. Keep the composition centered on a plain white background. Do not redesign or reinterpret. Do not add text, labels, arrows, color, gradients, texture, extra borders, shapes, gaps, or watermarks. Do not remove, merge, split, relabel, rotate, crop, stretch, or stylize any shape. The output must contain only the same diagram, clearer and higher resolution, with no answer hint.',
  B: 'Use case: scientific-educational. Edit mode: precise preservation. Asset type: Option B source-faithful diagram restoration for exact teacher comparison. Input image 1 is the sole edit target. Primary request: only remove JPEG/capture noise, improve edge clarity, and upscale this exact black-and-white diagram. Preserve exactly the outer bordered vertical tube, exactly two separated droplet-like bodies, their top-to-bottom order and orientation, the source-authored light gap between them, their containment, connectivity within each body, dark/light topology, relative aspect ratio, and internal whitespace. Keep the composition centered on a plain white background. Do not redesign or reinterpret. Do not add text, labels, arrows, color, gradients, texture, extra borders, shapes, gaps, or watermarks. Do not remove, merge, split, relabel, rotate, crop, stretch, or stylize any shape. The output must contain only the same diagram, clearer and higher resolution, with no answer hint.',
  C: 'Use case: scientific-educational. Edit mode: precise preservation. Asset type: Option C source-faithful diagram restoration for exact teacher comparison. Input image 1 is the sole edit target. Primary request: only remove JPEG/capture noise, improve edge clarity, and upscale this exact black-and-white diagram. Preserve exactly the outer bordered vertical tube and one uninterrupted dark vertical fill from top to bottom, including its original narrow edge highlights/noise structure only where already visible, its orientation, containment, connectivity, lack of horizontal gaps, dark/light topology, relative aspect ratio, and internal whitespace. Keep the composition centered on a plain white background. Do not redesign or reinterpret. Do not add text, labels, arrows, color, gradients, texture, extra borders, shapes, gaps, segments, or watermarks. Do not remove, merge, split, relabel, rotate, crop, stretch, or stylize any shape. The output must contain only the same diagram, clearer and higher resolution, with no answer hint.',
  D: 'Use case: scientific-educational. Edit mode: precise preservation. Asset type: Option D source-faithful diagram restoration for exact teacher comparison. Input image 1 is the sole edit target. Primary request: only remove JPEG/capture noise, improve edge clarity, and upscale this exact black-and-white diagram. Preserve exactly the outer bordered vertical tube, exactly three dark vertical mini-columns in their original top-to-bottom order, exactly two horizontal light gaps separating them, their orientation, containment, connectivity within each dark mini-column, gap widths and placements, dark/light topology, relative aspect ratio, and internal whitespace. Keep the composition centered on a plain white background. Do not redesign or reinterpret. Do not add text, labels, arrows, color, gradients, texture, extra borders, shapes, gaps, or watermarks. Do not remove, merge, split, relabel, rotate, crop, stretch, or stylize any shape. The output must contain only the same diagram, clearer and higher resolution, with no answer hint.',
}

const builtInOutputs = {
  A: '/Users/huangxuewei/.codex/generated_images/01a0343a-8dfa-7752-b598-2994c81fba73/exec-0e8131e0-c0b1-4048-a600-b951d631b1f3.png',
  B: '/Users/huangxuewei/.codex/generated_images/01a0343a-8dfa-7752-b598-2994c81fba73/exec-8f32959c-63f9-4896-aa56-62edb95d8175.png',
  C: '/Users/huangxuewei/.codex/generated_images/01a0343a-8dfa-7752-b598-2994c81fba73/exec-7b454fd0-4787-4842-af63-c6891c17606f.png',
  D: '/Users/huangxuewei/.codex/generated_images/01a0343a-8dfa-7752-b598-2994c81fba73/exec-f57d5138-4aa6-4207-aee4-2a5b1f845324.png',
}

const visualIssues = {
  source_crop: {
    A: [], B: [], C: [], D: [],
  },
  vector_authored: {
    A: ['The authored reconstruction simplifies fine internal contours and must not be treated as source-faithful without Owner review.'],
    B: ['The authored contours regularize the two source droplets and their edge highlights; exact fidelity remains unresolved.'],
    C: ['The authored uninterrupted fill deliberately omits source raster texture; exact edge relationships remain unresolved.'],
    D: ['The authored rectangles regularize source edge texture and both gap dimensions; exact fidelity remains unresolved.'],
  },
  reference_restored: {
    A: ['The generated edit materially invents and rearranges internal lobe topology; retain as evidence but do not select without explicit Owner acceptance.'],
    B: ['The two-body topology remains visible, but the central separation and highlight contours are regularized and need exact Owner review.'],
    C: ['The uninterrupted fill remains visible, but the edit adds or regularizes edge-light features and surface texture.'],
    D: ['The three dark regions and two light gaps remain visible, but gap proportions, border, and internal whitespace are visibly regularized.'],
  },
}

function owner(label) {
  return {
    kind: 'reading_option',
    groupId,
    questionId,
    optionId: `option:${questionId}:${label}`,
  }
}

function observationId(label) {
  return `observation:paper-mock-sz-2026-m1:q33:option:${label}`
}

function stableId(prefix, value) {
  return `${prefix}:${digestJson(value).slice('sha256:'.length, 28)}`
}

async function bytesAt(filePath) {
  return new Uint8Array(await fs.readFile(filePath))
}

function immutableDocument({ inputKey, roles, mediaType, originalName, bytes }) {
  const digest = sha256(bytes)
  const documentId = stableId('document', { digest, roles, inputKey })
  const artifactId = stableId('source-document', { sha256: digest })
  return {
    documentId,
    inputKey,
    roles,
    mediaType,
    originalName,
    byteLength: bytes.byteLength,
    sha256: digest,
    immutableArtifactRef: {
      artifactId,
      relativePath: `source-evidence/${artifactId.slice('source-document:'.length)}.bin`,
      sha256: digest,
      byteLength: bytes.byteLength,
    },
    encodedBytes: Buffer.from(bytes).toString('base64'),
  }
}

function pageRegion(matrix) {
  const [width, , , negativeHeight, x, top] = matrix
  const pageWidth = 595
  const pageHeight = 841.9
  return {
    kind: 'page_region',
    page: 4,
    region: {
      x: x / pageWidth,
      y: (pageHeight - top) / pageHeight,
      width: width / pageWidth,
      height: Math.abs(negativeHeight) / pageHeight,
    },
  }
}

function sourceTruthChecklist(label) {
  const common = [
    ['orientation', 'The single bordered tube remains vertical with the source top-to-bottom orientation.'],
    ['containment', 'Every meaning-bearing dark or light region remains contained inside the single source tube.'],
    ['labels', 'No question stem or A-D glyph is inside the image; the renderer owns every Option label.'],
    ['aspect_ratio', 'The source object relative aspect ratio is preserved without crop or stretch.'],
    ['internal_whitespace', 'Source-authored internal whitespace and edge clearance remain meaning-bearing and are not normalized away.'],
  ]
  const byLabel = {
    A: [
      ['count', 'One tube retains every visible connected wavy lobe and constriction.'],
      ['order', 'All visible lobes and constrictions retain their source top-to-bottom order.'],
      ['connectivity', 'The source-connected wavy flow remains connected through its constrictions.'],
      ['gaps', 'Only irregular source-visible separations are present; no clean rectangular air-gap pattern is invented.'],
      ['dark_light_topology', 'The alternating dark boundaries and light internal regions retain the source topology.'],
      ['independent_option_relationship', 'The upper spiral-like lobe, central elongated lobe, lower constriction, and bottom lobe retain their independent source-visible relationships.'],
    ],
    B: [
      ['count', 'Exactly two separated droplet-like bodies remain inside one tube.'],
      ['order', 'The smaller upper body remains above the larger lower body.'],
      ['connectivity', 'Each droplet body remains internally connected while the two bodies remain mutually disconnected.'],
      ['gaps', 'The source-authored light separation between the two droplet bodies remains open.'],
      ['dark_light_topology', 'Both dark droplet bodies and their source-visible light highlights retain their topology.'],
      ['independent_option_relationship', 'The central light gap independently separates the pointed ends of the upper and lower droplets.'],
    ],
    C: [
      ['count', 'Exactly one uninterrupted dark vertical fill remains inside one tube.'],
      ['order', 'The fill remains a single top-to-bottom region with no reordered segment.'],
      ['connectivity', 'The dark fill remains connected from top to bottom.'],
      ['gaps', 'No horizontal light gap or segmentation is introduced.'],
      ['dark_light_topology', 'One continuous dark interior remains bounded by the source tube edges.'],
      ['independent_option_relationship', 'The uninterrupted top-to-bottom fill remains independent of narrow source-visible edge highlights.'],
    ],
    D: [
      ['count', 'Exactly three dark vertical mini-columns and exactly two horizontal light gaps remain.'],
      ['order', 'Dark, light, dark, light, dark regions retain their source top-to-bottom order.'],
      ['connectivity', 'Each dark mini-column remains internally connected and disconnected from the other two.'],
      ['gaps', 'Exactly two horizontal light gaps retain their source positions between the three dark regions.'],
      ['dark_light_topology', 'Three dark regions alternate with two light gaps inside one bordered tube.'],
      ['independent_option_relationship', 'Each of the two light gaps independently separates its adjacent pair of dark mini-columns.'],
    ],
  }
  return [...byLabel[label], ...common].map(([relationship, sourceTruth]) => ({
    relationship,
    sourceTruth,
  }))
}

async function pngArtifact(filePath) {
  const bytes = await bytesAt(filePath)
  const dimensions = inspectPng(bytes)
  if (!dimensions) throw new Error(`Not one complete PNG: ${filePath}`)
  return {
    mimeType: 'image/png',
    encodedBytes: Buffer.from(bytes).toString('base64'),
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
    pixelWidth: dimensions.width,
    pixelHeight: dimensions.height,
  }
}

function candidatePath(method, label) {
  return path.join(evidenceRoot, `candidates/${method}/${label}.png`)
}

async function makeSourceCapture() {
  const questionPdf = immutableDocument({
    inputKey: 'q33_question_pdf',
    roles: ['question_source', 'source_provenance'],
    mediaType: 'application/pdf',
    originalName: 'paper.pdf',
    bytes: await bytesAt(sourcePdfPath),
  })
  const strip = immutableDocument({
    inputKey: 'q33_full_strip_baseline',
    roles: ['source_figure_evidence', 'comparison_baseline'],
    mediaType: 'image/png',
    originalName: 'reading-d-q33.png',
    bytes: await bytesAt(pipelineStripPath),
  })
  const rawDocuments = Object.fromEntries(await Promise.all(labels.map(async (label) => [
    label,
    immutableDocument({
      inputKey: `q33_pdf_xobject_${label}`,
      roles: ['source_figure_evidence', 'pdf_xobject_raw_stream'],
      mediaType: 'image/jpeg',
      originalName: `q33-option-${label}-xobject.jpg`,
      bytes: await bytesAt(path.join(evidenceRoot, `source-objects/${label}.jpg`)),
    }),
  ])))
  const observations = labels.map((label, order) => {
    const placement = placementByLabel[label]
    const raw = rawDocuments[label]
    return {
      observationId: observationId(label),
      documentId: questionPdf.documentId,
      kind: 'source_figure',
      value: {
        sourcePage: 4,
        sourcePosition: order,
        sourcePositionRule: 'pdf_page_4_xobject_placement_left_to_right',
        targetOwner: owner(label),
        pdfXObject: placement.pdfXObject,
        pdfObject: placement.pdfObject,
        placementCommand: placement.command,
        placementMatrix: placement.matrix,
        rawImageDocumentRef: {
          documentId: raw.documentId,
          inputKey: raw.inputKey,
          sha256: raw.sha256,
          byteLength: raw.byteLength,
          pixelWidth: placement.intrinsicWidth,
          pixelHeight: placement.intrinsicHeight,
        },
        fullStripBaselineRef: {
          documentId: strip.documentId,
          inputKey: strip.inputKey,
          sha256: strip.sha256,
          byteLength: strip.byteLength,
          pixelWidth: 1380,
          pixelHeight: 220,
        },
      },
      order,
      extraction: {
        adapterId: 'pdf-xobject-source-position',
        version: '1',
      },
      sourceSpanId: `source-span:${observationId(label)}`,
    }
  })
  const sourceSpans = labels.map((label) => ({
    sourceSpanId: `source-span:${observationId(label)}`,
    documentId: questionPdf.documentId,
    documentDigest: questionPdf.sha256,
    coordinate: pageRegion(placementByLabel[label].matrix),
  }))
  const base = {
    schemaVersion: 'source-capture-v1',
    documents: [questionPdf, strip, ...labels.map((label) => rawDocuments[label])],
    observations,
    sourceSpans,
    assertions: [],
  }
  const digest = digestJson(base)
  return {
    ...base,
    captureId: stableId('source-capture', base),
    digest,
  }
}

async function buildCandidateRequest() {
  const sourceCapture = await makeSourceCapture()
  const observations = await Promise.all(labels.map(async (label) => ({
    observationId: observationId(label),
    owner: owner(label),
    sourceCrop: await pngArtifact(candidatePath('source_crop', label)),
  })))
  const candidates = []
  for (const label of labels) {
    const checklist = sourceTruthChecklist(label)
    const vectorBytes = await bytesAt(path.join(evidenceRoot, `vector-evidence/${label}.svg`))
    candidates.push({
      observationId: observationId(label),
      owner: owner(label),
      method: 'source_crop',
      artifact: await pngArtifact(candidatePath('source_crop', label)),
      sourceTruthChecklist: checklist,
      reproducibility: {
        tool: 'Poppler pdfimages 26.08.0 exact JPEG extraction; Pillow 12.3.0 RGB decode',
        exportSettings: 'PNG, native intrinsic dimensions, RGB, optimize=false, compress_level=9, no semantic edit',
      },
    })
    candidates.push({
      observationId: observationId(label),
      owner: owner(label),
      method: 'vector_authored',
      artifact: await pngArtifact(candidatePath('vector_authored', label)),
      sourceTruthChecklist: checklist,
      reproducibility: {
        editableVector: `vector-evidence/${label}.svg ${sha256(vectorBytes)}`,
        tool: 'librsvg rsvg-convert 2.62.1',
        exportSettings: `deterministic PNG export at 8x intrinsic dimensions (${placementByLabel[label].intrinsicWidth * 8}x840), RGB`,
      },
    })
    candidates.push({
      observationId: observationId(label),
      owner: owner(label),
      method: 'reference_restored',
      artifact: await pngArtifact(candidatePath('reference_restored', label)),
      sourceTruthChecklist: checklist,
      reproducibility: {
        prompt: restorationPrompts[label],
        tool: 'built-in image_gen.imagegen default edit path; one local edit target; no CLI or API fallback',
        model: 'built-in default; exact model identifier not exposed by the tool response',
        exportSettings: 'built-in PNG copied byte-for-byte from $CODEX_HOME/generated_images; no post-processing',
      },
    })
  }
  return { sourceCapture, observations, candidates }
}

function withoutEncodedBytes(artifact) {
  const { encodedBytes: _encodedBytes, ...metadata } = artifact
  return metadata
}

async function makeComparisonManifest(candidatePackage) {
  const pipelineStrip = await bytesAt(pipelineStripPath)
  const publicStrip = await bytesAt(publicStripPath)
  if (!Buffer.from(pipelineStrip).equals(Buffer.from(publicStrip))) {
    throw new Error('The two immutable Q33 strip baselines differ')
  }
  const sourceCaptureObservations = new Map(
    candidatePackage.sourceCapture.observations.map((entry) => [entry.observationId, entry]),
  )
  const body = {
    schemaVersion: 'q33-visual-comparison-manifest-v1',
    paperId: 'paper-mock-sz-2026-m1',
    questionId,
    state: 'awaiting_owner_exact_digest_selection',
    packageDigest: candidatePackage.packageDigest,
    sourceCaptureRef: candidatePackage.sourceCaptureRef,
    baseline: {
      role: 'immutable_full_strip_comparison_only',
      relativePath: '../../figures/reading-d-q33.png',
      sha256: sha256(pipelineStrip),
      byteLength: pipelineStrip.byteLength,
      pixelWidth: 1380,
      pixelHeight: 220,
      byteIdenticalTrackedCopies: [
        'scripts/import-pipeline/papers/paper-mock-sz-2026-m1/figures/reading-d-q33.png',
        'app/public/paper-assets/paper-mock-sz-2026-m1/latest/figures/reading-d-q33.png',
      ],
    },
    layout: {
      layoutRef: readingOptionFigureLayoutRef,
      rowStartPt: 17.3,
      rowWidthPt: 438.2,
      trackCount: 4,
      trackWidthPt: 109.55,
      labelFontSizePt: 10.5,
      labelLineHeightPt: 18,
      labelToBoxGapPt: 4.5,
      imageBoxWidthPt: 96,
      imageBoxHeightPt: 60,
      objectFit: 'contain',
      objectPosition: 'center',
      background: '#ffffff',
      crop: false,
      stretch: false,
    },
    selection: {
      default: 'unresolved',
      confirmationSchemaVersion: 'visual-teacher-confirmation-v1',
      requiredBindings: ['packageDigest', 'observationId', 'completeOwner', 'selectedCandidateDigest'],
      sourceCropIsEqualFallback: true,
    },
    observations: candidatePackage.observations.map((observation) => {
      const sourceObservation = sourceCaptureObservations.get(observation.observationId)
      return {
        observationId: observation.observationId,
        owner: observation.owner,
        source: sourceObservation.value,
        sourceTruthChecklist: sourceTruthChecklist(observation.owner.optionId.at(-1)),
        candidates: candidatePackage.candidates
          .filter((candidate) => candidate.observationId === observation.observationId)
          .map((candidate) => ({
            method: candidate.method,
            candidateDigest: candidate.candidateDigest,
            artifact: withoutEncodedBytes(candidate.artifact),
            relativePath: `candidates/${candidate.method}/${observation.owner.optionId.at(-1)}.png`,
            reproducibility: candidate.reproducibility,
            builtInGeneratedSource: candidate.method === 'reference_restored'
              ? builtInOutputs[observation.owner.optionId.at(-1)]
              : null,
            agentVisualStatus: visualIssues[candidate.method][observation.owner.optionId.at(-1)].length > 0
              ? 'visual_issue_requires_owner_review'
              : 'unresolved_owner_review_required',
            agentVisualIssues: visualIssues[candidate.method][observation.owner.optionId.at(-1)],
          })),
      }
    }),
  }
  return { ...body, manifestDigest: digestJson(body) }
}

function comparisonHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>Shenzhen Q33 exact visual candidate selection</title>
  <style>
    :root { font-family: ui-sans-serif, system-ui, sans-serif; color: #171717; background: #f3f4f6; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; }
    main { max-width: 1180px; margin: 0 auto; background: #fff; padding: 28px; border: 1px solid #d4d4d4; border-radius: 16px; }
    h1, h2 { margin: 0 0 12px; }
    p { line-height: 1.5; }
    code { overflow-wrap: anywhere; }
    .warning { padding: 12px 14px; background: #fff7ed; border: 1px solid #fdba74; border-radius: 10px; }
    .baseline { max-width: 690px; width: 100%; height: auto; border: 1px solid #d4d4d4; background: #fff; }
    .candidate-set { margin: 28px 0; overflow-x: auto; }
    .target-row { display: grid; grid-template-columns: repeat(4, 109.55pt); width: 438.2pt; min-width: 438.2pt; background: #fff; }
    .track { width: 109.55pt; }
    .option-label { display: block; font: 10.5pt/18pt Georgia, serif; height: 18pt; }
    .image-box { width: 96pt; height: 60pt; margin-top: 4.5pt; display: flex; align-items: center; justify-content: center; background: #fff; overflow: hidden; }
    .image-box img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; }
    .meta { width: 438.2pt; min-width: 438.2pt; display: grid; grid-template-columns: repeat(4, 109.55pt); gap: 0; margin-top: 10px; font-size: 11px; color: #525252; }
    .meta > div { padding-right: 12px; overflow-wrap: anywhere; }
    .issue { color: #9a3412; }
    .selection-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    label { display: grid; gap: 6px; font-weight: 650; }
    select, button, textarea { font: inherit; }
    .selection-grid > label { min-width: 0; }
    select { width: 100%; min-width: 0; padding: 9px; }
    button { margin-top: 14px; padding: 10px 14px; cursor: pointer; }
    textarea { width: 100%; min-height: 260px; margin-top: 12px; font-family: ui-monospace, monospace; font-size: 12px; }
    details { margin: 10px 0; }
    @media (max-width: 760px) { .selection-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<main>
  <h1>Shenzhen Reading D Q33 - exact candidate selection</h1>
  <p class="warning"><strong>Stop A.</strong> Nothing on this page is Canonical. No selection is the default. Opening or exporting this page is not Owner acceptance.</p>
  <p id="package"></p>
  <h2>Immutable full-strip baseline</h2>
  <img class="baseline" src="../../figures/reading-d-q33.png" alt="Immutable Q33 full-strip source evidence">
  <section id="sets"></section>
  <h2>Source-truth checklists</h2>
  <section id="checklists"></section>
  <h2>Exact exported confirmation</h2>
  <p>Choose one exact digest per Option, choose rejection, or leave blank. Source crop is offered on equal authority. Blank or partial export remains unresolved.</p>
  <div class="selection-grid" id="selection"></div>
  <button id="export" type="button">Build and download exact confirmation JSON</button>
  <textarea id="output" readonly aria-label="Exact confirmation JSON"></textarea>
</main>
<script type="module">
  const manifest = await fetch('./comparison-manifest.json').then((response) => response.json())
  document.querySelector('#package').innerHTML = '<strong>Package digest:</strong> <code>' + manifest.packageDigest + '</code>'
  const methods = ['source_crop', 'vector_authored', 'reference_restored']
  const sets = document.querySelector('#sets')
  for (const method of methods) {
    const section = document.createElement('section')
    section.className = 'candidate-set'
    section.innerHTML = '<h2>' + method + '</h2><div class="target-row"></div><div class="meta"></div>'
    const row = section.querySelector('.target-row')
    const meta = section.querySelector('.meta')
    for (const observation of manifest.observations) {
      const candidate = observation.candidates.find((entry) => entry.method === method)
      const label = observation.owner.optionId.at(-1)
      row.insertAdjacentHTML('beforeend', '<div class="track"><span class="option-label">' + label + '.</span><div class="image-box"><img src="' + candidate.relativePath + '" alt="Option ' + label + ' ' + method + ' candidate"></div></div>')
      const issue = candidate.agentVisualIssues.length ? '<p class="issue">' + candidate.agentVisualIssues.join(' ') + '</p>' : '<p>Unedited source fallback; Owner review still required.</p>'
      meta.insertAdjacentHTML('beforeend', '<div><strong>' + candidate.artifact.pixelWidth + 'x' + candidate.artifact.pixelHeight + '</strong><br><code>' + candidate.candidateDigest + '</code>' + issue + '</div>')
    }
    sets.append(section)
  }
  const checklists = document.querySelector('#checklists')
  for (const observation of manifest.observations) {
    const label = observation.owner.optionId.at(-1)
    const details = document.createElement('details')
    details.innerHTML = '<summary>Option ' + label + ' - ' + observation.observationId + '</summary><p><code>' + JSON.stringify(observation.owner) + '</code></p><ul>' + observation.sourceTruthChecklist.map((entry) => '<li><strong>' + entry.relationship + ':</strong> ' + entry.sourceTruth + '</li>').join('') + '</ul>'
    checklists.append(details)
  }
  const selection = document.querySelector('#selection')
  for (const observation of manifest.observations) {
    const label = observation.owner.optionId.at(-1)
    const wrapper = document.createElement('label')
    wrapper.textContent = 'Option ' + label
    const select = document.createElement('select')
    select.dataset.observationId = observation.observationId
    select.dataset.owner = JSON.stringify(observation.owner)
    select.innerHTML = '<option value="">-- no selection (unresolved) --</option>' + observation.candidates.map((candidate) => '<option value="' + candidate.candidateDigest + '">' + candidate.method + ' - ' + candidate.candidateDigest + '</option>').join('') + '<option value="__rejected__">reject all candidates for this Option</option>'
    wrapper.append(select)
    selection.append(wrapper)
  }
  const buildConfirmation = () => ({
    schemaVersion: 'visual-teacher-confirmation-v1',
    packageDigest: manifest.packageDigest,
    decisions: [...document.querySelectorAll('select')].flatMap((select) => {
      if (!select.value) return []
      const base = { observationId: select.dataset.observationId, owner: JSON.parse(select.dataset.owner) }
      return [select.value === '__rejected__'
        ? { ...base, disposition: 'rejected' }
        : { ...base, disposition: 'confirmed', selectedCandidateDigest: select.value }]
    }),
  })
  const output = document.querySelector('#output')
  output.value = JSON.stringify(buildConfirmation(), null, 2)
  selection.addEventListener('change', () => { output.value = JSON.stringify(buildConfirmation(), null, 2) })
  document.querySelector('#export').addEventListener('click', () => {
    const json = JSON.stringify(buildConfirmation(), null, 2) + '\\n'
    output.value = json
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    link.download = 'visual-teacher-confirmation-v1.json'
    link.click()
    URL.revokeObjectURL(link.href)
  })
</script>
</body>
</html>
`
}

async function writeJson(relativePath, value) {
  await fs.writeFile(path.join(evidenceRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`)
}

export async function materializeQ33SelectionEvidence() {
  const request = await buildCandidateRequest()
  const candidatePackage = createVisualImportCandidate(request)
  const comparisonManifest = await makeComparisonManifest(candidatePackage)
  const confirmationTemplate = {
    schemaVersion: 'visual-teacher-confirmation-v1',
    packageDigest: candidatePackage.packageDigest,
    decisions: [],
  }
  await writeJson('source-capture-v1.json', request.sourceCapture)
  await writeJson('visual-import-candidate-v1.json', candidatePackage)
  await writeJson('comparison-manifest.json', comparisonManifest)
  await writeJson('visual-teacher-confirmation-template.json', confirmationTemplate)
  await fs.writeFile(path.join(evidenceRoot, 'comparison.html'), comparisonHtml())
  return { candidatePackage, comparisonManifest, confirmationTemplate }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await materializeQ33SelectionEvidence()
  console.log(JSON.stringify({
    packageDigest: result.candidatePackage.packageDigest,
    sourceCaptureRef: result.candidatePackage.sourceCaptureRef,
    comparisonManifestDigest: result.comparisonManifest.manifestDigest,
    state: result.comparisonManifest.state,
  }, null, 2))
}
