import { parentPort, workerData } from 'node:worker_threads'
import { serialize } from 'node:v8'
import { finalizeContentSubject, finalizeInventory, finalizeProjection, ocrConfirmationComputation } from './finalizeComputation.mjs'

function failure(error) {
  return { message: error.message, code: error.code, status: error.status, stack: error.stack }
}

try {
  const { directory, revision, operation, input, reviewerKind } = workerData
  const projection = finalizeProjection(directory, revision,
    operation === 'ocr-confirmation' ? { requireAnalyses: false } : undefined)
  if (operation === 'ocr-confirmation') {
    // Source bytes stay in this worker. Only identity and the confirmed result
    // cross back to the main thread, avoiding large projection deserialization.
    const identity = Object.fromEntries([
      'paperId', 'reviewKind', 'importProfile', 'sourceSetDigest', 'evidenceDigest', 'reviewStructureDigest',
      'sourceDigest', 'candidateDigest', 'visibleStructureDigest', 'analysisDigest',
      'paragraphSummariesDigest', 'publicSearchMetadataDigest',
    ].map(key => [key, projection[key]]))
    let confirmed
    let confirmationError
    try {
      confirmed = ocrConfirmationComputation(projection, input, reviewerKind)
    } catch (error) {
      // Main-thread projection/paper/bundle identity checks keep their precedence.
      confirmationError = failure(error)
    }
    const bytes = serialize({
      projection: identity,
      ...confirmed, confirmationError,
    })
    parentPort.postMessage({ bytes }, [bytes.buffer])
  } else {
    parentPort.postMessage({ phase: 'inventory' })
    let expectedFiles
    let inventoryError
    try {
      expectedFiles = finalizeInventory(directory, revision, projection)
    } catch (error) {
      // Preserve the existing identity/report-before-inventory error precedence.
      inventoryError = failure(error)
    }
    // v8 serialization preserves Buffer fields, unlike structured clone.
    const contentSubject = revision.id && revision.reviewKind === 'candidate' && !inventoryError
      ? finalizeContentSubject(directory, revision, projection) : null
    const bytes = serialize({ projection, expectedFiles, inventoryError, contentSubject })
    parentPort.postMessage({ bytes }, [bytes.buffer])
  }
} catch (error) {
  parentPort.postMessage({ error: failure(error) })
}
