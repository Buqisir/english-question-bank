export const SOURCE_PROJECTION_VERSION = 'paper-selection-source-v2'
export const SEGMENTATION_VERSION = 'intl-segmenter-en-sentence-v1'
export const CONTEXT_POLICY = 'adjacent-v1'
export const PROMPT_VERSION = 'selection-prompt-v3'
export const CACHE_SCHEMA = 'qwen-selection-cache-v1'
export const REQUEST_SCHEMA = 'paper-selection-request-v1'
export const RESPONSE_SCHEMA = 'paper-selection-response-v2'
export const STATUS_SCHEMA = 'paper-selection-status-v1'
export const PROVIDER_ID = 'aliyun-model-studio'
export const MODEL_ID = 'qwen-mt-flash'
export const PROVIDER_EPOCH = 'qwen-mt-flash-epoch-1'
export const RATE_VERSION = 'qwen-mt-flash-cn-beijing-2026-09-21'
export const SOURCE_LANGUAGE = 'English'
export const TARGET_LANGUAGE = 'zh-Hans'
export const TRANSLATION_OPTIONS = Object.freeze({
  source_lang: 'English',
  target_lang: 'Chinese',
})

export const MAX_SELECTED_UTF16 = 8_000
export const MAX_CONTEXT_UTF16 = 12_000
export const MAX_SEGMENTS = 32
export const MAX_BODY_BYTES = 128 * 1024
export const FLASH_MAX_INPUT_TOKENS = 8_192
export const FLASH_MAX_OUTPUT_TOKENS = 8_192
export const FLASH_MAX_CONTEXT_TOKENS = 16_384
export const FRAGMENT_DEFAULT_MAX_TOKENS = 256

export const PAGE_CACHE_MAX_ENTRIES = 128
export const PAGE_CACHE_MAX_BYTES = 2 * 1024 * 1024
export const MEMORY_CACHE_MAX_BYTES = 8 * 1024 * 1024
export const SQLITE_CACHE_MAX_ENTRIES = 50_000
export const SQLITE_CACHE_MAX_PAYLOAD_BYTES = 128 * 1024 * 1024
export const SOURCE_CACHE_MAX_ENTRIES = 8
export const SOURCE_CACHE_MAX_BYTES = 16 * 1024 * 1024

export const MAX_INFLIGHT_KEYS = 32
export const MAX_UPSTREAM_CONCURRENT = 2
export const QUEUE_TIMEOUT_MS = 5_000
export const UPSTREAM_TIMEOUT_MS = 15_000
export const REQUEST_TIMEOUT_MS = 30_000
export const USER_RPM = 20
export const USER_BURST = 5
export const GLOBAL_RPM = 30
export const GLOBAL_RESERVED_TPM = 25_000

export const INPUT_YUAN_PER_MILLION = 0.7
export const OUTPUT_YUAN_PER_MILLION = 1.95

export const ALLOWED_REGION = 'cn-beijing'
export const TASK_FRAGMENT = 'contextual-fragment'
export const TASK_SELECTED_TEXT = 'selected-text'

export const ACCESS_SCOPE_PUBLIC = 'public-paper-v1'
