// Dev (Vite proxy) and production (Caddy) both use same-origin API paths.
export function apiPath(path: string) {
  if (typeof window === 'undefined') return path
  return path
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
