import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { digestJson } from '../../shared/paper-canonical/stable.mjs'

const TOOLS = [
  ['magick', ['-version'], true],
  ['ffmpeg', ['-version'], true],
  ['soffice', ['--version'], false],
  ['pdfinfo', ['-v'], false],
  ['pdftoppm', ['-v'], false],
  ['unzip', ['-v'], false],
]

function firstLine(value) {
  return String(value || '').split(/\r?\n/u).find((line) => line.trim())?.trim() || 'version reported on stderr'
}

export function checkImportEnvironment() {
  const checks = TOOLS.map(([name, args, inspectLinks]) => {
    let executable
    try {
      executable = execFileSync('/usr/bin/env', ['which', name], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
      const version = execFileSync(executable, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let dynamicLinks = null
      if (inspectLinks && process.platform === 'darwin') {
        dynamicLinks = execFileSync('/usr/bin/otool', ['-L', executable], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).split(/\r?\n/u).slice(1).map((line) => line.trim()).filter(Boolean)
        if (dynamicLinks.length === 0) throw new Error('dynamic-link inventory is empty')
      }
      return { name, executable, launch: 'healthy', version: firstLine(version), dynamicLinks }
    } catch (error) {
      const detail = String(error.stderr || error.message || error).trim().split(/\r?\n/u)[0]
      throw new Error(`Import environment preflight failed for ${name}: ${detail}`)
    }
  })
  const environmentDigest = digestJson({
    platform: process.platform,
    architecture: process.arch,
    checks,
  })
  return {
    schemaVersion: 'import-environment-preflight-v1',
    platform: process.platform,
    architecture: process.arch,
    checks,
    environmentDigest,
    policy: 'dependencies_checked_before_source_processing; no_mid_run_install_or_upgrade',
  }
}

export function writeImportEnvironmentPreflightReceipt(paperDir, result) {
  const outputPath = path.join(
    paperDir,
    'materialization',
    'import-environment-preflight-v1.json',
  )
  mkdirSync(path.dirname(outputPath), { recursive: true })
  const { receiptPath: _receiptPath, ...receipt } = result
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`)
  return outputPath
}

export function runImportEnvironmentPreflight({ paperDir = null } = {}) {
  const result = checkImportEnvironment()
  const receiptPath = paperDir
    ? writeImportEnvironmentPreflightReceipt(paperDir, result)
    : null
  return { ...result, receiptPath }
}
