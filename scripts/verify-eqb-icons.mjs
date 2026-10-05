#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from '../app/node_modules/vite/dist/node/index.js'

const root = new URL('../', import.meta.url).pathname
const require = createRequire(new URL('../app/package.json', import.meta.url))
const { createElement } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { chromium } = require('playwright')
const files = (await readdir(join(root, 'app/src/icons/generated'))).filter((file) => file.endsWith('.tsx'))
const temp = await mkdtemp(join(tmpdir(), 'eqb-icons-'))
const vite = await createServer({ root: join(root, 'app'), logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
let browser

try {
  const samples = []
  for (const file of files) {
    const module = await vite.ssrLoadModule(`/src/icons/generated/${file}`)
    const Icon = Object.values(module)[0]
    for (const [size, stroke] of [[16, 2.25], [23, 2.25], [24, 2.75], [40, 2.75]]) {
      samples.push({ name: file.slice(0, -4), size, stroke,
        line: renderToStaticMarkup(createElement(Icon, { size, variant: 'line' })),
        fill: renderToStaticMarkup(createElement(Icon, { size, variant: 'fill' })),
      })
    }
  }
  browser = await chromium.launch({ channel: 'chromium', executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
  const page = await browser.newPage()
  const failures = await page.evaluate((samples) => {
    const failures = []
    const parser = new DOMParser()
    // Independent semantic expectations: these dots are the glyph, not decoration.
    // EyeOff B omits its pupil; ListMusic E2 uses an ear with no notehead.
    const dots = { ellipsis: 3, grip: 6, eye: 1, 'eye-off': 0, 'info-circle': 1, 'help-circle': 1, 'list-music': 0 }
    for (const sample of samples) {
      const parse = (markup) => parser.parseFromString(markup, 'image/svg+xml').documentElement
      const line = parse(sample.line)
      const fill = parse(sample.fill)
      fill.querySelector('g[fill-opacity="0.16"]')?.remove()
      if (!line.children.length || line.innerHTML !== fill.innerHTML) failures.push(`${sample.name}/${sample.size}: fill lost line geometry`)
      for (const svg of [line, fill]) {
        // Owner's Copy reference has constant line weight; other glyphs retain both tiers.
        const expectedStroke = sample.name === 'copy' ? 2.25 : sample.stroke
        if (svg.getAttribute('stroke-width') !== String(expectedStroke)) failures.push(`${sample.name}/${sample.size}: wrong stroke tier`)
        if (sample.name in dots && svg.querySelectorAll('circle[fill="currentColor"][stroke="none"]').length !== dots[sample.name]) failures.push(`${sample.name}/${sample.size}: wrong semantic dot count`)
      }
      if (sample.name === 'play') {
        document.body.appendChild(line)
        const outline = line.querySelector('path')
        const d = outline?.getAttribute('d') ?? ''
        if (line.children.length !== 1 || (d.match(/[mM]/g) ?? []).length !== 1 || !/[zZ]\s*$/.test(d)) {
          failures.push(`play/${sample.size}: retain one closed triangle, without a gap or an extra mark`)
        } else {
          const box = outline.getBBox()
          if (Math.abs(box.x - 3.342) > 0.01 || Math.abs(box.width - 18.278) > 0.03 || Math.abs(box.y + box.height / 2 - 12) > 0.01 || box.height < 19.2 || box.height > 19.4) failures.push(`play/${sample.size}: retain the original envelope and horizontal symmetry, not a squashed triangle`)
          const points = Array.from({ length: 2001 }, (_, i) => outline.getPointAtLength(outline.getTotalLength() * i / 2000))
          for (const y of [11, 13]) {
            const crossings = points.slice(1).flatMap((b, i) => {
              const a = points[i]
              return a.y !== b.y && (a.y - y) * (b.y - y) <= 0
                ? [a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y)] : []
            })
            const retreat = box.x + box.width - Math.max(...crossings)
            // A tighter nose retreats faster than the old broad tip (~0.16) away from its apex.
            if (retreat < 0.25 || retreat > 0.5) failures.push(`play/${sample.size}: retain the selected tighter but rounded front (${retreat})`)
          }
          // Rear crown remains broad. Uniformly tightening all three corners violates the selection.
          const rear = points.filter((p) => p.y < 12 && Math.abs(p.x - 4) < 0.025)
          const rearY = Math.min(...rear.map((p) => p.y))
          if (rearY < 3.2 || rearY > 3.6) failures.push(`play/${sample.size}: preserve the rounded rear shoulder (${rearY})`)
          if (parse(sample.fill).querySelector('g path')?.getAttribute('d') !== d) failures.push(`play/${sample.size}: fill must follow the same selected contour`)
        }
        line.remove()
      }
      if (sample.name === 'pause') {
        document.body.appendChild(line)
        const bars = [...line.querySelectorAll('path')]
        if (line.children.length !== 2 || bars.length !== 2 || bars.some((bar) => !/[zZ]\s*$/.test(bar.getAttribute('d')))) {
          failures.push(`pause/${sample.size}: retain two closed hollow bars, no extra marks`)
        } else {
          const [left, right] = bars.map((bar) => bar.getBBox())
          const gap = right.x - left.x - left.width - sample.stroke
          // B's selected drawing keeps ~10% of the ink height as a clear center gap at 24px.
          // The incumbent's ~1.10 gap fails; merely spreading the old broad bars fails the width check.
          if (gap < 2.1 || gap > 2.85 || left.width < 6.5 || left.width > 6.7) failures.push(`pause/${sample.size}: preserve B's clearer middle gap and slimmer bars (${gap})`)
          if (Math.abs(left.width - right.width) > 0.01 || Math.abs(left.x + right.x + right.width - 24) > 0.01 || Math.abs(left.y - right.y) > 0.01 || Math.abs(left.height - right.height) > 0.01 || Math.abs(left.y - 2.38) > 0.01 || Math.abs(left.height - 19.24) > 0.01) failures.push(`pause/${sample.size}: equal, centered, parallel bars must retain their height`)
          const backgrounds = [...parse(sample.fill).querySelectorAll('g path')]
          if (backgrounds.length !== 2 || backgrounds.some((path, i) => path.getAttribute('d') !== bars[i].getAttribute('d'))) failures.push(`pause/${sample.size}: tint the same two bars, never fill the center gap`)
        }
        line.remove()
      }
      if (sample.name === 'volume') {
        document.body.appendChild(line)
        const [body, arc] = line.querySelectorAll('path')
        if (line.children.length !== 2 || !arc || !/[zZ]\s*$/.test(body.getAttribute('d')) || /[zZ]/.test(arc.getAttribute('d'))) {
          failures.push(`volume/${sample.size}: retain one closed speaker and one open sound arc`)
        } else {
          const box = arc.getBBox()
          // B is taller without pushing its nose outward. The old 6.962-high arc must fail.
          if (box.height < 8.3 || box.height > 8.7 || box.width < 1.6 || box.width > 1.9 || Math.abs(box.y + box.height / 2 - 12) > 0.02 || Math.abs(box.x + box.width - 21.4) > 0.1) failures.push(`volume/${sample.size}: retain B's taller, flatter centered arc`)
          const backgrounds = [...parse(sample.fill).querySelectorAll('g path')]
          if (backgrounds.length !== 1 || backgrounds[0].getAttribute('d') !== body.getAttribute('d')) failures.push(`volume/${sample.size}: tint only the unchanged speaker, never close or shade the arc`)
        }
        line.remove()
      }
      if (sample.name === 'shuffle') {
        document.body.appendChild(line)
        const [back, front, tips] = line.querySelectorAll('path')
        const pieces = back?.getAttribute('d').match(/[Mm][^Mm]*/g) ?? []
        if (line.children.length !== 3 || pieces.length !== 2 || !front || !tips) {
          failures.push(`shuffle/${sample.size}: one front route and two interrupted rear pieces, no added marks`)
        } else {
          if (front.getAttribute('d') !== 'M3.5 17.5h2.8c5.4 0 5.4-11 10.8-11h3.4' || tips.getAttribute('d') !== 'm17.5 3.5 3 3-3 3M17.5 14.5l3 3-3 3') failures.push(`shuffle/${sample.size}: preserve the ascending curve and attached arrowheads`)
          if (sample.line !== sample.fill || line.getAttribute('stroke-linecap') !== 'round') failures.push(`shuffle/${sample.size}: round exposed ends and identical line/fill without a tint or mask`)
          if (!front.isPointInStroke(new DOMPoint(11.7, 12)) || back.isPointInStroke(new DOMPoint(11.7, 12))) failures.push(`shuffle/${sample.size}: only the ascending route crosses the center`)
          const points = Array.from({ length: 1601 }, (_, i) => front.getPointAtLength(front.getTotalLength() * i / 1600))
          const ends = pieces.map((d, i) => {
            const piece = document.createElementNS('http://www.w3.org/2000/svg', 'path')
            piece.setAttribute('d', d)
            line.append(piece)
            const end = piece.getPointAtLength(i === 0 ? piece.getTotalLength() : 0)
            const gap = Math.min(...points.map((point) => Math.hypot(point.x - end.x, point.y - end.y))) - sample.stroke
            // B's tight crossing clearance: ~1.08 at 24px, ~1.58 at the thin tier.
            // Reject both merged crossings and excessive fragmentation.
            if (gap < 1 || gap > 1.7 || getComputedStyle(piece).strokeWidth !== `${sample.stroke}px`) failures.push(`shuffle/${sample.size}: keep the selected two-tier crossing clearance (${gap})`)
            piece.remove()
            return end
          })
          if (Math.abs(ends[0].x + ends[1].x - 23.4) > 0.01 || Math.abs(ends[0].y + ends[1].y - 24) > 0.01) failures.push(`shuffle/${sample.size}: interrupt the rear curve evenly around its crossing`)
        }
        line.remove()
      }
      if (sample.name === 'sliders') {
        document.body.appendChild(line)
        const [rail, ...frames] = line.querySelectorAll('path')
        const shaded = parse(sample.fill)
        document.body.appendChild(shaded)
        const counters = [...shaded.querySelectorAll('g[fill-opacity="0.16"] rect')]
        if (line.children.length !== 3 || frames.length !== 2 || counters.length !== 2 || frames.some((frame) => frame.getAttribute('fill') !== 'currentColor' || frame.getAttribute('stroke') !== 'none')) {
          failures.push(`sliders/${sample.size}: B+ requires two light compound frames and two tinted counters, not vertical pills`)
        } else {
          for (const [i, frame] of frames.entries()) {
            const [cx, cy] = i === 0 ? [15.25, 7] : [8.75, 17]
            const box = frame.getBBox()
            const hole = counters[i].getBBox()
            if (Math.abs(box.width - 9) > 0.01 || Math.abs(box.height - 6.4) > 0.01 || Math.abs(box.x + box.width / 2 - cx) > 0.01 || Math.abs(box.y + box.height / 2 - cy) > 0.01) failures.push(`sliders/${sample.size}: retain B+'s horizontal envelope and unchanged handle centers`)
            if (Math.abs(hole.width - 5.2) > 0.01 || Math.abs(hole.height - 3.3) > 0.01 || Math.abs(hole.x + hole.width / 2 - cx) > 0.01 || Math.abs(hole.y + hole.height / 2 - cy - 0.05) > 0.01) failures.push(`sliders/${sample.size}: retain the selected wide counter`)
            // Wrong winding fills the hole; old rail endpoints protrude into it at 24px.
            for (let x = hole.x + 0.1; x < hole.x + hole.width; x += 0.2) {
              for (let y = hole.y + 0.1; y < hole.y + hole.height; y += 0.2) {
                const point = new DOMPoint(x, y)
                if (counters[i].isPointInFill(point) && (frame.isPointInFill(point) || rail.isPointInStroke(point))) failures.push(`sliders/${sample.size}: keep the counter transparent and clear of rail stubs`)
              }
            }
            for (const x of [box.x + 0.1, box.x + box.width - 0.1]) {
              const contact = new DOMPoint(x, cy)
              if (!frame.isPointInFill(contact) || !rail.isPointInStroke(contact)) failures.push(`sliders/${sample.size}: rails must meet the frame, not detach`)
            }
            for (const [x, y] of [[cx, cy - 2.8], [cx, cy + 2.8], [cx - 4, cy], [cx + 4, cy]]) {
              if (!frame.isPointInFill(new DOMPoint(x, y))) failures.push(`sliders/${sample.size}: preserve all four light frame edges`)
            }
          }
        }
        shaded.remove()
        line.remove()
      }
      if (sample.name === 'headphones') {
        document.body.appendChild(line)
        const [band, ...pads] = line.querySelectorAll('path')
        if (line.children.length !== 3 || pads.length !== 2 || pads.some((pad) => pad.getAttribute('fill') !== 'currentColor' || pad.getAttribute('stroke') !== 'none')) {
          failures.push(`headphones/${sample.size}: N2 has one band and two solid pads, not the old hollow cups`)
        } else {
          if (getComputedStyle(band).strokeWidth !== '2px' || /[zZ]/.test(band.getAttribute('d'))) failures.push(`headphones/${sample.size}: retain the lighter continuous open band`)
          if (sample.fill !== sample.line) failures.push(`headphones/${sample.size}: both states keep solid pads without a tint layer`)
          const at = (shape, x, y) => shape.isPointInFill(new DOMPoint(x, y))
          const centerAt = (pad, y) => {
            const xs = Array.from({ length: 481 }, (_, i) => i / 20).filter((x) => at(pad, x, y))
            return (Math.min(...xs) + Math.max(...xs)) / 2
          }
          for (const [i, pad] of pads.entries()) {
            const shift = (centerAt(pad, 20) - centerAt(pad, 15)) * (i === 0 ? 1 : -1)
            if (shift < 0.7 || shift > 1.05) failures.push(`headphones/${sample.size}: both pads must lean inward gently (${shift})`)
            const end = band.getPointAtLength(i === 0 ? 0 : band.getTotalLength())
            const box = pad.getBBox()
            if (!at(pad, end.x, end.y) || end.y < 18.9 || end.y > 19.6 || box.y < 12.5 || box.y > 13 || box.height < 9.3 || box.height > 9.9) failures.push(`headphones/${sample.size}: preserve the lower side support and free pad tops`)
          }
          // Probe the selected white channels, not the generic disconnected-component gap.
          // Measure the narrowing channel before it intentionally meets the lower support.
          for (const y of [14, 15, 16, 17]) {
            const xs = Array.from({ length: 481 }, (_, i) => i / 40)
            const bandEdge = Math.max(...xs.filter((x) => band.isPointInStroke(new DOMPoint(x, y))))
            const padEdge = Math.min(...xs.filter((x) => at(pads[0], x, y)))
            const gap = padEdge - bandEdge
            if (gap < 0.85 || gap > 1.8) failures.push(`headphones/${sample.size}: preserve N2's side channel at y=${y} (${gap})`)
            if (!at(pads[0], centerAt(pads[0], y), y) || !at(pads[1], centerAt(pads[1], y), y)) failures.push(`headphones/${sample.size}: pad interiors must stay solid`)
          }
          // Compare contours with geometric tolerance, not hit tests exactly on ink edges.
          for (let i = 0; i <= 100; i++) {
            for (const [left, right, reverse] of [[band, band, true], [pads[0], pads[1], false]]) {
              const a = left.getPointAtLength(left.getTotalLength() * i / 100)
              const b = right.getPointAtLength(right.getTotalLength() * (reverse ? 1 - i / 100 : i / 100))
              if (Math.abs(a.x + b.x - 24) > 0.02 || Math.abs(a.y - b.y) > 0.02) failures.push(`headphones/${sample.size}: preserve frontal mirror symmetry`)
            }
          }
        }
        line.remove()
      }
      if (sample.name === 'trash') {
        document.body.appendChild(line)
        const paths = line.querySelectorAll('path')
        if (paths.length !== 3) failures.push(`trash/${sample.size}: retain only lid, handle and open bucket`)
        const lid = paths[0]
        const body = paths[2]
        const middle = lid.getPointAtLength(lid.getTotalLength() / 2)
        for (const distance of [0, lid.getTotalLength()]) {
          const drop = lid.getPointAtLength(distance).y - middle.y
          if (drop < 0.2 || drop > 0.5) failures.push(`trash/${sample.size}: lid must have shallow downward ends, not a flat bar or hooks`)
        }
        const box = body.getBBox()
        const bottom = Array.from({ length: 801 }, (_, i) => body.getPointAtLength(body.getTotalLength() * i / 800))
          .filter((point) => Math.abs(point.y - box.y - box.height) < 0.005)
        const flatWidth = Math.max(...bottom.map((point) => point.x)) - Math.min(...bottom.map((point) => point.x))
        if (flatWidth < 5.5) failures.push(`trash/${sample.size}: retain the longer flat base, not the old broad bottom curves`)
        const background = parse(sample.fill).querySelector('g[fill-opacity="0.16"] path')
        if (background?.getAttribute('d') !== `${body.getAttribute('d')}Z`) failures.push(`trash/${sample.size}: fill must close the same bucket contour, not retain the old bottom`)
        line.remove()
      }
      if (sample.name === 'eye') {
        document.body.appendChild(line)
        const outline = line.querySelector('path')
        const pupil = line.querySelector('circle')
        const box = outline.getBBox()
        const lowerLift = (12 - box.y) - (box.y + box.height - 12)
        // Selected A is about 1.43:1 including ink; merely lifting the old bottom leaves it too tall.
        const inkRatio = (box.width + sample.stroke) / (box.height + sample.stroke)
        if (lowerLift < 0.6 || lowerLift > 1 || inkRatio < 1.4 || inkRatio > 1.47) failures.push(`eye/${sample.size}: retain A's wide outline, full upper lid and shallower lower lid`)
        if (line.children.length !== 2 || pupil.getAttribute('cx') !== '12' || pupil.getAttribute('cy') !== '12' || pupil.getAttribute('r') !== '2.645') failures.push(`eye/${sample.size}: retain one outline and the unchanged centered pupil`)
        if (parse(sample.fill).querySelector('g path')?.getAttribute('d') !== outline.getAttribute('d')) failures.push(`eye/${sample.size}: fill must follow the selected eyelid contour`)
        line.remove()
      }
      if (sample.name === 'printer') {
        document.body.appendChild(line)
        const [input, body, paper] = line.querySelectorAll('path')
        if (line.children.length !== 3 || !paper) {
          failures.push(`printer/${sample.size}: retain rear paper, connected housing and bowed front paper only`)
        } else {
          if (getComputedStyle(paper).strokeWidth !== '1.4px' || getComputedStyle(body).strokeWidth !== `${sample.stroke}px`) failures.push(`printer/${sample.size}: preserve the selected lighter paper border and normal housing tier`)
          for (const distance of [0, body.getTotalLength()]) {
            const end = body.getPointAtLength(distance)
            if (!paper.isPointInStroke(new DOMPoint(end.x, end.y))) failures.push(`printer/${sample.size}: do not restore the rejected shoulder gaps`)
          }
          const front = paper.getBBox()
          const back = input.getBBox()
          const housing = body.getBBox()
          if (front.width - back.width < 1.5 || front.y >= housing.y + housing.height - 1) failures.push(`printer/${sample.size}: front paper must be wider than rear paper and emerge from inside the housing`)
          const points = Array.from({ length: 1201 }, (_, i) => paper.getPointAtLength(paper.getTotalLength() * i / 1200))
          const bottomAt = (x) => Math.max(...points.filter((p) => Math.abs(p.x - x) < 0.06).map((p) => p.y))
          const bow = bottomAt(12) - (bottomAt(8) + bottomAt(16)) / 2
          if (!Number.isFinite(bow) || bow < 0.2 || bow > 0.7) failures.push(`printer/${sample.size}: retain one shallow downward paper edge, not a flat base or a curled lip`)
          const background = parse(sample.fill).querySelector('g path')
          // The fill may shade the housing, but cannot spill onto the blank foreground sheet.
          const probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          probe.append(background.cloneNode())
          document.body.append(probe)
          const fillPath = probe.querySelector('path')
          if (!fillPath.isPointInFill(new DOMPoint(12, 10)) || fillPath.isPointInFill(new DOMPoint(12, 14))) failures.push(`printer/${sample.size}: fill must stay behind the front paper`)
          probe.remove()
        }
        line.remove()
      }
      if (sample.name === 'eye-off') {
        document.body.appendChild(line)
        const paths = [...line.querySelectorAll('path')]
        if (line.children.length !== 3 || paths.length !== 3 || line.querySelector('circle')) {
          failures.push(`eye-off/${sample.size}: B requires two open eyelid arcs and one slash, without a pupil`)
        } else {
          const arcs = paths.slice(0, 2)
          const slash = paths[2]
          const start = slash.getPointAtLength(0)
          const end = slash.getPointAtLength(slash.getTotalLength())
          if (Math.abs(start.x - start.y) > 0.01 || Math.abs(end.x - end.y) > 0.01 || start.x < 4.7 || start.x > 4.9 || end.x < 19.1 || end.x > 19.3) failures.push(`eye-off/${sample.size}: retain the centered continuous 45-degree slash`)
          if (line.getAttribute('stroke-linecap') !== 'round') failures.push(`eye-off/${sample.size}: exposed endpoints must be round`)
          for (const arc of arcs) {
            if (/[zZ]/.test(arc.getAttribute('d'))) failures.push(`eye-off/${sample.size}: do not reconnect the eyelid behind the slash`)
            const points = Array.from({ length: 201 }, (_, i) => arc.getPointAtLength(arc.getTotalLength() * i / 200))
            const gap = Math.min(...points.map((p) => Math.abs(p.x - p.y) / Math.SQRT2)) - sample.stroke
            // B's tight reference clearance: ~0.65 at the thick tier, ~1.15 at the thin tier.
            // This is a documented single-glyph exception, not a global relaxation of R4.
            if (gap < 0.6 || gap > 1.2) failures.push(`eye-off/${sample.size}: retain B's local clearance, not merged joints or widely separated fragments (${gap})`)
          }
          const boxes = arcs.map((arc) => arc.getBBox())
          const top = Math.min(...boxes.map((box) => box.y))
          const bottom = Math.max(...boxes.map((box) => box.y + box.height))
          if (Math.abs(top - 5.266) > 0.02 || Math.abs(bottom - 18.397) > 0.02) failures.push(`eye-off/${sample.size}: retain B's reference profile, not the old tall Solar eye or over-shortened lower lid`)
          const backgrounds = [...parse(sample.fill).querySelectorAll('g path')]
          if (backgrounds.length !== 2 || backgrounds.some((path, i) => path.getAttribute('d').replace(/\s/g, '') !== `${arcs[i].getAttribute('d').replace(/\s/g, '')}Z`)) failures.push(`eye-off/${sample.size}: fill must close each visible lobe separately and preserve the diagonal clearance`)
        }
        line.remove()
      }
    }
    return failures
  }, samples)
  assert.deepEqual(failures, [])
  console.log(`PASS ${files.length} components × 4 sizes × line/fill: geometry, semantic dots, stroke boundary`)

  // The repaired extended glyphs must not regress at the thicker runtime tier.
  const repaired = new Set(['move', 'maximize', 'minimize', 'sort', 'alert-triangle', 'help-circle', 'share', 'document', 'calendar', 'user-plus', 'users', 'user-check', 'underline', 'palette', 'headphones', 'list-ordered', 'bookmark', 'crop'])
  for (const stroke of [2.25, 2.75]) {
    const out = join(temp, `${stroke}.json`)
    execFileSync(process.execPath, [join(root, 'design/icon-system-2026-09-15/measure-craft.mjs'), '--stroke', String(stroke), '--out', out], { stdio: 'pipe' })
    const { icons } = JSON.parse(await readFile(out, 'utf8'))
    assert.deepEqual(icons.map((icon) => `${icon.name}.tsx`).sort(), files.slice().sort(), 'measure every effective generated glyph exactly once')
    assert.equal(icons.filter((icon) => icon.group === 'extended').length, 57)
    for (const icon of icons) {
      assert.equal(icon.stroke, icon.name === 'copy' ? 2.25 : stroke)
      // The selected reference has a tighter (~1.2-unit) gap. It must stay open, not be widened back to the rejected shape.
      if (icon.name === 'copy') assert.ok(icon.gap !== null && icon.gap >= 1 && icon.gap <= 1.4, `copy/${stroke}: reference gap changed (${icon.gap})`)
      if (icon.name === 'pencil') {
        const holes = icon.holes.filter((hole) => hole.area > 1)
        assert.equal(holes.length, 2, `pencil/${stroke}: retain the cap and barrel, no extra nib compartment`)
        assert.ok(holes.every((hole) => hole.width >= 2.25), `pencil/${stroke}: short tail closed its counter`)
      }
      // The reference's lower profile retains the R4 hard floor, not the larger 2.25 target.
      if (icon.name === 'eye') assert.ok(icon.gap !== null && icon.gap >= 1.5, `eye/${stroke}: lower lid crowded the pupil`)
      if (icon.name === 'play') {
        assert.equal(icon.holes.length, 1, `play/${stroke}: retain one open counter inside the closed triangle`)
        assert.ok(icon.holes[0].width >= 10, `play/${stroke}: do not crowd the counter while tightening the nose`)
      }
      if (icon.name === 'pause') {
        assert.equal(icon.holes.length, 2, `pause/${stroke}: keep a counter inside each bar`)
        assert.ok(icon.holes.every((hole) => hole.width >= 3.7), `pause/${stroke}: widening the middle gap must not close the counters`)
      }
      if (icon.name === 'volume') {
        assert.ok(icon.gap !== null && icon.gap >= 1.5, `volume/${stroke}: keep the sound arc separate`)
        assert.equal(icon.holes.length, 1, `volume/${stroke}: only the speaker encloses a counter`)
        assert.ok(icon.holes[0].width >= 7, `volume/${stroke}: preserve the speaker's open interior`)
      }
      if (icon.name === 'sliders') {
        assert.equal(icon.holes.length, 2, `sliders/${stroke}: measure compound counters together, not as separately filled subpaths`)
        assert.ok(icon.holes.every((hole) => hole.width >= 3.2), `sliders/${stroke}: preserve the wide horizontal counters in both tiers`)
        assert.ok(icon.gap >= 3.5, `sliders/${stroke}: preserve the whitespace between rails and handles`)
      }
      if (icon.name === 'printer') {
        assert.equal(icon.gap, null, `printer/${stroke}: all three shapes must connect`)
        // Foreground bottom centerline 22.295 + half of the selected 1.4 paper border.
        assert.ok(Math.abs(icon.ink.y + icon.ink.h - 22.995) < 0.03, `printer/${stroke}: measurement must use the paper's own stroke, not the housing's`)
        assert.equal(icon.holes.length, 3, `printer/${stroke}: keep the rear opening, housing opening and blank paper`)
        assert.ok(icon.holes.find((hole) => hole.at[1] > 16)?.width >= 7.4, `printer/${stroke}: the paper face must not shrink under a falsely inherited thick stroke`)
      }
      if (!repaired.has(icon.name)) continue
      assert.ok(icon.gap === null || icon.gap >= 1.5, `${icon.name}/${stroke}: gap ${icon.gap}`)
      assert.ok(icon.holes.filter((hole) => hole.area > 1).every((hole) => hole.width >= 2.25), `${icon.name}/${stroke}: narrow hole`)
    }
    console.log(`PASS ${icons.length} unique measurements at stroke ${stroke}, including 57 extended; 18 repaired glyphs meet gap/hole floors`)
    console.log(`PASS copy in size tier ${stroke}: fixed 2.25 stroke and reference gap preserved`)
  }
} finally {
  await browser?.close()
  await vite.close()
  await rm(temp, { recursive: true, force: true })
}
