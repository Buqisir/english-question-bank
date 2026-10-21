// Bounded location/type summaries only; never retain the exception stack or
// filesystem/SQL snapshots in status responses.
export function reviewBackfillDiagnostic(error) {
  return {
    reasonCode: error.reasonCode || error.code || 'COMPUTATION_FAILED',
    pointer: String(error.pointer || '').slice(0, 256),
    message: String(error.message || error.reasonCode || error.code || 'Computation failed').slice(0, 256),
  }
}
