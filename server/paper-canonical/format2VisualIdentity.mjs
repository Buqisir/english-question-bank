export function format2VisualMediaId(visual) {
  return visual.stableIdentities?.canonicalMediaId
    ?? `media:${visual.observationId}`
}

export function format2VisualSourceSpanId(visual) {
  return visual.stableIdentities?.sourceSpanId
    ?? `source-span:${visual.observationId}`
}

export function format2VisualSourceObservationId(visual) {
  return format2VisualSourceSpanId(visual).slice('source-span:'.length)
}
