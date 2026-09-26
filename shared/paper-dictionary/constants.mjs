export const DICTIONARY_SCHEMA = 'eqb-dictionary-v1'
export const DICTIONARY_REQUEST_SCHEMA = 'paper-dictionary-request-v1'
export const DICTIONARY_RESPONSE_SCHEMA = 'paper-dictionary-response-v1'
export const DICTIONARY_STATUS_SCHEMA = 'paper-dictionary-status-v1'
export const WORD_TOKEN_VERSION = 'word-token-v1'
export const FORM_LOOKUP_VERSION = 'form-lookup-v1'

export const MAX_WORD_UTF16 = 128
export const MAX_DICTIONARY_BODY_BYTES = 8 * 1024
export const MAX_DICTIONARY_RESPONSE_BYTES = 64 * 1024
export const DICTIONARY_LOOKUP_RPM = 60

export const DICTIONARY_PAGE_CACHE_MAX_ENTRIES = 128
export const DICTIONARY_PAGE_CACHE_MAX_BYTES = 2 * 1024 * 1024
export const DICTIONARY_MEMORY_CACHE_MAX_BYTES = 8 * 1024 * 1024
export const DICTIONARY_MEMORY_CACHE_MAX_ENTRIES = 512
export const SENSE_DEBOUNCE_MS = 250

export const DICTIONARY_ATTRIBUTION = 'Open Dictionary / Wiktionary 衍生数据，含模型生成释义'

// 本文义只在圈中的这一个词的义项里选。qwen-mt-flash 从清单里原样抄一条。
// 这把密钥只放行 mt-flash。抄不对就不标。不把后面的词并成短语。
export const SENSE_PICK_REQUEST_SCHEMA = 'paper-dictionary-sense-request-v1'
export const SENSE_PICK_RESPONSE_SCHEMA = 'paper-dictionary-sense-response-v1'
export const SENSE_PICK_PROMPT_VERSION = 'sense-pick-v5'
export const SENSE_PICK_MAX_CANDIDATES = 24
export const SENSE_PICK_MAX_OCCURRENCE_UTF16 = 1200
export const SENSE_PICK_MAX_OUTPUT_TOKENS = 64
// 预留按最大候选清单估算；结算按实际 usage。与翻译共用一个月度额度，按 mt-flash 计价。
export const SENSE_PICK_RESERVED_INPUT_TOKENS = 1024
export const SENSE_PICK_RATE_VERSION = 'qwen-sense-pick-cn-beijing-2026-10-21'
export const SENSE_PICK_DEFAULT_MODEL = 'qwen-mt-flash'
