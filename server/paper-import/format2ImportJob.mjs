import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createFormat2ImportJobRuntime,
} from './internal/format2ImportJobRuntime.mjs'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const runtime = createFormat2ImportJobRuntime({ repositoryRoot })

/**
 * Public pre-confirmation seam for one supported Format 2 import Job.
 * Storage and internal adapter choices are bound behind this one-input seam.
 */
export function startOrContinueFormat2ImportJob(input) {
  if (arguments.length !== 1) return runtime.rejectUnsupportedPublicArguments()
  return runtime.startOrContinueFormat2ImportJob(input)
}
