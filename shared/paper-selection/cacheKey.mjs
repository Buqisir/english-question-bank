import { createHash } from 'node:crypto'
import { digestJson, stableStringify } from '../paper-canonical/stable.mjs'
import {
  ACCESS_SCOPE_PUBLIC,
  CACHE_SCHEMA,
  CONTEXT_POLICY,
  MODEL_ID,
  PROVIDER_EPOCH,
  PROVIDER_ID,
  SOURCE_LANGUAGE,
  SOURCE_PROJECTION_VERSION,
  TARGET_LANGUAGE,
  TRANSLATION_OPTIONS,
} from './constants.mjs'
import { promptMeta } from './prompt.mjs'
import { SEGMENTATION_VERSION } from './segmentation.mjs'

export function stableRequestOptions({ maxTokens, temperature = 0 }) {
  return {
    translation_options: TRANSLATION_OPTIONS,
    max_tokens: maxTokens,
    temperature,
    stream: false,
  }
}

export function buildCacheKeyInput({
  accessScope = ACCESS_SCOPE_PUBLIC,
  region,
  deploymentScope,
  taskMode,
  requestOptions,
  contextText,
  selectionInContext,
  selectedText,
  boundaryRoles,
}) {
  const prompt = promptMeta()
  return {
    cacheSchema: CACHE_SCHEMA,
    accessScope,
    provider: PROVIDER_ID,
    region,
    deploymentScope,
    model: MODEL_ID,
    providerEpoch: PROVIDER_EPOCH,
    sourceProjectionVersion: SOURCE_PROJECTION_VERSION,
    segmentationVersion: SEGMENTATION_VERSION,
    contextPolicy: CONTEXT_POLICY,
    sourceLanguage: SOURCE_LANGUAGE,
    targetLanguage: TARGET_LANGUAGE,
    taskMode,
    promptVersion: prompt.promptVersion,
    promptTemplateHash: prompt.promptTemplateHash,
    requestOptions,
    contextText,
    selectionInContext,
    selectedText,
    boundaryRoles,
  }
}

export function cacheKeyFromInput(input) {
  return createHash('sha256')
    .update(stableStringify(buildCacheKeyInput(input)), 'utf8')
    .digest('hex')
}

export function cacheKeyDigest(input) {
  return digestJson(buildCacheKeyInput(input))
}
