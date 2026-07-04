// Shared frontend HTTP plumbing for app/src/services/*.
//
// H11-A PR1 (behavior-preserving dedup): collapses the previously duplicated
// API_ORIGIN constant, apiPath host-resolution, decodeHeaderValue, and the
// repeated fetch error-body extraction blocks into one module.
//
// launch-deploy Slice 1 (H11-A PR1 deferred "两形态合并", owner-acknowledged):
// in every real topology (dev via Vite proxy, prod via Caddy reverse_proxy)
// the API is same-origin with the frontend, so the previous absolute-origin
// fallback (`http://127.0.0.1:8787`) was always wrong off localhost — it sent
// every request to the visiting browser's own machine and tripped
// mixed-content on HTTPS. Both functions now always return the relative
// `path` in the browser. The `::1` vs 2-element host-form distinction that
// used to gate the fallback is now moot (there is no fallback branch left),
// so apiPath and apiPathNoIpv6 are behavior-identical; both names are kept as
// thin wrappers so existing imports (paperImport.ts / paperImportAi.ts use
// apiPathNoIpv6; the rest use apiPath) keep resolving unchanged.

// Always relative in the browser — same-origin addressing (see note above).
// SSR guard: no `window` means we can't resolve a hostname, so just hand back
// the path unchanged.
export function apiPath(path: string) {
  if (typeof window === 'undefined') return path
  return path
}

// Behavior-identical to apiPath (see note above). Kept as a separate export
// only so paperImport.ts / paperImportAi.ts imports keep resolving.
export function apiPathNoIpv6(path: string) {
  return apiPath(path)
}

export function decodeHeaderValue(value: string | null) {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

// Extract a server `{ error }` message from a non-ok response body, falling back
// to the provided string. Mirrors the previously inlined/duplicated extraction
// (`(await response.json().catch(() => null)) as { error?: string } | null`).
export async function errorMessageFromResponse(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null
  return data?.error || fallback
}

// Same extraction, returned pre-wrapped as an Error (matches the old `parseError`
// helpers in paperImport / paperImportAi).
export async function errorFromResponse(response: Response, fallback: string) {
  return new Error(await errorMessageFromResponse(response, fallback))
}
