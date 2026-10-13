export const SCHEMA_VERSION: 'paper-sentence-analysis-v1'
export const TOKENIZER_VERSION: 'sentence-tokenizer-v2'

export const LIMITS: {
  readonly sentenceText: 2000
  readonly tokens: 300
  readonly units: 128
  readonly relations: 256
  readonly restores: 16
  readonly restoreInsert: 80
  readonly depth: 16
  readonly noteZh: 80
  readonly noteLine: 30
  readonly voiceLine: 40
  readonly translationTextZh: 1000
  readonly serializedBytes: number
}

export function lineWidth(text: string): number
