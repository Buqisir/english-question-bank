// Shared frontend HTTP plumbing for app/src/services/*.
//
// H11-A PR1 (behavior-preserving dedup): collapses the previously duplicated
// API_ORIGIN constant, apiPath host-resolution, decodeHeaderValue, and the
// repeated fetch error-body extraction blocks into one module.
//
// IMPORTANT — host-form preservation: the services historically diverged on
// whether `::1` (IPv6 loopback) counts as "local". questionGroups / draftPapers
// / mySpace included `::1`; paperImport / paperImportAi did NOT. This PR keeps
// BOTH forms verbatim (apiPath = ::1-inclusive, apiPathNoIpv6 = the 2-element
// form) so no caller's behavior changes. Unifying on the ::1-inclusive form is
// a SEPARATE, owner-acknowledged behavior change (not part of this PR).

export const API_ORIGIN = 'http://127.0.0.1:8787'

// ::1-inclusive host resolution. Used by questionGroups / draftPapers / mySpace.
export function apiPath(path: string) {
  if (typeof window === 'undefined') return path
  if (['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname)) return path
  return `${API_ORIGIN}${path}`
}

// 2-element host resolution WITHOUT `::1`. Used by paperImport / paperImportAi.
// Behavior-identical to those callers' previous local apiPath. Do NOT fold into
// apiPath() — adding `::1` here is a separate owner-acknowledged behavior change.
export function apiPathNoIpv6(path: string) {
  if (typeof window === 'undefined') return path
  if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
    return path
  }
  return `${API_ORIGIN}${path}`
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
