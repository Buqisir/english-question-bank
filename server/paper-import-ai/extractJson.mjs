// Extract the first complete JSON object from raw model text.
//
// Relayed OpenAI-compatible models (e.g. gpt-5.5 via an OpenAI-compatible proxy)
// intermittently emit a valid JSON object followed by trailing junk — most
// commonly one surplus closing brace ("...}}}}"), sometimes trailing prose or a
// markdown fence. A naive JSON.parse(whole) then fails, and a first-`{`..last-`}`
// slice also fails because the last `}` is the stray one. Walking brace depth
// (string-aware) finds the first balanced top-level object and ignores anything
// after it, which recovers these responses deterministically.
export function extractFirstJsonObject(rawText) {
  const text = String(rawText || '').trim()
  if (!text) return null

  // Fast path: the whole text is already one clean JSON value.
  try {
    return JSON.parse(text)
  } catch {
    // Fall through to balanced-object extraction.
  }

  const start = text.indexOf('{')
  if (start < 0) return null

  // Walk braces from the first '{', respecting string literals and escapes, and
  // return the first balanced top-level object. Tolerates trailing surplus
  // braces / prose / fences that some relayed models append.
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          break
        }
      }
    }
  }

  // Last-resort heuristic: widest brace span. Handles odd shapes the balanced
  // scan can't, e.g. a stray '{' inside leading prose before the real object.
  const end = text.lastIndexOf('}')
  if (end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      return null
    }
  }
  return null
}
