// Hashing the renderer tree reads the whole built app (~250 MB) synchronously and stalls every
// request. A production process serves one sealed release directory and restarts on each
// deploy, so it hashes once; development keeps rehashing to record new submissions.
// This is only historical receipt identity. Eligibility uses the independently
// computed server target in reviewBuildIdentity.mjs and persisted compatibility.
export function rendererBuildIdProvider({ explicitBuildId, production, compute }) {
  if (explicitBuildId) return explicitBuildId
  if (!production) return compute
  let releaseBuildId = null
  return () => (releaseBuildId ??= compute())
}
