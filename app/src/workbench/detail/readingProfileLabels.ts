// H12-B PR1: shared label maps + labelOf helper for the read-only reading
// difficulty profile view. Moved verbatim out of App.tsx so the extracted
// DifficultyProfileGrid and App.tsx share one definition (no drift).
export const surfaceQuestionTypeLabel: Record<string, string> = {
  single_detail_normal: '单细节普通题',
  multi_detail_learn_from: '多细节 / learn from',
  why_did: '原因题',
  word_meaning: '猜词 / 指代',
  paragraph_main_idea: '段落主旨',
  passage_main_idea: '文章主旨',
  writing_technique: '写作手法',
  paragraph_function: '段落功能',
  author_purpose: '写作目的',
  attitude_tone: '态度语气',
  inference_general: '普通推断',
  example_function: '例子功能',
  adjective_summary: '形容词压缩',
  abstract_phrase_summary: '抽象短语压缩',
}
export const answeringMoveLabel: Record<string, string> = {
  direct_locating: '直接定位',
  option_backtracking: '选项回文验证',
  context_guessing: '上下文猜测',
  coverage_test: '覆盖度检验',
  function_to_argument: '功能服务论点',
  rhetorical_method_identification: '识别写作手法',
  minimal_inference: '最小推断',
  description_to_adjective: '描述压缩成形容词',
  multi_point_matching: '多点细节整合',
  elimination: '逐项排除',
}
export const surfaceScopeLabel: Record<string, string> = {
  word_or_phrase: '词 / 短语',
  sentence: '单句',
  paragraph: '段落',
  passage: '全文',
  example: '例子 / 引用',
}
export const difficultyProfileLevelLabel: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  very_high: '极高',
}
export const infoSpanLabel: Record<string, string> = {
  single_point: '单点',
  multi_point: '多点',
  cross_paragraph: '跨段',
}
export const mainBlockerLabel: Record<string, string> = {
  vocab: '词汇',
  syntax: '语法',
  distractor: '干扰项',
  abstraction: '抽象',
  info_span: '信息跨度',
  topic: '话题',
}
export const blockerRoleLabel: Record<string, string> = {
  semantic_bridge: '同义桥梁',
  distractor_trap: '干扰陷阱',
  answer_key: '答案核心词',
  context_clue: '可猜线索',
}
export const blockerPositionLabel: Record<string, string> = {
  answer_path: '答案路径',
  correct_option: '正确选项',
  distractor: '干扰项',
  question_stem: '题干',
  passage_background: '背景信息',
}

export function labelOf(labels: Record<string, string>, value?: string) {
  if (!value) return '待判'
  return labels[value] || value
}
