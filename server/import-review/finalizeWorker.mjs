import { parentPort, workerData } from 'node:worker_threads'
import { serialize } from 'node:v8'
import { finalizeInventory, finalizeProjection } from './finalizeComputation.mjs'

function failure(error) {
  return { message: error.message, code: error.code, status: error.status, stack: error.stack }
}

try {
  const { directory, revision } = workerData
  const projection = finalizeProjection(directory, revision)
  parentPort.postMessage({ phase: 'inventory' })
  let expectedFiles
  let inventoryError
  try {
    expectedFiles = finalizeInventory(directory, revision)
  } catch (error) {
    // Preserve the existing identity/report-before-inventory error precedence.
    inventoryError = failure(error)
  }
  // v8 serialization preserves Buffer fields, unlike structured clone.
  const bytes = serialize({ projection, expectedFiles, inventoryError })
  parentPort.postMessage({ bytes }, [bytes.buffer])
} catch (error) {
  parentPort.postMessage({ error: failure(error) })
}
