export const SCHEMA_VERSION = 'paper-sentence-analysis-v1'
export const TOKENIZER_VERSION = 'sentence-tokenizer-v2'

export const LIMITS = {
  sentenceText: 2000,
  tokens: 300,
  units: 128,
  relations: 256,
  restores: 16,
  restoreInsert: 80,
  depth: 16,
  noteZh: 80,
  noteLine: 30,
  // The voice line may take both lines of the strip at the narrowest card.
  voiceLine: 40,
  actionZh: 8,
  translationTextZh: 1000,
  serializedBytes: 128 * 1024,
}

// Width in Chinese characters: Latin letters, digits and ASCII punctuation count as half.
export function lineWidth(text) {
  let width = 0
  for (const char of String(text)) width += char.codePointAt(0) <= 0xff ? 0.5 : 1
  return width
}
