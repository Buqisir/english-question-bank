#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')
const sourceDir = path.join(rootDir, 'app', 'src')
const designPath = path.join(rootDir, 'DESIGN.md')
const sourceExtensions = new Set(['.css', '.html', '.js', '.jsx', '.ts', '.tsx'])
const pictographPattern = /[\u2600-\u27BF\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}]/gu

function collectSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) return collectSourceFiles(target)
      return sourceExtensions.has(path.extname(entry.name)) ? [target] : []
    })
}

const findings = []
for (const filename of collectSourceFiles(sourceDir)) {
  const source = readFileSync(filename, 'utf8')
  for (const [index, line] of source.split('\n').entries()) {
    for (const match of line.matchAll(pictographPattern)) {
      const character = match[0]
      findings.push({
        file: path.relative(rootDir, filename),
        line: index + 1,
        column: (match.index ?? 0) + 1,
        character,
        codePoint: `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
      })
    }
  }
}

const designSource = readFileSync(designPath, 'utf8')
const hasDesignRule = designSource.includes('The No-Emoji-Icon Rule（禁 Emoji 图标原则）')

if (findings.length > 0 || !hasDesignRule) {
  console.error('UI Emoji icon gate FAILED')
  if (!hasDesignRule) console.error('- DESIGN.md is missing The No-Emoji-Icon Rule')
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line}:${finding.column} ${finding.character} (${finding.codePoint})`)
  }
  process.exit(1)
}

console.log(`PASS no hard-coded Emoji/Dingbat pictographs in ${collectSourceFiles(sourceDir).length} app UI source files; DESIGN.md rule present`)
