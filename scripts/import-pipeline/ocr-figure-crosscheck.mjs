// Ovis is an independent, local-only hint. Never changes OCR authority or blocks compile.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const validBox = (box) => Array.isArray(box) && box.length === 4
  && box.every(Number.isFinite) && box[0] >= 0 && box[1] >= 0
  && box[2] <= 1 && box[3] <= 1 && box[0] < box[2] && box[1] < box[3]

// Clip to the candidate, then integrate the union of vertical intervals in each x slab.
// Summing individual intersections double-counts overlapping figure regions.
export function coverageRatio(candidate, regions) {
  if (!validBox(candidate)) throw new Error('Invalid candidate bbox')
  const [l, t, r, b] = candidate
  const clipped = regions.map(({ x, y, width, height }) =>
    [Math.max(l, x), Math.max(t, y), Math.min(r, x + width), Math.min(b, y + height)])
    .filter(validBox)
  const xs = [...new Set(clipped.flatMap((box) => [box[0], box[2]]))].sort((a, b) => a - b)
  let area = 0
  for (let index = 1; index < xs.length; index += 1) {
    const intervals = clipped.filter((box) => box[0] < xs[index] && box[2] > xs[index - 1])
      .map((box) => [box[1], box[3]]).sort((a, b) => a[0] - b[0])
    let end = t
    let length = 0
    for (const [start, stop] of intervals) {
      length += Math.max(0, stop - Math.max(start, end))
      end = Math.max(end, stop)
    }
    area += (xs[index] - xs[index - 1]) * length
  }
  return Math.min(1, area / ((r - l) * (b - t)))
}

export function matchesExemption(candidate, exemption) {
  return ['pageKey', 'imageSha256', 'candidateId', 'category'].every((key) =>
    typeof candidate[key] === 'string' && exemption[key] === candidate[key])
    && typeof exemption.reason === 'string' && Boolean(exemption.reason.trim())
}

export function crosscheckFigures({ pages, figures, detection, exemptions = [] }) {
  const report = { mode: 'shadow', detection: detection ? 'ok' : 'missing',
    uncovered: [], exempted: [], tablePages: [], covered: [], issues: [] }
  if (!detection) return report
  if (!Array.isArray(detection.pages) || !Array.isArray(exemptions)) throw new Error('Invalid figure report')
  for (const page of pages) {
    const found = detection.pages.filter((entry) => entry.pageKey === page.key)
    const detected = found[0]
    if (found.length !== 1 || detected.imageSha256 !== page.imageSha256 || detected.status !== 'ok') {
      report.detection = 'partial'
      report.issues.push({ pageKey: page.key, reason: !detected ? 'missing' :
        detected.imageSha256 !== page.imageSha256 ? 'stale-image' : 'failed-or-duplicate' })
      continue
    }
    if (detected.hasTable) report.tablePages.push(page.key)
    const regions = figures.filter((figure) => figure.key === page.key).map((figure) => figure.region)
    for (const candidate of detected.candidates) {
      const coverage = coverageRatio(candidate.bbox, regions)
      const entry = { ...candidate, pageKey: page.key, imageSha256: page.imageSha256, coverage }
      if (coverage + Number.EPSILON >= 0.90) report.covered.push(entry)
      else {
        const exemption = exemptions.find((item) => matchesExemption(entry, item))
        if (exemption) report.exempted.push({ ...entry, reason: exemption.reason })
        else report.uncovered.push(entry)
      }
    }
  }
  return report
}

export function writeFigureCrosscheck({ work, pages, figures }) {
  const fast = path.join(work, 'fast')
  let report
  try {
    const read = (name, fallback) => existsSync(path.join(fast, name))
      ? JSON.parse(readFileSync(path.join(fast, name), 'utf8')) : fallback
    report = crosscheckFigures({
      pages: pages.map((page) => ({ ...page, imageSha256: digest(page.imagePath) })),
      figures, detection: read('figure-candidates.json', null),
      exemptions: read('figure-exemptions.json', []),
    })
  } catch (error) {
    report = { mode: 'shadow', detection: 'partial', uncovered: [], exempted: [],
      tablePages: [], issues: [{ reason: error.message }] }
  }
  // Even an unwritable report must not turn a shadow hint into an OCR gate.
  try {
    mkdirSync(fast, { recursive: true })
    writeFileSync(path.join(fast, 'figure-crosscheck.json'), `${JSON.stringify(report, null, 2)}\n`)
  } catch (error) {
    console.error(`Ovis shadow 报告写入失败：${error.message}`)
  }
  console.error(`Ovis shadow：detection=${report.detection} uncovered=${report.uncovered.length} exempted=${report.exempted.length} tablePages=${report.tablePages.length}`)
  return report
}
