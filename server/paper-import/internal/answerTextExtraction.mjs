import { spawnSync } from 'node:child_process'

import { sha256 } from '../../../shared/paper-canonical/stable.mjs'

const parameters = Object.freeze(['-layout', '-enc', 'UTF-8', '-', '-'])

function runPdftotext(args, input) {
  const result = spawnSync('pdftotext', args, {
    ...(input ? { input: Buffer.from(input) } : {}),
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH || '/usr/bin:/bin',
      LANG: 'C',
      LC_ALL: 'C',
    },
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    const error = new Error(
      `pdftotext failed: ${result.error?.message || result.stderr?.trim() || `exit ${result.status}`}`,
    )
    error.code = 'FORMAT2_ANSWER_TEXT_EXTRACTION_FAILED'
    throw error
  }
  return result
}

export function extractAnswerTextFromPdfBytes(answerPdfBytes) {
  const versionResult = runPdftotext(['-v'])
  const versionText = `${versionResult.stdout}\n${versionResult.stderr}`
  const toolVersion = /pdftotext version\s+([^\s]+)/u.exec(versionText)?.[1]
  if (!toolVersion) {
    const error = new Error('pdftotext version is unavailable')
    error.code = 'FORMAT2_ANSWER_TEXT_EXTRACTION_FAILED'
    throw error
  }
  const extractedText = runPdftotext(parameters, answerPdfBytes).stdout
  if (extractedText.length === 0) {
    const error = new Error('pdftotext produced empty answer evidence')
    error.code = 'FORMAT2_ANSWER_TEXT_EXTRACTION_FAILED'
    throw error
  }
  return {
    schemaVersion: 'answer-text-extraction-v1',
    tool: 'pdftotext',
    toolVersion,
    parameters: [...parameters],
    extractedText,
    extractedTextSha256: sha256(new TextEncoder().encode(extractedText)),
  }
}
