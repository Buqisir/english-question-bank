#!/usr/bin/env node
/**
 * verify-figure-render.mjs — figure-render cut (fig-token P0).
 *
 * Manifest-driven, zero hardcoded figure id: scans every
 * app/public/paper-assets/<paperId>/latest/figures/manifest.json that
 * exists (today: only paper-2026-i) and exercises ALL FOUR render paths
 * plan.md names, on REAL data:
 *
 *   1. Client — paperAssetSurfaceAdapter.ts (PaperSurface's textMap, feeds
 *      both 整卷卷面 and 讲评栏 harness mounts).
 *   2. Client — the detail-page passage path (passageFigureSegments.ts,
 *      the pure logic QuestionGroupDetailView.tsx's `<pre>` renders
 *      through — extracted into its own .ts file specifically so this
 *      script can import + exercise it; Node's TS type-stripping loads a
 *      plain .ts file but not a .tsx component's JSX).
 *   3. Server — print-renderer.mjs (covers PDF / 工作台 A4 预览 / 草稿卷预览
 *      in one call — all three wrap this module's output unchanged), both
 *      imageMode: 'web' (browser surfaces) and 'file' (Vivliostyle PDF).
 *   4. Server — docxRenderer.mjs, ALL FOUR passage-emit sites (exam ×
 *      blocks, exam × legacy items, handout × blocks, handout × legacy
 *      items) via the FACTORY path (createDocxRenderer({ paperAssetsDir }),
 *      the same wiring server/api.mjs uses) — not just buildDocumentXml's
 *      string output but writeDocxPackage's real zip (media part +
 *      relationship present, unzipped and inspected).
 *
 * Plus:
 *   - MF-4 invariant re-asserted against PUBLISHED paper-assets (the
 *     import-time version lives in
 *     scripts/import-pipeline/verify-nck1-standard.mjs's F1b — this is the
 *     belt-and-suspenders post-publish re-check plan.md's Verify section
 *     asks for).
 *   - Whole-library anti-pattern sweep: every paper-asset in the repo
 *     (manifest or not) renders through print-renderer + docxRenderer with
 *     paperAssetsDir set, and NONE of the output may contain a raw
 *     `[表: fig-` / `[图: fig-` token. Zero-figure papers (33 of the 34 in
 *     this repo today) trivially pass (they have no bracket token to begin
 *     with) — the sweep exists so a FUTURE paper with a marker and a
 *     broken manifest link fails loudly here instead of shipping a token.
 *   - "No manifest hit" placeholder-card path (plan.md rule 3), using a
 *     REAL paper-asset group (paper-2020-bing's reading-a, which has no
 *     manifest.json) with a synthetic bracket token appended to its real
 *     passage text — real infra, not a mock resolveGroupFigures.
 *   - Backward-compat control: every buildPrintHtml / buildDocumentXml
 *     call WITHOUT paperAssetsDir stays byte-identical (already covered
 *     exhaustively by verify-print-renderer.mjs / verify-h5g-docx-renderer.
 *     mjs's pre-existing suites, which this script does not duplicate —
 *     see AGENTS.md "do not duplicate verification").
 */

import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createVerifier, repoRootFrom } from './lib/verifyScope.mjs'
import { proxyFreeEnv } from './lib/proxyFreeEnv.mjs'

const root = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier('figure-render (fig-token P0)')

const paperAssetsDir = path.join(root, 'app/public/paper-assets')
const FIGURE_TOKEN_ANYWHERE = /\[(?:表|图):\s*fig-/

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}

function paperAssetParagraphText(group) {
  const paragraphs = Array.isArray(group?.passage?.paragraphs) ? group.passage.paragraphs : []
  return paragraphs.map((p) => String(p?.text || '').trim()).filter(Boolean).join('\n\n')
}

// ─── Discover every published paper + its manifest (zero hardcode) ──────
const paperIds = readdirSync(paperAssetsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)

const papers = [] // { paperId, assetPath, asset, manifestPath, figures }
for (const paperId of paperIds) {
  const assetPath = path.join(paperAssetsDir, paperId, 'latest', 'paper-asset.json')
  if (!existsSync(assetPath)) continue
  const asset = readJson(assetPath)
  const manifestPath = path.join(paperAssetsDir, paperId, 'latest', 'figures', 'manifest.json')
  const figures = existsSync(manifestPath) ? (readJson(manifestPath).figures || []) : []
  papers.push({ paperId, assetPath, asset, manifestPath, figures })
}

const papersWithManifest = papers.filter((p) => p.figures.length > 0)
const papersWithoutManifest = papers.filter((p) => p.figures.length === 0)

section('0. Manifest discovery + zero-figure control')
assert(papers.length > 0, `discovered ${papers.length} published paper-asset(s)`)
assert(papersWithManifest.length > 0, `${papersWithManifest.length} paper(s) with a figures/manifest.json (today: ${papersWithManifest.map((p) => p.paperId).join(', ') || 'none'})`)
assert(
  papersWithoutManifest.length > 0,
  `${papersWithoutManifest.length} paper(s) with NO manifest — zero-figure control group (must produce zero figure-related assertions/failures for these)`,
)

// ─── 1. MF-4 invariant, re-asserted against PUBLISHED data ──────────────
section('1. MF-4 invariant (published paper-assets)')
for (const { paperId, asset, figures } of papersWithManifest) {
  for (const entry of figures) {
    if (!entry.placeholderMarker) continue
    const group = asset.content.groups[entry.groupId]
    assert(!!group, `${paperId}: figure ${entry.figureId} references an existing group (${entry.groupId})`)
    const paragraphs = Array.isArray(group?.passage?.paragraphs) ? group.passage.paragraphs : []
    const matches = paragraphs.filter((p) => String(p?.text || '').includes(entry.placeholderMarker))
    assert(matches.length === 1, `${paperId}/${entry.groupId}: marker "${entry.placeholderMarker}" appears in exactly 1 paragraph (got ${matches.length})`)
    if (matches.length === 1) {
      assert(
        String(matches[0].text).trim().startsWith(entry.placeholderMarker),
        `${paperId}/${entry.groupId}: marker "${entry.placeholderMarker}" is paragraph-initial`,
      )
    }
  }
}

// ─── 2. Client path #1 — paperAssetSurfaceAdapter.ts ─────────────────────
section('2. Client — paperAssetSurfaceAdapter.ts (整卷卷面 + 讲评栏 harness)')
{
  const { buildPaperAssetSurfaceModel } = await import('../app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts')
  for (const { paperId, asset, figures, assetPath } of papersWithManifest) {
    for (const entry of figures) {
      const group = asset.content.groups[entry.groupId]
      if (!group || group.groupType !== 'reading') continue // adapter only wired for reading groups this cut
      const analysisPath = path.join(path.dirname(assetPath), 'analyses', 'reading-choice-analysis-v1.json')
      if (!existsSync(analysisPath)) continue
      const analysis = readJson(analysisPath)
      const assetBase = path.dirname(assetPath).startsWith(paperAssetsDir)
        ? `/paper-assets/${path.relative(paperAssetsDir, path.dirname(assetPath)).split(path.sep).join('/')}`
        : ''
      const model = buildPaperAssetSurfaceModel({ asset, analysis, groupId: entry.groupId, figures, assetBase })
      const figureParagraph = model.surfaceData.textMap.paragraphs.find((p) => p.figure)
      assert(!!figureParagraph, `${paperId}/${entry.groupId}: textMap has a paragraph with a resolved figure`)
      assert(figureParagraph?.figure?.kind === 'figure', `${paperId}/${entry.groupId}: resolved figure kind is 'figure' (manifest hit)`)
      assert(figureParagraph?.figure?.src === `${assetBase}/figures/${entry.file}`, `${paperId}/${entry.groupId}: resolved <img> src matches assetBase + manifest file`)

      // Backward-compat: omitting figures/assetBase produces the pre-cut
      // shape — no paragraph carries `.figure` at all.
      const modelNoFigures = buildPaperAssetSurfaceModel({ asset, analysis, groupId: entry.groupId })
      assert(
        !modelNoFigures.surfaceData.textMap.paragraphs.some((p) => p.figure),
        `${paperId}/${entry.groupId}: omitting figures input → zero paragraphs carry .figure (byte-identical additivity)`,
      )
    }
  }
}

// PaperSurface.tsx source structure: paragraphs with `.figure` render the
// figure/placeholder branch INSTEAD OF sentences (React-render-level proof
// needs a DOM harness this script doesn't have; this mirrors the existing
// verify-paper-surface-module-v1.mjs precedent of testing PaperSurface.tsx
// via source-structure assertions).
{
  const src = readFileSync(path.join(root, 'app/src/shared-ui/papersurface/PaperSurface.tsx'), 'utf8')
  assert(/if \(paragraph\.figure\)/.test(src), 'PaperSurface.tsx: PaperSurfaceParagraph branches on paragraph.figure before rendering sentences')
  assert(/ps-figure-placeholder/.test(src) && src.includes('〔表格：见原卷〕'), 'PaperSurface.tsx: placeholder branch renders the "〔表格：见原卷〕" card, not a raw token')
  assert(!/\{paragraph\.figure\.caption\}/.test(src), 'PaperSurface.tsx: never renders figure.caption (PA SW-4 — caption is ops metadata)')
}

// ─── 3. Client path #2 — detail-page passage (passageFigureSegments.ts) ─
section('3. Client — detail-page passage (<pre> path, passageFigureSegments.ts)')
{
  const { buildPassageSegments, FIGURE_PLACEHOLDER_TEXT } = await import('../app/src/features/question-detail/passageFigureSegments.ts')
  for (const { paperId, asset, figures } of papersWithManifest) {
    for (const entry of figures) {
      const group = asset.content.groups[entry.groupId]
      if (!group) continue
      const materialText = paperAssetParagraphText(group)
      const segments = buildPassageSegments(materialText, figures)
      const figureSegment = segments.find((s) => s.kind === 'figure' && s.figure.figureId === entry.figureId)
      assert(!!figureSegment, `${paperId}/${entry.groupId}: buildPassageSegments produces a figure segment for ${entry.figureId}`)
      assert(
        !segments.some((s) => s.kind === 'text' && s.text.includes(entry.placeholderMarker)),
        `${paperId}/${entry.groupId}: no text segment contains the raw marker`,
      )
      // PO-2: the flattened TABLE TEXT is preserved (kept below the image),
      // not dropped — but the marker itself (import-time locator metadata,
      // not table content) is stripped from it (browser-QA finding: a raw
      // "[表: fig-...]" prefix in the double-store sidecar still reads as
      // a leaked token to the teacher, even on this one surface that keeps
      // flattened text at all).
      assert(!!figureSegment?.flattenedText && figureSegment.flattenedText.length > 0, `${paperId}/${entry.groupId}: figure segment's flattenedText is non-empty (PO-2 double-store)`)
      assert(!figureSegment?.flattenedText?.includes(entry.placeholderMarker), `${paperId}/${entry.groupId}: figure segment's flattenedText has the marker stripped (no leaked token in the double-store sidecar)`)

      // Backward-compat: figures: [] degrades to ONE unsplit text segment,
      // byte-identical to the pre-cut single-<pre> render.
      const noFigureSegments = buildPassageSegments(materialText, [])
      assert(
        noFigureSegments.length === 1 && noFigureSegments[0].kind === 'text' && noFigureSegments[0].text === materialText,
        `${paperId}/${entry.groupId}: figures:[] input → single unsplit text segment === materialText (byte-identical additivity)`,
      )
    }
  }
  assert(typeof FIGURE_PLACEHOLDER_TEXT === 'string' && FIGURE_PLACEHOLDER_TEXT.length > 0, 'FIGURE_PLACEHOLDER_TEXT is a non-empty string')
}

// ─── 4. Server path — print-renderer.mjs (PDF / A4 预览 / 草稿卷预览) ─────
section('4. Server — print-renderer.mjs (web + file imageMode)')
{
  const { buildPrintHtml } = await import('../server/print-renderer.mjs')
  for (const { paperId, asset, figures } of papersWithManifest) {
    for (const entry of figures) {
      const group = asset.content.groups[entry.groupId]
      if (!group) continue
      const materialText = paperAssetParagraphText(group)
      const detail = { id: entry.groupId, title: group.title, groupType: group.groupType, passage: { materialText, summary: materialText }, questions: [] }
      const items = [{ detail, note: '', score: 1, sectionTitle: '' }]
      const blocks = [{ type: 'question_group', questionGroupId: entry.groupId, score: 1 }]

      {
        const html = buildPrintHtml({ title: 'T', versionType: 'student', printStyle: 'exam', items, blocks, questionNumberStart: 1, paperAssetsDir, imageMode: 'web' })
        assert(!FIGURE_TOKEN_ANYWHERE.test(html), `${paperId}/${entry.groupId} (web): print HTML has zero raw figure tokens`)
        assert(html.includes(`<img src="/paper-assets/${paperId}/latest/figures/${entry.file}"`), `${paperId}/${entry.groupId} (web): print HTML <img> src is the expected web-relative path`)
        assert(!html.includes(entry.caption || 'no-caption-sentinel'), `${paperId}/${entry.groupId} (web): print HTML never renders manifest caption (PA SW-4)`)
      }

      // imageMode:'file' — browser-QA finding: an ABSOLUTE file:// URL
      // across directories renders a BROKEN IMAGE ICON in the actual PDF
      // (headless Chromium blocks cross-directory file:// resource
      // loading by default) even though the HTML string itself looks
      // correct — a text-only assertion on the <img src> would NEVER have
      // caught this. Fixed design: buildPrintHtml emits a bare relative
      // filename + populates `images` so the caller copies the real PNG
      // into the SAME directory as the HTML. This check re-derives that
      // exact caller contract and proves the PDF that comes out the other
      // end actually embeds the image — not just that the HTML text looks
      // plausible.
      {
        const images = []
        const html = buildPrintHtml({ title: 'T', versionType: 'student', printStyle: 'exam', items, blocks, questionNumberStart: 1, paperAssetsDir, imageMode: 'file', images })
        assert(!FIGURE_TOKEN_ANYWHERE.test(html), `${paperId}/${entry.groupId} (file): print HTML has zero raw figure tokens`)
        assert(images.length === 1, `${paperId}/${entry.groupId} (file): images out-parameter collected exactly 1 image (got ${images.length})`)
        assert(!images[0]?.relativeName?.includes('/') && !images[0]?.relativeName?.startsWith('file:'), `${paperId}/${entry.groupId} (file): the collected image's relativeName is a bare filename, not a path`)
        assert(html.includes(`<img src="${images[0]?.relativeName}"`), `${paperId}/${entry.groupId} (file): print HTML <img> src matches the collected relativeName exactly`)
        assert(images[0]?.absoluteSourcePath === path.join(paperAssetsDir, paperId, 'latest', 'figures', entry.file), `${paperId}/${entry.groupId} (file): the collected image's absoluteSourcePath points at the real on-disk PNG`)

        // Real end-to-end: build the PDF the way exportPrintPdf/
        // exportDraftPaperPdf actually do (copy the image into the SAME
        // tempdir as the HTML, THEN run Vivliostyle), and compare against
        // a CONTROL run that skips the copy (reproducing the exact broken
        // case this check exists to catch). The real PDF must come out
        // meaningfully larger — proof the PNG's bytes are actually
        // embedded, not just referenced by a src string that resolves to
        // nothing.
        const vivliostyleBin = [
          path.join(root, 'node_modules/.bin/vivliostyle'),
          path.join(root, 'server/node_modules/.bin/vivliostyle'),
          path.join(root, 'app/node_modules/.bin/vivliostyle'),
        ].find((p) => existsSync(p))
        if (!vivliostyleBin) {
          console.log(`  ⋆ SKIP: vivliostyle CLI not found -- real end-to-end PDF-embed check skipped for ${paperId}/${entry.groupId} (verify-print-renderer.mjs's own Vivliostyle smoke test already requires it elsewhere; not re-asserting the dependency here)`)
        } else {
          const buildPdf = ({ copyImage }) => {
            const dir = mkdtempSync(path.join(tmpdir(), 'verify-figure-render-pdf-'))
            try {
              const htmlPath = path.join(dir, 'paper.html')
              const pdfPath = path.join(dir, 'paper.pdf')
              writeFileSync(htmlPath, html)
              if (copyImage) {
                writeFileSync(path.join(dir, images[0].relativeName), readFileSync(images[0].absoluteSourcePath))
              }
              execFileSync(vivliostyleBin, ['build', htmlPath, '-o', pdfPath], { timeout: 60000, env: proxyFreeEnv() })
              return readFileSync(pdfPath).length
            } finally {
              rmSync(dir, { recursive: true, force: true })
            }
          }
          const realPdfSize = buildPdf({ copyImage: true })
          const brokenControlPdfSize = buildPdf({ copyImage: false })
          assert(
            realPdfSize > brokenControlPdfSize + 20000,
            `${paperId}/${entry.groupId} (file): PDF with the image actually copied in is meaningfully larger than the broken-reference control (real=${realPdfSize} control=${brokenControlPdfSize}) -- proves the PNG bytes are really embedded`,
          )
        }
      }

      // SW-2: figure sizing rules present in the emitted <style> block.
      const html = buildPrintHtml({ title: 'T', versionType: 'student', printStyle: 'exam', items, blocks, questionNumberStart: 1, paperAssetsDir, imageMode: 'web' })
      assert(/\.print-figure\s*\{[^}]*break-inside:\s*avoid/.test(html), `${paperId}/${entry.groupId}: .print-figure CSS has break-inside: avoid (SW-2)`)
      assert(/\.print-figure img\s*\{[^}]*max-width:\s*100%/.test(html), `${paperId}/${entry.groupId}: .print-figure img CSS caps max-width (SW-2, ≤版心 162mm)`)

      // Backward-compat: omitting paperAssetsDir leaves the raw token in place (pre-cut behavior, unchanged).
      const htmlNoDir = buildPrintHtml({ title: 'T', versionType: 'student', printStyle: 'exam', items, blocks, questionNumberStart: 1 })
      assert(htmlNoDir.includes(entry.placeholderMarker), `${paperId}/${entry.groupId}: omitting paperAssetsDir → raw token unchanged (byte-identical additivity)`)
    }
  }

  // Plan rule 3 — "no manifest hit" placeholder card, on a REAL paper-asset
  // group that genuinely has no manifest.json (paper-2020-bing reading-a),
  // with a synthetic bracket token appended to its real passage text.
  const noManifestPaper = papersWithoutManifest.find((p) => Object.values(p.asset.content.groups).some((g) => g.groupType === 'reading'))
  assert(!!noManifestPaper, 'found a real paper-asset with no manifest.json to exercise the "no manifest hit" placeholder path')
  if (noManifestPaper) {
    const group = Object.values(noManifestPaper.asset.content.groups).find((g) => g.groupType === 'reading')
    const materialText = `${paperAssetParagraphText(group)}\n\n[表: fig-does-not-exist-anywhere]`
    const detail = { id: group.groupId, title: group.title, groupType: 'reading', passage: { materialText, summary: materialText }, questions: [] }
    const items = [{ detail, note: '', score: 1, sectionTitle: '' }]
    const blocks = [{ type: 'question_group', questionGroupId: group.groupId, score: 1 }]
    const html = buildPrintHtml({ title: 'T', versionType: 'student', printStyle: 'exam', items, blocks, questionNumberStart: 1, paperAssetsDir, imageMode: 'web' })
    assert(html.includes('print-figure-placeholder'), `${noManifestPaper.paperId}: an unresolvable bracket token renders the placeholder card`)
    assert(html.includes('〔表格：见原卷〕'), `${noManifestPaper.paperId}: placeholder card carries the exact plan.md copy`)
    assert(!html.includes('[表: fig-does-not-exist-anywhere]'), `${noManifestPaper.paperId}: the unresolvable raw token itself never reaches the output`)
  }
}

// ─── 5. Server path — docxRenderer.mjs (all 4 emit sites) ───────────────
section('5. Server — docxRenderer.mjs (exam/handout × blocks/legacy = 4 emit sites)')
{
  const { createDocxRenderer } = await import('../server/exports/docxRenderer.mjs')
  const groupTypeLabels = { reading: '阅读理解' }
  const optionalString = (v) => (typeof v === 'string' ? v.trim() : '')
  const renderer = createDocxRenderer({ groupTypeLabels, optionalString, paperAssetsDir })
  // docxRenderer.mjs's `let paperAssetsDir` (and groupTypeLabels/
  // optionalString) is a MODULE-LEVEL singleton createDocxRenderer
  // mutates, not a per-instance closure — every existing call site in
  // this codebase only ever instantiates ONE renderer per process
  // (api.mjs at startup; verify-h5g-docx-renderer.mjs's repeated
  // makeRenderer() calls always pass the SAME config, so the reset is a
  // no-op there). This script is the first consumer that legitimately
  // needs TWO different configs (with/without paperAssetsDir) in the SAME
  // process — a second createDocxRenderer(...) call resets the shared
  // binding out from under any renderer reference created earlier. Fix:
  // capture ONE fixture and run the "no paperAssetsDir" backward-compat
  // check LAST, after every use of `renderer` above is done — see the end
  // of this section. (Known pre-existing architectural pattern, not
  // something this cut redesigns — see the completion report.)
  let backwardCompatFixture = null

  for (const { paperId, asset, figures } of papersWithManifest) {
    for (const entry of figures) {
      const group = asset.content.groups[entry.groupId]
      if (!group) continue
      const materialText = paperAssetParagraphText(group)
      const detail = { id: entry.groupId, title: group.title, groupType: group.groupType, passage: { title: group.title, materialText, summary: materialText }, questions: [] }
      const blocksItems = [{ detail, note: '', score: 1, sectionTitle: '' }]
      const blocks = [{ type: 'question_group', questionGroupId: entry.groupId, score: 1 }]
      const legacyItems = [{ detail, note: '', score: 1, sectionTitle: '' }] // no `blocks` → legacy fallback branch

      for (const printStyle of ['exam', 'handout']) {
        for (const mode of ['blocks', 'legacy']) {
          const images = []
          const xml = renderer.buildDocumentXml({
            title: 'T',
            versionType: 'student',
            items: mode === 'blocks' ? blocksItems : legacyItems,
            blocks: mode === 'blocks' ? blocks : null,
            questionNumberStart: 1,
            printStyle,
            images,
          })
          const label = `${paperId}/${entry.groupId} (${printStyle}/${mode})`
          assert(!xml.includes(entry.placeholderMarker) && !FIGURE_TOKEN_ANYWHERE.test(xml), `${label}: documentXml has zero raw figure tokens`)
          assert(xml.includes('<w:drawing>'), `${label}: documentXml embeds a <w:drawing>`)
          assert(images.length === 1, `${label}: images out-parameter collected exactly 1 image (got ${images.length})`)
          assert(xml.includes(`r:embed="${images[0]?.rId}"`), `${label}: documentXml references the collected image's rId`)
          assert(!xml.includes(entry.caption || ' '), `${label}: documentXml never renders manifest caption (PA SW-4)`)

          // Real zip: media part + relationship actually present.
          const outDir = mkdtempSync(path.join(tmpdir(), 'verify-figure-render-docx-'))
          try {
            const outputPath = path.join(outDir, 'out.docx')
            const body = renderer.writeDocxPackage({ documentXml: xml, images, outputPath, title: 'T' })
            assert(Buffer.isBuffer(body) && body[0] === 0x50 && body[1] === 0x4b, `${label}: writeDocxPackage produces a valid zip (PK header)`)
            const extractDir = path.join(outDir, 'extract')
            execFileSync('unzip', ['-q', outputPath, '-d', extractDir])
            const mediaFile = path.join(extractDir, 'word/media', `image1.${images[0].extension}`)
            assert(existsSync(mediaFile), `${label}: word/media/image1.${images[0].extension} exists in the unzipped package`)
            const originalSize = readFileSync(path.join(paperAssetsDir, paperId, 'latest', 'figures', entry.file)).length
            assert(readFileSync(mediaFile).length === originalSize, `${label}: embedded media byte size matches the original PNG`)
            const relsXml = readFileSync(path.join(extractDir, 'word/_rels/document.xml.rels'), 'utf8')
            assert(relsXml.includes(images[0].rId) && relsXml.includes('relationships/image'), `${label}: document.xml.rels declares the image relationship`)
          } finally {
            rmSync(outDir, { recursive: true, force: true })
          }
        }
      }

      backwardCompatFixture = { paperId, groupId: entry.groupId, marker: entry.placeholderMarker, items: blocksItems, blocks }
    }
  }

  // Plan rule 3 — "no manifest hit" placeholder card in DOCX, real
  // no-manifest paper-asset group + synthetic bracket token.
  const noManifestPaper = papersWithoutManifest.find((p) => Object.values(p.asset.content.groups).some((g) => g.groupType === 'reading'))
  if (noManifestPaper) {
    const group = Object.values(noManifestPaper.asset.content.groups).find((g) => g.groupType === 'reading')
    const materialText = `${paperAssetParagraphText(group)}\n\n[图: fig-does-not-exist-anywhere]`
    const detail = { id: group.groupId, title: group.title, groupType: 'reading', passage: { title: group.title, materialText, summary: materialText }, questions: [] }
    const images = []
    const xml = renderer.buildDocumentXml({ title: 'T', versionType: 'student', items: [{ detail, note: '', score: 1, sectionTitle: '' }], blocks: [{ type: 'question_group', questionGroupId: group.groupId, score: 1 }], questionNumberStart: 1, printStyle: 'exam', images })
    assert(images.length === 0, `${noManifestPaper.paperId}: an unresolvable bracket token collects zero images`)
    assert(xml.includes('〔表格：见原卷〕'), `${noManifestPaper.paperId}: DOCX placeholder card carries the exact plan.md copy`)
    assert(!xml.includes('[图: fig-does-not-exist-anywhere]'), `${noManifestPaper.paperId}: the unresolvable raw token itself never reaches documentXml`)
  }

  // Backward-compat, run LAST (see the `backwardCompatFixture` comment
  // above): a renderer instantiated WITHOUT paperAssetsDir must produce
  // the exact pre-cut documentXml (raw token unchanged, no <w:drawing>).
  // Instantiating this second renderer resets docxRenderer.mjs's shared
  // module-level `paperAssetsDir` binding, so nothing above may rely on
  // `renderer` (the paperAssetsDir-configured one) after this point.
  if (backwardCompatFixture) {
    const rendererNoDir = createDocxRenderer({ groupTypeLabels, optionalString })
    const xmlNoDir = rendererNoDir.buildDocumentXml({
      title: 'T',
      versionType: 'student',
      items: backwardCompatFixture.items,
      blocks: backwardCompatFixture.blocks,
      questionNumberStart: 1,
      printStyle: 'exam',
    })
    assert(xmlNoDir.includes(backwardCompatFixture.marker), `${backwardCompatFixture.paperId}/${backwardCompatFixture.groupId}: renderer created without paperAssetsDir → raw token unchanged (byte-identical additivity)`)
    assert(!xmlNoDir.includes('<w:drawing>'), `${backwardCompatFixture.paperId}/${backwardCompatFixture.groupId}: renderer created without paperAssetsDir → no <w:drawing> emitted`)
  }
}

// ─── 6. Whole-library anti-pattern sweep ─────────────────────────────────
section('6. Whole-library anti-pattern sweep (no render output contains a raw figure token)')
{
  const { buildPrintHtml } = await import('../server/print-renderer.mjs')
  const { createDocxRenderer } = await import('../server/exports/docxRenderer.mjs')
  const groupTypeLabels = { reading: '阅读理解', cloze: '完形填空', seven_choices: '七选五', grammar_cloze: '语法填空', writing: '写作', continuation: '读后续写' }
  const optionalString = (v) => (typeof v === 'string' ? v.trim() : '')
  const renderer = createDocxRenderer({ groupTypeLabels, optionalString, paperAssetsDir })

  let sweptGroups = 0
  let markerBearingGroups = 0
  for (const { paperId, asset } of papers) {
    for (const [groupId, group] of Object.entries(asset.content.groups || {})) {
      if (!group?.passage?.paragraphs) continue
      const materialText = paperAssetParagraphText(group)
      sweptGroups += 1
      if (!FIGURE_TOKEN_ANYWHERE.test(materialText)) continue // nothing to prove for this group
      markerBearingGroups += 1

      const detail = { id: groupId, title: group.title, groupType: group.groupType, passage: { title: group.title, materialText, summary: materialText }, questions: [] }
      const items = [{ detail, note: '', score: 1, sectionTitle: '' }]
      const blocks = [{ type: 'question_group', questionGroupId: groupId, score: 1 }]

      const html = buildPrintHtml({ title: 'T', versionType: 'student', printStyle: 'exam', items, blocks, questionNumberStart: 1, paperAssetsDir, imageMode: 'web' })
      assert(!FIGURE_TOKEN_ANYWHERE.test(html), `${paperId}/${groupId}: print HTML output has zero raw figure tokens (whole-library sweep)`)

      const images = []
      const xml = renderer.buildDocumentXml({ title: 'T', versionType: 'student', items, blocks, questionNumberStart: 1, printStyle: 'exam', images })
      assert(!FIGURE_TOKEN_ANYWHERE.test(xml), `${paperId}/${groupId}: docx documentXml has zero raw figure tokens (whole-library sweep)`)
    }
  }
  assert(sweptGroups > 0, `whole-library sweep visited ${sweptGroups} groups across ${papers.length} papers`)
  assert(markerBearingGroups > 0, `${markerBearingGroups} group(s) actually carried a bracket-token marker (sweep is exercising the real risk, not a no-op)`)
  assert(sweptGroups - markerBearingGroups > 0, `${sweptGroups - markerBearingGroups} marker-free group(s) contributed zero assertions (plan.md "零图卷零断言零失败")`)
}

summary()
