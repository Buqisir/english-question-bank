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
    for (const [size, stroke] of [[16, 2.25], [23, 2.25], [24, 2], [32, 1.875], [40, 1.875]]) {
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
    // Display tiers (>= 24) use a stroke thinner than 2.25 since Owner 2026-11-02; geometry is unchanged,
    // so the visible gap widens by exactly the stroke reduction. Upper bounds allow that, nothing more.
    const displayRelief = (stroke) => Math.max(0, 2.25 - stroke)
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
        // Every glyph, Copy included, follows the shared size tiers (Owner 2026-11-02: one pen for the whole set).
        if (svg.getAttribute('stroke-width') !== String(sample.stroke)) failures.push(`${sample.name}/${sample.size}: wrong stroke tier`)
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
          if (Math.abs(box.x - 3.429) > 0.01 || Math.abs(box.width - 18.095) > 0.03 || Math.abs(box.y + box.height / 2 - 12) > 0.01 || box.height < 19.0 || box.height > 19.2) failures.push(`play/${sample.size}: retain the original envelope and horizontal symmetry, not a squashed triangle`)
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
          if (rearY < 3.3 || rearY > 3.75) failures.push(`play/${sample.size}: preserve the rounded rear shoulder (${rearY})`)
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
          // 第 4 组 B「与播放同高」：中缝不动，两柱从 6.6 收到 5.1；旧的宽柱应当不过。
          if (gap < 2.1 || gap > 2.85 + displayRelief(sample.stroke) || left.width < 5.0 || left.width > 5.2) failures.push(`pause/${sample.size}: preserve B's clearer middle gap and slimmer bars (${gap})`)
          if (Math.abs(left.width - right.width) > 0.01 || Math.abs(left.x + right.x + right.width - 24) > 0.01 || Math.abs(left.y - right.y) > 0.01 || Math.abs(left.height - right.height) > 0.01 || Math.abs(left.y - 2.476) > 0.01 || Math.abs(left.height - 19.048) > 0.01) failures.push(`pause/${sample.size}: equal, centered, parallel bars must retain their height`)
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
            if (gap < 1 || gap > 1.7 + displayRelief(sample.stroke) || getComputedStyle(piece).strokeWidth !== `${sample.stroke}px`) failures.push(`shuffle/${sample.size}: keep the selected two-tier crossing clearance (${gap})`)
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
            // 第 6 组 SL2：两只拨片各向中间挪 1.25，短边轨道 1.85 → 3.1。
            const [cx, cy] = i === 0 ? [14, 7] : [10, 17]
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
        // 第 4 组 R3「缝底封圆」：N2 现版的头梁勾进内倾实心耳罩；缝放宽，缝底用整半圆封住，不收成针尖。
        document.body.appendChild(line)
        const [band, ...solids] = line.querySelectorAll('path')
        const pads = solids.filter((p) => !p.dataset.part), seals = solids.filter((p) => p.dataset.part === 'seal')
        if (line.children.length !== 5 || pads.length !== 2 || seals.length !== 2 || solids.some((p) => p.getAttribute('fill') !== 'currentColor' || p.getAttribute('stroke') !== 'none')) {
          failures.push(`headphones/${sample.size}: R3 has one band, two solid pads and two seals`)
        } else {
          if (band.hasAttribute('stroke-width') || /[zZ]/.test(band.getAttribute('d'))) failures.push(`headphones/${sample.size}: band is open and follows the size-tier stroke`)
          if (sample.fill !== sample.line) failures.push(`headphones/${sample.size}: both states keep the same solid drawing`)
          const at = (shape, x, y) => shape.isPointInFill(new DOMPoint(x, y))
          const ink = (x, y) => band.isPointInStroke(new DOMPoint(x, y)) || solids.some((p) => at(p, x, y))
          const centerAt = (pad, y) => {
            const xs = Array.from({ length: 481 }, (_, i) => i / 20).filter((x) => at(pad, x, y))
            return (Math.min(...xs) + Math.max(...xs)) / 2
          }
          for (const [i, pad] of pads.entries()) {
            const shift = (centerAt(pad, 20) - centerAt(pad, 15)) * (i === 0 ? 1 : -1)
            if (shift < 0.7 || shift > 1.05) failures.push(`headphones/${sample.size}: both pads must lean inward gently (${shift})`)
            const end = band.getPointAtLength(i === 0 ? 0 : band.getTotalLength())
            if (!at(pad, end.x, end.y) && !at(seals[i], end.x, end.y)) failures.push(`headphones/${sample.size}: band hook must end inside the pad or its seal`)
          }
          // 缝：上段是一道干净的缝（不再是 0.9 的发丝），下段被封死，不留针尖。
          const xs = Array.from({ length: 481 }, (_, i) => i / 40)
          const channel = (y) => {
            const bandEdge = Math.max(...xs.filter((x) => x < 6 && band.isPointInStroke(new DOMPoint(x, y))))
            const padEdge = Math.min(...xs.filter((x) => at(pads[0], x, y)))
            return xs.filter((x) => x > bandEdge && x < padEdge && !ink(x, y)).length / 40
          }
          for (const y of [14, 15]) {
            const gap = channel(y)
            if (gap < 1.0 || gap > 1.9) failures.push(`headphones/${sample.size}: keep a clean side channel at y=${y} (${gap})`)
          }
          for (const y of [17.6, 18, 18.4]) {
            if (channel(y) > 0) failures.push(`headphones/${sample.size}: seal the channel below the round bottom, no needle at y=${y}`)
          }
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
        // P2「上下对称三段」：上进纸、机身、下出纸，全同一支笔；淡底只给机身。
        const [input, body, output] = line.querySelectorAll('path')
        if (line.children.length !== 3 || !output) {
          failures.push(`printer/${sample.size}: P2 keeps input tray, housing and output tray only`)
        } else {
          if ([input, body, output].some((path) => getComputedStyle(path).strokeWidth !== `${sample.stroke}px`)) failures.push(`printer/${sample.size}: same pen for paper and housing`)
          const top = input.getBBox()
          const bottom = output.getBBox()
          if (Math.abs(top.width - bottom.width) > 0.01 || Math.abs(top.x - bottom.x) > 0.01) failures.push(`printer/${sample.size}: input and output trays stay symmetric`)
          if (parse(sample.fill).querySelector('g path')?.getAttribute('d') !== body.getAttribute('d')) failures.push(`printer/${sample.size}: fill must shade the housing only`)
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
            if (gap < 0.6 || gap > 1.2 + displayRelief(sample.stroke)) failures.push(`eye-off/${sample.size}: retain B's local clearance, not merged joints or widely separated fragments (${gap})`)
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
      if (sample.name === 'bell' || sample.name === 'bell-off') {
        document.body.appendChild(line)
        // 第 5 组 ②「下摆外撇」：铃身两侧最后一段外撇落到铃口，不回到直落的拱门。
        const body = line.querySelector('path')
        const d = body.getAttribute('d')
        if (!/^M\s*4\.248\s+16\.514\s*C/.test(d)) failures.push(`${sample.name}/${sample.size}: bell body must start with the flared lower-left curve on the rim`)
        if (sample.name === 'bell-off') {
          // B3「斜杠下移」：45° 斜杠与隐藏同长，左下平移避开右下角；后面的铃在交叉处断开，缝 ≥ 1.5（2.75 审计档按线宽差放宽，同复制）。
          const paths = [...line.querySelectorAll('path')]
          const slash = paths[paths.length - 1]
          const start = slash.getPointAtLength(0)
          const end = slash.getPointAtLength(slash.getTotalLength())
          if (Math.abs(start.y - start.x - 3.6) > 0.01 || Math.abs(end.y - end.x - 3.6) > 0.01 || Math.abs(end.x - start.x - 14.43) > 0.02) failures.push(`bell-off/${sample.size}: retain B3's shifted 45-degree slash`)
          let gap = Infinity
          for (const path of paths.slice(0, -1)) {
            const n = 200
            for (let i = 0; i <= n; i++) {
              const p = path.getPointAtLength(path.getTotalLength() * i / n)
              gap = Math.min(gap, Math.abs(p.x - p.y + 3.6) / Math.SQRT2 - sample.stroke)
            }
          }
          if (gap < 1.5 - (sample.stroke - 2.25) - 0.02) failures.push(`bell-off/${sample.size}: G9 — the bell must break where the slash crosses (${gap})`)
          const lastBack = paths[paths.length - 2]
          if (!lastBack || Math.abs(lastBack.getBBox().x + lastBack.getBBox().width - 20.892) > 0.01) failures.push(`bell-off/${sample.size}: keep the bell's lower-right corner and rim tip`)
        }
        line.remove()
      }
      if (sample.name === 'close-circle') {
        document.body.appendChild(line)
        // 第 5 组 ①：叉离圈与「已通过」的勾同缝（约 2.47），不回到小一号的叉。
        const box = line.querySelector('path').getBBox()
        if (Math.abs(box.x - 8.8) > 0.01 || Math.abs(box.width - 6.4) > 0.01) failures.push(`close-circle/${sample.size}: retain ① enlarged cross`)
        line.remove()
      }
      if (['search', 'zoom-in', 'zoom-out', 'dictionary-lookup', 'reading-analysis'].includes(sample.name)) {
        // 第 6 组：搜索、放大、缩小、查词、阅读解析是同一只镜（G2 收 0.99 后），镜内符号不另设线宽。
        const lens = parse(sample.line).querySelector('circle')
        if (!lens || Math.abs(+lens.getAttribute('cx') - 11.089) > 0.01 || Math.abs(+lens.getAttribute('cy') - 11.089) > 0.01 || Math.abs(+lens.getAttribute('r') - 8.613) > 0.01) failures.push(`${sample.name}/${sample.size}: share the search lens (11.089, r 8.613)`)
        if (/data-stroke-small/.test(sample.line) || parse(sample.line).querySelectorAll('[stroke-width]').length) failures.push(`${sample.name}/${sample.size}: one pen — no local stroke widths inside the lens`)
        if (sample.name === 'reading-analysis' && parse(sample.line).querySelectorAll('path').length !== 2) failures.push(`reading-analysis/${sample.size}: R3 is lens + handle + two text lines, no paper`)
      }
      if (sample.name === 'link') {
        // 第 6 组 G4：两段内钩沿原方向收 0.5，与对面链环留缝。
        const ends = [...parse(sample.line).querySelectorAll('path')].map((path) => path.getAttribute('d').trim().split(/\s+/).slice(-2).join(' '))
        if (ends.join('|') !== 'L11.204 5.116|L12.796 18.884') failures.push(`link/${sample.size}: retain the shortened inner hooks (${ends})`)
      }
      if (sample.name === 'log-out') {
        // 第 6 组 L1：门沿透视往回收 40%，上沿门角落在 y 3.075。
        const door = parse(sample.line).querySelector('path').getAttribute('d')
        if (!/C13\.195 3\.495 11\.835 3\.355 9\.114 3\.075/.test(door)) failures.push(`log-out/${sample.size}: retain L1's softened door perspective`)
      }
      if (sample.name === 'maximize' || sample.name === 'minimize') {
        // 第 7 组：框按 G2 收 0.885；框内箭头同一支笔，离框角、两支之间守 G4 1.5（2.75 审计档按线宽差放宽）。
        const svgEl = parse(sample.line)
        const paths = [...svgEl.querySelectorAll('path')]
        if (paths.length !== 3 || svgEl.querySelectorAll('[stroke-width], [data-stroke-small]').length || !paths[0].getAttribute('d').startsWith('M3.504 12')) failures.push(`${sample.name}/${sample.size}: G2 frame and one pen inside`)
        else {
          document.body.appendChild(svgEl)
          const pts = paths.map((path) => Array.from({ length: 400 }, (_, i) => path.getPointAtLength(path.getTotalLength() * i / 399)))
          const near = (a, b) => { let m = Infinity; for (const p of a) for (const q of b) m = Math.min(m, Math.hypot(p.x - q.x, p.y - q.y)); return m }
          const gap = Math.min(near(pts[0], pts[1]), near(pts[0], pts[2]), near(pts[1], pts[2])) - sample.stroke
          if (gap < 1.5 - Math.max(0, sample.stroke - 2.25) - 0.02) failures.push(`${sample.name}/${sample.size}: G4 — inner arrows crowd the frame or each other (${gap})`)
          svgEl.remove()
        }
      }
      if (sample.name === 'arrow-left-right' && !sample.line.includes('M8.25 7.25 L3.5 12 L8.25 16.75 M15.75 7.25 L20.5 12 L15.75 16.75')) failures.push(`arrow-left-right/${sample.size}: ① wings 4.75`)
      if (sample.name === 'corner-down-right' && !sample.line.includes('M8.75 15.125L4.5 10.875L8.75 6.625')) failures.push(`corner-down-right/${sample.size}: ② centred reply arrow`)
      // 第 8 组：人物按参考图重画——闭合圆顶身体 + 平底；添加 / 已批改 / 班级共用同一个前排人物。
      if (['user', 'users', 'user-plus', 'user-check'].includes(sample.name) && !/A1\.1 1\.1 0 0 0 [\d.]+ 19\.4V18\.2/.test(sample.line.replace(/\s+/g, ' '))) failures.push(`${sample.name}/${sample.size}: closed flat-based body`)
      if (['users', 'user-plus', 'user-check'].includes(sample.name) && !sample.line.includes('M4.1 20.5H13.1')) failures.push(`${sample.name}/${sample.size}: shared front person`)
      if (sample.name === 'move' && /<g/.test(sample.line.replace(/^<svg[^>]*>/, ''))) failures.push(`move/${sample.size}: translations baked into coordinates`)
      if (sample.name === 'scissors') {
        // 第 6 组 B：H4.2 骨架，刀刃是沿刃脊的一笔（不再是实心叶子），刃尖再长 1；旋转已写进坐标。
        const svgEl = parse(sample.line)
        const paths = [...svgEl.querySelectorAll('path')]
        if (paths.length !== 6 || svgEl.querySelector('g[transform], [fill="currentColor"]')) failures.push(`scissors/${sample.size}: B — two rings, two shanks, two stroked blades; no solid blades or transforms`)
        else {
          const tips = paths.slice(4).map((path) => path.getPointAtLength(path.getTotalLength()))
          if (tips.some((tip) => Math.abs(tip.y - 3.568) > 0.01) || Math.abs(tips[0].x + tips[1].x - 23.726) > 0.01) failures.push(`scissors/${sample.size}: retain B's longer, mirrored blade tips`)
        }
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
      assert.equal(icon.stroke, stroke)
      // Copy is the G9 exemplar: the rear sheet stays open in front of the front sheet. The 1.5 floor holds at the
      // 2.25 small tier; the legacy 2.75 audit tier is thicker than any runtime stroke (24px+ renders 2.0 / 1.875).
      if (icon.name === 'copy') assert.ok(icon.gap !== null && icon.gap >= 1.5 - (stroke - 2.25), `copy/${stroke}: rear sheet crowds the front sheet (${icon.gap})`)
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
        // 第 4 组 B 收窄了柱子（与播放同高）：运行时最粗 2.25 档内洞约 3.0；2.75 审计档按线宽差放宽，同复制。
        assert.ok(icon.holes.every((hole) => hole.width >= 2.75 - (stroke - 2.25)), `pause/${stroke}: slimmer bars must not close the counters`)
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
        // P2 (Owner 2026-11-02): tray, housing and paper are three connected parts at the same pen weight.
        assert.equal(icon.gap, null, `printer/${stroke}: all three shapes must connect`)
        assert.equal(icon.holes.length, 3, `printer/${stroke}: keep the tray, housing and paper counters`)
        if (stroke === 2.25) assert.ok(icon.holes.every((hole) => hole.width >= 2.25), `printer/${stroke}: a counter closed up`)
      }
      if (!repaired.has(icon.name)) continue
      // 第 7 组：全屏 / 退出全屏的框内箭头改为同一支笔，2.75 审计档按线宽差放宽（同复制、关闭通知）。
      // 第 8 组：人物（参考图版）头与身体中心距 3.75，同样只在 2.75 审计档按线宽差放宽。
      const gapFloor = ['maximize', 'minimize', 'user', 'users', 'user-plus', 'user-check'].includes(icon.name) ? 1.5 - Math.max(0, stroke - 2.25) - 0.02 : 1.5
      assert.ok(icon.gap === null || icon.gap >= gapFloor, `${icon.name}/${stroke}: gap ${icon.gap}`)
      assert.ok(icon.holes.filter((hole) => hole.area > 1).every((hole) => hole.width >= 2.25), `${icon.name}/${stroke}: narrow hole`)
    }
    console.log(`PASS ${icons.length} unique measurements at stroke ${stroke}, including 57 extended; 18 repaired glyphs meet gap/hole floors`)
    console.log(`PASS copy in size tier ${stroke}: shared stroke tier and G9 gap preserved`)
  }
} finally {
  await browser?.close()
  await vite.close()
  await rm(temp, { recursive: true, force: true })
}
