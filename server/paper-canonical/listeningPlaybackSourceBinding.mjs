const decoder = new TextDecoder()
const onceMarker = /仅读一遍/

function parseJsonBytes(bytes) {
  try {
    return JSON.parse(decoder.decode(bytes))
  } catch {
    return null
  }
}

function sourceTexts(sourceAsset) {
  const texts = []
  for (const block of sourceAsset?.content?.blocks || []) {
    if (block?.type === 'instruction' && typeof block.text === 'string') {
      texts.push(block.text)
    }
  }
  if (sourceAsset?.schemaVersion !== 'source-capture-v1') return texts
  for (const document of sourceAsset.documents || []) {
    if (typeof document?.encodedBytes !== 'string') continue
    const value = parseJsonBytes(Buffer.from(document.encodedBytes, 'base64'))
    const instruction = value?.section1?.instruction
    if (typeof instruction === 'string') texts.push(instruction)
    for (const block of value?.content?.blocks || []) {
      if (block?.type === 'instruction' && typeof block.text === 'string') {
        texts.push(block.text)
      }
    }
  }
  return texts
}

/**
 * Derive presentation-only playback compatibility from the immutable,
 * publication-validated source representation. Absence is the historical
 * two-play default; only the explicit source marker upgrades it to once.
 */
export function sourceBoundFirstSectionPlayback(sourceAsset) {
  return sourceTexts(sourceAsset).some((text) => onceMarker.test(text))
    ? 'once_explicit'
    : 'twice_default'
}

export function enrichSourceBoundListeningPlayback(occurrence, playback) {
  if (
    occurrence?.familyContractId !== 'listening'
    || occurrence.slotId !== 'listening.short-dialogue'
    || occurrence.firstSectionPlayback !== undefined
  ) return occurrence
  return { ...occurrence, firstSectionPlayback: playback }
}
