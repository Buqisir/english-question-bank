// 单进程部署假设：多进程部署需要改为持久锁。
const revisions = new Map()

function stateFor(key) {
  if (!revisions.has(key)) revisions.set(key, { files: new Set(), finalizing: false, queue: [] })
  return revisions.get(key)
}

function drain(key, state) {
  while (!state.finalizing && state.queue.length) {
    const next = state.queue[0]
    if (next.path === null ? state.files.size > 0 : state.files.has(next.path)) break
    state.queue.shift()
    next.resolve(grant(key, state, next.path))
  }
  if (!state.finalizing && !state.files.size && !state.queue.length) revisions.delete(key)
}

function grant(key, state, filePath) {
  if (filePath === null) state.finalizing = true
  else state.files.add(filePath)
  let released = false
  return () => {
    if (released) return
    released = true
    if (filePath === null) state.finalizing = false
    else state.files.delete(filePath)
    drain(key, state)
  }
}

export function acquireRevisionUpload(key, filePath = null) {
  const state = stateFor(key)
  return new Promise(resolve => {
    state.queue.push({ path: filePath, resolve })
    drain(key, state)
  })
}

// Existing synchronous internal callers fail closed while an async writer owns
// the revision. HTTP finalize uses the queued exclusive lease above.
export function tryRevisionFinalization(key) {
  const state = stateFor(key)
  if (state.finalizing || state.files.size || state.queue.length) {
    throw Object.assign(new Error('Revision upload is busy; retry after the active upload completes'), {
      code: 'IMPORT_REVIEW_UPLOAD_BUSY', status: 409,
    })
  }
  return grant(key, state, null)
}
