#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../')
const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'))
let failed = 0

for (const year of ['2022', '2024']) {
  const candidate = readJson(`docs/cuts/applied-writing-lecture-v3/pilot-content/paper-${year}-i.application.json`)
  const persisted = readJson(`app/public/paper-assets/paper-${year}-i/latest/analyses/writing-analysis-v1.json`)
    .groups[`group-${year}-i-writing-application`].writing
  const literal = (anchor) => candidate.modelAnswer.split(/\r?\n/).some((line) => line.includes(anchor))
  const ok = JSON.stringify(candidate) === JSON.stringify(persisted) &&
    candidate.reviewMarks.length === 5 && candidate.highlightExpressions.filter((item) => item.lectureAnnotation).length === 4 &&
    candidate.reviewMarks.every((mark) => literal(mark.text)) &&
    candidate.highlightExpressions.filter((item) => item.lectureAnnotation).every((item) => literal(item.text))
  console.log(`${year}: ${ok ? 'PASS' : 'FAIL'} (5/5 review, 4/4 highlight, literal anchors, exact persisted packet)`)
  if (!ok) failed += 1
}

if (failed) process.exit(1)
