// Hashing the renderer tree reads the whole built app (~250 MB) synchronously and stalls every
// request. A production process serves one sealed release directory and restarts on each
// deploy, so it hashes once; development keeps rehashing so edited sources mark revisions stale.
export function rendererBuildIdProvider({ explicitBuildId, production, compute }) {
  if (explicitBuildId) return explicitBuildId
  if (!production) return compute
  let releaseBuildId = null
  return () => (releaseBuildId ??= compute())
}
