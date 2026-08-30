#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '../..')
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'))
const source = readJson('data/vocabulary/gaokao-frequency-source-ledger-v1.json').entries
const repairVersion = process.argv.includes('--repair-v10-pilot') ? 'v10-pilot' : process.argv.includes('--repair-v9-pilot') ? 'v9-pilot' : process.argv.includes('--repair-v8-pilot') ? 'v8-pilot' : process.argv.includes('--repair-v7-pilot') ? 'v7-pilot' : process.argv.includes('--repair-v6') ? 'v6' : process.argv.includes('--repair-v5') ? 'v5' : process.argv.includes('--repair-v2') ? 'v2' : process.argv.includes('--repair') ? 'v1' : null
const repairMode = Boolean(repairVersion)
const repairV6Spec = repairVersion === 'v6'
  ? readJson('.scratch/gaokao-audio-targeted-repair-v6/repair-spec.json')
  : null
const repairV7Spec = repairVersion === 'v7-pilot'
  ? readJson('.scratch/gaokao-audio-natural-reference-pilot-v7/repair-spec.json')
  : null
const repairV8Spec = repairVersion === 'v8-pilot'
  ? readJson('.scratch/gaokao-audio-syllabified-xsampa-pilot-v8/repair-spec.json')
  : null
const repairV9Spec = repairVersion === 'v9-pilot'
  ? readJson('.scratch/gaokao-audio-contrast-stress-pilot-v9/repair-spec.json')
  : null
const repairV10Spec = repairVersion === 'v10-pilot'
  ? readJson('.scratch/gaokao-audio-continuous-stress-pilot-v10/repair-spec.json')
  : null
const repairPlan = repairVersion === 'v10-pilot'
  ? { entries: repairV10Spec.entries.map((entry) => ({ entryId: entry.entryId, repairs: Object.fromEntries(entry.accents.map((accent) => [accent, true])), ownerVerdict: entry.previousVerdict })) }
  : repairVersion === 'v9-pilot'
  ? { entries: repairV9Spec.entries.map((entry) => ({ entryId: entry.entryId, repairs: Object.fromEntries(entry.accents.map((accent) => [accent, true])), ownerVerdict: entry.previousVerdict })) }
  : repairVersion === 'v8-pilot'
  ? { entries: repairV8Spec.entries.map((entry) => ({ entryId: entry.entryId, repairs: Object.fromEntries(entry.accents.map((accent) => [accent, true])), ownerVerdict: entry.previousVerdict })) }
  : repairVersion === 'v7-pilot'
  ? { entries: repairV7Spec.entries.map((entry) => ({ entryId: entry.entryId, repairs: Object.fromEntries(entry.accents.map((accent) => [accent, true])), ownerVerdict: entry.previousVerdict })) }
  : repairVersion === 'v6'
  ? { entries: repairV6Spec.entries.map((entry) => ({ entryId: entry.entryId, repairs: Object.fromEntries(entry.accents.map((accent) => [accent, true])), ownerVerdict: entry.verdict })) }
  : repairMode
    ? readJson('data/vocabulary/gaokao-frequency-full-audio-repair-plan-v1.json')
    : null
const repairById = new Map((repairPlan?.entries || []).map((entry) => [entry.entryId, entry]))
const americanPayload = readJson('data/vocabulary/gaokao-frequency-full-american-audio-manifest-v1.json')
const britishPayload = readJson('data/vocabulary/gaokao-frequency-full-british-audio-manifest-v1.json')
const americanById = new Map(americanPayload.entries.map((entry) => [entry.entryId, entry]))
const britishById = new Map(britishPayload.entries.map((entry) => [entry.entryId, entry]))
const repairV2AmericanById = repairVersion === 'v2'
  ? new Map(readJson('.scratch/gaokao-audio-repair-v2/american-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV2BritishById = repairVersion === 'v2'
  ? new Map(readJson('.scratch/gaokao-audio-repair-v2/british-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV5AmericanById = repairVersion === 'v5'
  ? new Map(readJson('.scratch/gaokao-audio-original-word-repair-v5/american-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV5BritishById = repairVersion === 'v5'
  ? new Map(readJson('.scratch/gaokao-audio-original-word-repair-v5/british-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV6AmericanById = repairVersion === 'v6'
  ? new Map(readJson('.scratch/gaokao-audio-targeted-repair-v6/american-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV6BritishById = repairVersion === 'v6'
  ? new Map(readJson('.scratch/gaokao-audio-targeted-repair-v6/british-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV6FallbackAmericanById = repairVersion === 'v6'
  ? new Map(readJson('.scratch/gaokao-audio-original-word-repair-v5/american-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV6FallbackBritishById = repairVersion === 'v6'
  ? new Map(readJson('.scratch/gaokao-audio-original-word-repair-v5/british-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV7AmericanById = repairVersion === 'v7-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-natural-reference-pilot-v7/american-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV7BritishById = repairVersion === 'v7-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-natural-reference-pilot-v7/british-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV7FallbackAmericanById = repairVersion === 'v7-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-original-word-repair-v5/american-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV7FallbackBritishById = repairVersion === 'v7-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-original-word-repair-v5/british-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV8AmericanById = repairVersion === 'v8-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-syllabified-xsampa-pilot-v8/american-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV8BritishById = repairVersion === 'v8-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-syllabified-xsampa-pilot-v8/british-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV8FallbackAmericanById = repairVersion === 'v8-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-original-word-repair-v5/american-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV8FallbackBritishById = repairVersion === 'v8-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-original-word-repair-v5/british-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV9AmericanById = repairVersion === 'v9-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-contrast-stress-pilot-v9/american-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV9BritishById = repairVersion === 'v9-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-contrast-stress-pilot-v9/british-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV9FallbackAmericanById = repairVersion === 'v9-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-syllabified-xsampa-pilot-v8/american-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV9FallbackBritishById = repairVersion === 'v9-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-syllabified-xsampa-pilot-v8/british-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV10AmericanById = repairVersion === 'v10-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-continuous-stress-pilot-v10/american-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV10BritishById = repairVersion === 'v10-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-continuous-stress-pilot-v10/british-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV10FallbackAmericanById = repairVersion === 'v10-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-syllabified-xsampa-pilot-v8/american-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()
const repairV10FallbackBritishById = repairVersion === 'v10-pilot'
  ? new Map(readJson('.scratch/gaokao-audio-syllabified-xsampa-pilot-v8/british-manifest.json').entries.map((entry) => [entry.entryId, entry]))
  : new Map()

const audioUrl = (manifest, entry) => `../audio/${manifest.version}/${entry.path}`
const fullEntries = source.map((entry, index) => {
  const originalRepairScope = repairById.has(entry.entryId) ? Object.keys(repairById.get(entry.entryId).repairs) : []
  const repairScope = repairVersion === 'v5' && repairById.has(entry.entryId) ? ['american', 'british'] : originalRepairScope
  const v7UsesAmericanFallback = repairVersion === 'v7-pilot' && !repairScope.includes('american') && repairV7FallbackAmericanById.has(entry.entryId)
  const v7UsesBritishFallback = repairVersion === 'v7-pilot' && !repairScope.includes('british') && repairV7FallbackBritishById.has(entry.entryId)
  const v8UsesAmericanFallback = repairVersion === 'v8-pilot' && !repairScope.includes('american') && repairV8FallbackAmericanById.has(entry.entryId)
  const v8UsesBritishFallback = repairVersion === 'v8-pilot' && !repairScope.includes('british') && repairV8FallbackBritishById.has(entry.entryId)
  const v9UsesAmericanFallback = repairVersion === 'v9-pilot' && !repairScope.includes('american') && repairV9FallbackAmericanById.has(entry.entryId)
  const v9UsesBritishFallback = repairVersion === 'v9-pilot' && !repairScope.includes('british') && repairV9FallbackBritishById.has(entry.entryId)
  const v10UsesAmericanFallback = repairVersion === 'v10-pilot' && !repairScope.includes('american') && repairV10FallbackAmericanById.has(entry.entryId)
  const v10UsesBritishFallback = repairVersion === 'v10-pilot' && !repairScope.includes('british') && repairV10FallbackBritishById.has(entry.entryId)
  const v6UsesAmericanFallback = repairVersion === 'v6' && !repairScope.includes('american') && repairV6FallbackAmericanById.has(entry.entryId)
  const v6UsesBritishFallback = repairVersion === 'v6' && !repairScope.includes('british') && repairV6FallbackBritishById.has(entry.entryId)
  const american = repairVersion === 'v10-pilot'
    ? repairScope.includes('american') ? repairV10AmericanById.get(entry.entryId) : repairV10FallbackAmericanById.get(entry.entryId) ?? americanById.get(entry.entryId)
    : repairVersion === 'v9-pilot'
    ? repairScope.includes('american') ? repairV9AmericanById.get(entry.entryId) : repairV9FallbackAmericanById.get(entry.entryId) ?? americanById.get(entry.entryId)
    : repairVersion === 'v8-pilot'
    ? repairScope.includes('american') ? repairV8AmericanById.get(entry.entryId) : repairV8FallbackAmericanById.get(entry.entryId) ?? americanById.get(entry.entryId)
    : repairVersion === 'v7-pilot'
    ? repairScope.includes('american') ? repairV7AmericanById.get(entry.entryId) : repairV7FallbackAmericanById.get(entry.entryId) ?? americanById.get(entry.entryId)
    : repairVersion === 'v6'
    ? repairScope.includes('american') ? repairV6AmericanById.get(entry.entryId) : repairV6FallbackAmericanById.get(entry.entryId) ?? americanById.get(entry.entryId)
    : repairVersion === 'v5' && repairScope.includes('american')
    ? repairV5AmericanById.get(entry.entryId)
    : repairVersion === 'v2' && repairScope.includes('american')
      ? repairV2AmericanById.get(entry.entryId)
      : americanById.get(entry.entryId)
  const british = repairVersion === 'v10-pilot'
    ? repairScope.includes('british') ? repairV10BritishById.get(entry.entryId) : repairV10FallbackBritishById.get(entry.entryId) ?? britishById.get(entry.entryId)
    : repairVersion === 'v9-pilot'
    ? repairScope.includes('british') ? repairV9BritishById.get(entry.entryId) : repairV9FallbackBritishById.get(entry.entryId) ?? britishById.get(entry.entryId)
    : repairVersion === 'v8-pilot'
    ? repairScope.includes('british') ? repairV8BritishById.get(entry.entryId) : repairV8FallbackBritishById.get(entry.entryId) ?? britishById.get(entry.entryId)
    : repairVersion === 'v7-pilot'
    ? repairScope.includes('british') ? repairV7BritishById.get(entry.entryId) : repairV7FallbackBritishById.get(entry.entryId) ?? britishById.get(entry.entryId)
    : repairVersion === 'v6'
    ? repairScope.includes('british') ? repairV6BritishById.get(entry.entryId) : repairV6FallbackBritishById.get(entry.entryId) ?? britishById.get(entry.entryId)
    : repairVersion === 'v5' && repairScope.includes('british')
    ? repairV5BritishById.get(entry.entryId)
    : repairVersion === 'v2' && repairScope.includes('british')
      ? repairV2BritishById.get(entry.entryId)
      : britishById.get(entry.entryId)
  if (!american || !british) throw new Error(`Missing selected audio for ${entry.entryId}`)
  return {
    index: index + 1,
    entryId: entry.entryId,
    headword: entry.headword,
    frequencyRank: entry.frequencyRank,
    frequencyStage: entry.frequencyStage,
    day: entry.day,
    phonetic: entry.observedPhonetic,
    partOfSpeech: entry.observedPartOfSpeech,
    sourceMeanings: entry.observedSourceMeanings,
    spokenText: { american: american.text, british: british.text },
    audio: {
      american: repairVersion === 'v10-pilot' ? repairScope.includes('american') ? `../audio/continuous-stress-pilot-v10/american/${american.path}` : v10UsesAmericanFallback ? `../audio/syllabified-xsampa-pilot-v8/american/${american.path}` : audioUrl(americanPayload, american) : repairVersion === 'v9-pilot' ? repairScope.includes('american') ? `../audio/contrast-stress-pilot-v9/american/${american.path}` : v9UsesAmericanFallback ? `../audio/syllabified-xsampa-pilot-v8/american/${american.path}` : audioUrl(americanPayload, american) : repairVersion === 'v8-pilot' ? repairScope.includes('american') ? `../audio/syllabified-xsampa-pilot-v8/american/${american.path}` : v8UsesAmericanFallback ? `../audio/original-word-repair-v5/american/${american.path}` : audioUrl(americanPayload, american) : repairVersion === 'v7-pilot' ? repairScope.includes('american') ? `../audio/natural-reference-pilot-v7/american/${american.path}?voice=owner-approved-c-v2` : v7UsesAmericanFallback ? `../audio/original-word-repair-v5/american/${american.path}` : audioUrl(americanPayload, american) : repairVersion === 'v6' ? repairScope.includes('american') ? `../audio/targeted-ipa-repair-v6/american/${american.path}` : v6UsesAmericanFallback ? `../audio/original-word-repair-v5/american/${american.path}` : audioUrl(americanPayload, american) : repairVersion === 'v5' ? `../audio/original-word-repair-v5/american/${american.path}` : repairVersion === 'v2' && repairScope.includes('american') ? `../audio/google-neural2-us-c-repair-v2/${american.path}` : audioUrl(americanPayload, american),
      british: repairVersion === 'v10-pilot' ? repairScope.includes('british') ? `../audio/continuous-stress-pilot-v10/british/${british.path}` : v10UsesBritishFallback ? `../audio/syllabified-xsampa-pilot-v8/british/${british.path}` : audioUrl(britishPayload, british) : repairVersion === 'v9-pilot' ? repairScope.includes('british') ? `../audio/contrast-stress-pilot-v9/british/${british.path}` : v9UsesBritishFallback ? `../audio/syllabified-xsampa-pilot-v8/british/${british.path}` : audioUrl(britishPayload, british) : repairVersion === 'v8-pilot' ? repairScope.includes('british') ? `../audio/syllabified-xsampa-pilot-v8/british/${british.path}` : v8UsesBritishFallback ? `../audio/original-word-repair-v5/british/${british.path}` : audioUrl(britishPayload, british) : repairVersion === 'v7-pilot' ? repairScope.includes('british') ? `../audio/natural-reference-pilot-v7/british/${british.path}?voice=owner-approved-d-v2` : v7UsesBritishFallback ? `../audio/original-word-repair-v5/british/${british.path}` : audioUrl(britishPayload, british) : repairVersion === 'v6' ? repairScope.includes('british') ? `../audio/targeted-ipa-repair-v6/british/${british.path}` : v6UsesBritishFallback ? `../audio/original-word-repair-v5/british/${british.path}` : audioUrl(britishPayload, british) : repairVersion === 'v5' ? `../audio/original-word-repair-v5/british/${british.path}` : repairVersion === 'v2' && repairScope.includes('british') ? `../audio/google-neural2-gb-d-repair-v2/${british.path}` : audioUrl(britishPayload, british),
    },
    repairScope,
    previousVerdict: repairById.get(entry.entryId)?.ownerVerdict || null,
  }
})
const entries = repairMode
  ? repairPlan.entries.map((repair, index) => ({ ...fullEntries.find((entry) => entry.entryId === repair.entryId), index: index + 1 }))
  : fullEntries

const escapeScriptJson = (value) => JSON.stringify(value).replaceAll('<', '\\u003c')
const outputDirectory = path.join(rootDir, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
const outputPath = path.join(outputDirectory, repairVersion === 'v10-pilot' ? 'continuous-stress-audio-pilot-owner-qa-v10.html' : repairVersion === 'v9-pilot' ? 'contrast-stress-audio-pilot-owner-qa-v9.html' : repairVersion === 'v8-pilot' ? 'syllabified-xsampa-audio-pilot-owner-qa-v8.html' : repairVersion === 'v7-pilot' ? 'natural-reference-audio-pilot-owner-qa-v7.html' : repairVersion === 'v6' ? 'full-3000-audio-targeted-repair-owner-qa-v6.html' : repairVersion === 'v5' ? 'full-3000-audio-repair-owner-qa-v5.html' : repairVersion === 'v2' ? 'full-3000-audio-repair-owner-qa-v2.html' : repairMode ? 'full-3000-audio-repair-owner-qa-v1.html' : 'full-3000-audio-owner-qa-v1.html')
const pageTitle = repairVersion === 'v10-pilot' ? '高中 3000 词｜4 词完整原词重音返修 V10' : repairVersion === 'v9-pilot' ? '高中 3000 词｜5 词重音对比返修 V9' : repairVersion === 'v8-pilot' ? '高中 3000 词｜6 词同声线精确重读小样 V8' : repairVersion === 'v7-pilot' ? '高中 3000 词｜6 词原声线一致性小样 V7' : repairVersion === 'v6' ? '高中 3000 词｜100 词针对性 IPA 返修 V6' : repairVersion === 'v5' ? '高中 3000 词｜117 词完整原词返修 V5' : repairVersion === 'v2' ? '高中 3000 词｜117 词自然重音返修 V2' : repairMode ? '高中 3000 词｜117 词读音返修 QA' : '高中 3000 词｜完整读音 QA'
const heading = repairVersion === 'v10-pilot' ? '4 词完整原词重音返修 V10' : repairVersion === 'v9-pilot' ? '5 词重音对比返修 V9' : repairVersion === 'v8-pilot' ? '6 词同声线精确重读小样 V8' : repairVersion === 'v7-pilot' ? '6 词原声线一致性小样 V7' : repairVersion === 'v6' ? '100 词针对性 IPA 返修 V6' : repairVersion === 'v5' ? '117 词完整原词返修 V5' : repairVersion === 'v2' ? '117 词自然重音返修 V2' : repairMode ? '117 词读音返修 QA' : '3000 词读音 QA'
const subheading = repairVersion === 'v10-pilot' ? '只 QA V9 剩余5条错误口音 · 原声线和完整原词不变 · 不拆音节、不裁切，只平滑强化重音' : repairVersion === 'v9-pilot' ? '只 QA V8 剩余6条错误口音 · 原声线不变 · the 只增响度，其余强化目标音节' : repairVersion === 'v8-pilot' ? '只 QA V7 仍错误的口音 · 原美音 C 女声与原英音 D 声线 · 明确音节边界与主次重音' : repairVersion === 'v7-pilot' ? '一次只 QA V5 判错口音 · 保持原美音 C 女声与原英音 D 声线 · 不换说话人' : repairVersion === 'v6' ? '只返修 V5 判错口音 · 完整原词 + 逐词 IPA 重音锁定 · 17 个合格词未改动' : repairVersion === 'v5' ? '美音、英音均以完整原词重新生成 · 逐词指出问题后再添加 SSML + IPA' : repairVersion === 'v2' ? 'Neural2 自然发音 + 适度强调 · 独立资源与记录，可明确区别第一版' : repairMode ? '只复核本轮返修词 · 原 3000 词 QA 记录不会被覆盖' : 'Google Neural2 · 美音 C + 英音男声 D · 每次只播放一个词'
const storageKey = repairVersion === 'v10-pilot' ? 'gaokao-continuous-stress-audio-pilot-owner-qa-v10' : repairVersion === 'v9-pilot' ? 'gaokao-contrast-stress-audio-pilot-owner-qa-v9' : repairVersion === 'v8-pilot' ? 'gaokao-syllabified-xsampa-audio-pilot-owner-qa-v8' : repairVersion === 'v7-pilot' ? 'gaokao-natural-reference-audio-pilot-owner-qa-v7' : repairVersion === 'v6' ? 'gaokao-full-3000-audio-targeted-repair-owner-qa-v6' : repairVersion === 'v5' ? 'gaokao-full-3000-audio-repair-owner-qa-v5' : repairVersion === 'v2' ? 'gaokao-full-3000-audio-repair-owner-qa-v2' : repairMode ? 'gaokao-full-3000-audio-repair-owner-qa-v1' : 'gaokao-full-3000-audio-owner-qa-v1'
const exportTarget = repairVersion === 'v10-pilot' ? 'gaokao-frequency-continuous-stress-audio-pilot-v10' : repairVersion === 'v9-pilot' ? 'gaokao-frequency-contrast-stress-audio-pilot-v9' : repairVersion === 'v8-pilot' ? 'gaokao-frequency-syllabified-xsampa-audio-pilot-v8' : repairVersion === 'v7-pilot' ? 'gaokao-frequency-natural-reference-audio-pilot-v7' : repairVersion === 'v6' ? 'gaokao-frequency-full-3000-audio-targeted-repair-v6' : repairVersion === 'v5' ? 'gaokao-frequency-full-3000-audio-repair-v5' : repairVersion === 'v2' ? 'gaokao-frequency-full-3000-audio-repair-v2' : repairMode ? 'gaokao-frequency-full-3000-audio-repair-v1' : 'gaokao-frequency-full-3000-audio-v1'
const exportFilename = repairVersion === 'v10-pilot' ? 'gaokao-frequency-continuous-stress-audio-pilot-owner-qa-v10.json' : repairVersion === 'v9-pilot' ? 'gaokao-frequency-contrast-stress-audio-pilot-owner-qa-v9.json' : repairVersion === 'v8-pilot' ? 'gaokao-frequency-syllabified-xsampa-audio-pilot-owner-qa-v8.json' : repairVersion === 'v7-pilot' ? 'gaokao-frequency-natural-reference-audio-pilot-owner-qa-v7.json' : repairVersion === 'v6' ? 'gaokao-frequency-full-3000-audio-targeted-repair-owner-qa-v6.json' : repairVersion === 'v5' ? 'gaokao-frequency-full-3000-audio-repair-owner-qa-v5.json' : repairVersion === 'v2' ? 'gaokao-frequency-full-3000-audio-repair-owner-qa-v2.json' : repairMode ? 'gaokao-frequency-full-3000-audio-repair-owner-qa-v1.json' : 'gaokao-frequency-full-3000-audio-owner-qa-v1.json'
const pilotRepair = ['v7-pilot', 'v8-pilot', 'v9-pilot', 'v10-pilot'].includes(repairVersion)
const americanButtonLabel = pilotRepair ? '播放待返修美音' : '播放美音 C'
const britishButtonLabel = pilotRepair ? '播放待返修英音' : '播放英音 D（男）'
mkdirSync(outputDirectory, { recursive: true })

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <link rel="icon" href="data:,">
  <title>${pageTitle}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f6f4; color: #1e1e1c; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body { margin: 0; min-height: 100vh; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
    button, input { font: inherit; }
    button:focus-visible, input:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(44,110,86,.2); }
    .shell { width: min(960px, 100%); margin: 0 auto; padding: 16px; }
    header { display: grid; gap: 16px; margin-bottom: 16px; }
    h1 { margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -.03em; }
    .subhead { margin: 8px 0 0; color: #6a6a64; font-size: 14px; line-height: 1.5; }
    .tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .jump { width: 190px; min-height: 44px; border: 1px solid #c6c6c0; border-radius: 6px; background: #fff; color: #1e1e1c; padding: 8px 12px; }
    .button { min-height: 44px; border: 1px solid #d8d8d2; border-radius: 6px; background: #fff; color: #1e1e1c; padding: 8px 16px; cursor: pointer; }
    .button:hover { background: #ededea; }
    .button.primary { border-color: #2c6e56; background: #2c6e56; color: #fff; }
    .button.primary:hover { background: #1e4a3a; }
    .button:disabled { cursor: not-allowed; opacity: .48; }
    .progress { height: 8px; overflow: hidden; border-radius: 999px; background: #e8e8e4; }
    .progress > i { display: block; width: 100%; height: 100%; border-radius: inherit; background: #2c6e56; transform: scaleX(0); transform-origin: left; transition: transform 160ms ease-out; }
    .summary { margin-top: 8px; color: #6a6a64; font-size: 12px; line-height: 1.5; }
    .card { border: 1px solid #d8d8d2; border-radius: 8px; background: #fff; box-shadow: 0 1px 2px rgba(30,30,28,.06); overflow: hidden; }
    .word-panel { padding: 32px 24px; text-align: center; background: #eaf1ed; }
    .position { color: #1e4a3a; font-size: 12px; font-weight: 600; }
    .word { margin: 16px 0 8px; font: 700 min(15vw, 64px)/1 Georgia, "Times New Roman", serif; letter-spacing: -.035em; overflow-wrap: anywhere; }
    .source { margin: 0; color: #6a6a64; font-size: 16px; line-height: 1.5; }
    .spoken { margin: 12px 0 0; color: #6a6a64; font-size: 14px; }
    .qa-panel { padding: 24px; }
    .audio-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .audio-button { min-height: 56px; border: 1px solid #a5cdbd; border-radius: 8px; background: #fff; color: #123020; cursor: pointer; font-weight: 600; }
    .audio-button:hover { background: #eaf1ed; }
    .audio-button.playing { border-color: #2c6e56; background: #2c6e56; color: #fff; }
    kbd { display: inline-flex; min-width: 24px; justify-content: center; margin-left: 6px; border: 1px solid currentColor; border-radius: 4px; padding: 1px 5px; font: 600 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; opacity: .75; }
    .label { margin: 24px 0 12px; color: #6a6a64; font-size: 12px; font-weight: 600; }
    .verdicts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .verdict { min-height: 50px; border: 1px solid #d8d8d2; border-radius: 8px; background: #fff; color: #1e1e1c; cursor: pointer; font-size: 14px; }
    .verdict:hover { background: #ededea; }
    .verdict.selected[data-value="pass"] { border-color: #2c6e56; background: #2c6e56; color: #fff; }
    .verdict.selected:not([data-value="pass"]) { border-color: #dc2626; background: #dc2626; color: #fff; }
    .issue-notes { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
    .issue-field { display: grid; gap: 8px; }
    .issue-field label { color: #1e1e1c; font-size: 12px; font-weight: 600; }
    .issue-field textarea { width: 100%; min-height: 72px; resize: vertical; border: 1px solid #d8d8d2; border-radius: 6px; background: #fff; color: #1e1e1c; padding: 8px 12px; font: inherit; line-height: 1.5; }
    .issue-field textarea::placeholder { color: #6a6a64; }
    .issue-field textarea:focus { outline: none; border-color: #2c6e56; box-shadow: 0 0 0 3px rgba(44,110,86,.2); }
    .issue-help { margin: 8px 0 0; color: #6a6a64; font-size: 12px; line-height: 1.5; }
    .state { min-height: 24px; margin: 16px 0 0; color: #6a6a64; font-size: 14px; text-align: center; }
    .nav { display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: 8px; margin-top: 16px; }
    .shortcut { margin: 16px 0 0; color: #6a6a64; font-size: 12px; line-height: 1.7; text-align: center; }
    @media (min-width: 720px) {
      .shell { padding: 24px; }
      header { grid-template-columns: 1fr auto; align-items: end; }
      .card { display: grid; grid-template-columns: .9fr 1.1fr; }
      .word-panel { display: flex; min-height: 430px; flex-direction: column; justify-content: center; padding: 32px; }
      .qa-panel { padding: 32px; }
    }
    @media (max-width: 560px) {
      .tools, .jump { width: 100%; }
      .tools .button { flex: 1; }
      .audio-actions, .verdicts, .issue-notes { grid-template-columns: 1fr 1fr; }
      .nav { grid-template-columns: 1fr 1fr; }
      .nav .primary { grid-column: 1 / -1; grid-row: 1; }
    }
    @media (max-width: 420px) { .issue-notes { grid-template-columns: 1fr; } }
    @media (pointer: coarse) { .button, .verdict, .audio-button { min-height: 48px; } }
    @media (prefers-reduced-motion: reduce) { .progress > i { transition: none; } }
  </style>
</head>
<body>
  <main class="shell">
    <header>
      <div><h1>${heading}</h1><p class="subhead">${subheading}</p></div>
      <div class="tools"><input class="jump" id="jump" type="search" placeholder="跳到序号或搜索单词" aria-label="跳到序号或搜索单词"><button class="button" id="exportQa">导出 QA</button><button class="button" id="clearQa">清空记录</button></div>
    </header>
    <div class="progress" aria-hidden="true"><i id="progressBar"></i></div>
    <p class="summary" id="summary" aria-live="polite"></p>
    <section class="card">
      <div class="word-panel">
        <div class="position" id="position"></div>
        <h2 class="word" id="word"></h2>
        <p class="source" id="source"></p>
        <p class="spoken" id="spoken"></p>
      </div>
      <div class="qa-panel">
        <div class="audio-actions"><button class="audio-button" data-accent="american">${americanButtonLabel} <kbd>W</kbd></button><button class="audio-button" data-accent="british">${britishButtonLabel}<kbd>D</kbd></button></div>
        <p class="label">${repairMode ? '只判断本轮返修的口音' : '判断这一个词的读音'}</p>
        <div class="verdicts">
          <button class="verdict" data-value="pass">${repairMode ? '返修音正确（默认）' : '都对（默认）'} <kbd>1</kbd></button>
          <button class="verdict" data-value="american_fail">美音错 <kbd>H</kbd></button>
          <button class="verdict" data-value="british_fail">英音错 <kbd>U</kbd></button>
          <button class="verdict" data-value="both_fail">都错 <kbd>I</kbd></button>
        </div>
        <div class="issue-notes">
          <div class="issue-field" data-issue-accent="american"><label for="americanIssue">美音问题</label><textarea id="americanIssue" placeholder="例如：第二音节重音太弱；元音读错"></textarea></div>
          <div class="issue-field" data-issue-accent="british"><label for="britishIssue">英音问题</label><textarea id="britishIssue" placeholder="例如：重音位置不对；尾音不完整"></textarea></div>
        </div>
        <p class="issue-help">问题说明会自动保存，并随“导出 QA”一起导出；填写某个口音的问题时会自动标记该口音错误。</p>
        <p class="state" id="qaState" aria-live="polite"></p>
        <div class="nav"><button class="button" id="previous">上一个 <kbd>⌫</kbd></button><button class="button primary" id="saveNext">保存并下一个 <kbd>空格</kbd></button><button class="button" id="later">稍后再看</button></div>
        <p class="shortcut"><span data-shortcut-accent="american"><kbd>W</kbd> 美音　</span><span data-shortcut-accent="british"><kbd>D</kbd> 英音　</span><span data-shortcut-verdict="american_fail"><kbd>H</kbd> 美音错　</span><span data-shortcut-verdict="british_fail"><kbd>U</kbd> 英音错　</span><span data-shortcut-verdict="both_fail"><kbd>I</kbd> 都错　</span>未选错误即默认正确　<kbd>空格</kbd> 保存并下一个　<kbd>⌫</kbd> 上一个　<kbd>L</kbd> 稍后　<kbd>←</kbd><kbd>→</kbd> 切词　<kbd>J</kbd> 搜索</p>
      </div>
    </section>
  </main>
  <script>
    const entries = ${escapeScriptJson(entries)}
    const storageKey = '${storageKey}'
    const readStored = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
    const state = { index: Number(localStorage.getItem(storageKey + ':index') || 0), records: readStored(storageKey + ':records', {}) }
    const $ = (selector) => document.querySelector(selector)
    let currentAudio = null
    const emptyRecord = () => ({ status: 'pending', audioVerdict: 'pending', americanIssue: '', britishIssue: '', issueAutoVerdict: false })
    const currentRecord = () => state.records[entries[state.index].entryId] || emptyRecord()
    const persist = () => { localStorage.setItem(storageKey + ':index', String(state.index)); localStorage.setItem(storageKey + ':records', JSON.stringify(state.records)) }
    const stopAudio = () => { if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null } document.querySelectorAll('.audio-button').forEach((button) => button.classList.remove('playing')) }
    const activeAccents = (entry) => entry.repairScope.length ? entry.repairScope : ['american', 'british']
    const play = (accent) => { stopAudio(); const entry = entries[state.index]; if (!activeAccents(entry).includes(accent)) return; const button = document.querySelector('[data-accent="' + accent + '"]'); button.classList.add('playing'); currentAudio = new Audio(entry.audio[accent]); currentAudio.addEventListener('ended', stopAudio); currentAudio.addEventListener('error', stopAudio); currentAudio.play() }
    const verdictLabel = (value) => ({ pass: '美音、英音都正确', american_fail: '已记：美音错误', british_fail: '已记：英音错误', both_fail: '已记：两个读音都错误', pending: '未选错误，保存时默认都对' }[value] || '未选错误，保存时默认都对')
    const verdictMatchesScope = (value, entry) => value === 'pass' || value === 'pending' || value === 'american_fail' && activeAccents(entry).includes('american') || value === 'british_fail' && activeAccents(entry).includes('british') || value === 'both_fail' && activeAccents(entry).length === 2
    const setVerdict = (value) => { const entry = entries[state.index]; if (!verdictMatchesScope(value, entry)) return; state.records[entry.entryId] = { ...emptyRecord(), ...currentRecord(), status: 'pending', audioVerdict: value, issueAutoVerdict: false }; persist(); render() }
    const saveIssue = (accent, value) => { const entry = entries[state.index]; if (!activeAccents(entry).includes(accent)) return; const record = { ...emptyRecord(), ...currentRecord(), status: 'pending', [accent + 'Issue']: value }; const americanHasIssue = Boolean(record.americanIssue.trim()); const britishHasIssue = Boolean(record.britishIssue.trim()); if (americanHasIssue || britishHasIssue) { record.audioVerdict = americanHasIssue && britishHasIssue ? 'both_fail' : americanHasIssue ? 'american_fail' : 'british_fail'; record.issueAutoVerdict = true } else if (record.issueAutoVerdict) { record.audioVerdict = 'pending'; record.issueAutoVerdict = false } state.records[entry.entryId] = record; persist(); $('#qaState').textContent = verdictLabel(record.audioVerdict) + ' · 问题说明已保存'; document.querySelectorAll('.verdict').forEach((button) => button.classList.toggle('selected', button.dataset.value === record.audioVerdict)) }
    const move = (delta) => { state.index = Math.max(0, Math.min(entries.length - 1, state.index + delta)); render() }
    const finalize = (status) => { const entry = entries[state.index]; const record = state.records[entry.entryId] || emptyRecord(); if (status === 'later') record.status = 'later'; else { if (record.audioVerdict === 'pending') record.audioVerdict = 'pass'; record.status = record.audioVerdict === 'pass' ? 'pass' : 'fail' } record.reviewedAt = new Date().toISOString(); state.records[entry.entryId] = record; persist(); move(1) }
    const render = () => {
      stopAudio(); state.index = Math.max(0, Math.min(entries.length - 1, state.index)); const entry = entries[state.index]; const record = currentRecord()
      $('#position').textContent = entry.index + ' / ' + entries.length + ' · 第 ' + entry.day + ' 天 · ' + entry.frequencyStage
      $('#word').textContent = entry.headword
      $('#source').textContent = [entry.partOfSpeech, entry.phonetic, entry.sourceMeanings.join('；')].filter(Boolean).join(' · ')
      const accents = activeAccents(entry)
      $('#spoken').textContent = entry.repairScope.length ? '本次只 QA：' + accents.map((value) => value === 'american' ? '美音' : '英音').join('、') : '实际送入语音：美 ' + entry.spokenText.american + ' · 英 ' + entry.spokenText.british
      document.querySelectorAll('.audio-button').forEach((button) => { button.hidden = !accents.includes(button.dataset.accent) })
      $('.audio-actions').style.gridTemplateColumns = 'repeat(' + accents.length + ', minmax(0, 1fr))'
      document.querySelectorAll('[data-issue-accent]').forEach((field) => { field.hidden = !accents.includes(field.dataset.issueAccent) })
      document.querySelectorAll('[data-shortcut-accent]').forEach((shortcut) => { shortcut.hidden = !accents.includes(shortcut.dataset.shortcutAccent) })
      document.querySelectorAll('[data-shortcut-verdict]').forEach((shortcut) => { shortcut.hidden = !verdictMatchesScope(shortcut.dataset.shortcutVerdict, entry) })
      $('.issue-notes').style.gridTemplateColumns = 'repeat(' + accents.length + ', minmax(0, 1fr))'
      document.querySelectorAll('.verdict').forEach((button) => { button.hidden = !verdictMatchesScope(button.dataset.value, entry) })
      $('.verdicts').style.gridTemplateColumns = 'repeat(' + (accents.length === 1 ? 2 : 4) + ', minmax(0, 1fr))'
      $('#americanIssue').value = record.americanIssue || ''
      $('#britishIssue').value = record.britishIssue || ''
      $('#qaState').textContent = verdictLabel(record.audioVerdict)
      document.querySelectorAll('.verdict').forEach((button) => button.classList.toggle('selected', button.dataset.value === record.audioVerdict))
      const values = Object.values(state.records); const completed = values.filter((value) => ['pass', 'fail', 'later'].includes(value.status)).length; const failures = values.filter((value) => value.status === 'fail').length; const later = values.filter((value) => value.status === 'later').length
      $('#summary').textContent = '已完成 ' + completed + ' / ' + entries.length + ' · 读音问题 ' + failures + ' · 稍后 ' + later + ' · 当前 ' + entry.headword
      $('#progressBar').style.transform = 'scaleX(' + completed / entries.length + ')'; $('#previous').disabled = state.index === 0; persist()
    }
    document.querySelectorAll('.audio-button').forEach((button) => button.addEventListener('click', () => play(button.dataset.accent)))
    document.querySelectorAll('.verdict').forEach((button) => button.addEventListener('click', () => setVerdict(button.dataset.value)))
    $('#americanIssue').addEventListener('input', (event) => saveIssue('american', event.currentTarget.value))
    $('#britishIssue').addEventListener('input', (event) => saveIssue('british', event.currentTarget.value))
    $('#previous').addEventListener('click', () => move(-1)); $('#saveNext').addEventListener('click', () => finalize('reviewed')); $('#later').addEventListener('click', () => finalize('later'))
    const jumpToEntry = (input) => { const query = input.value.trim().toLocaleLowerCase(); if (!query) return; const numeric = Number(query); const index = Number.isInteger(numeric) && numeric >= 1 && numeric <= entries.length ? numeric - 1 : entries.findIndex((entry) => entry.headword.toLocaleLowerCase() === query || entry.entryId.toLocaleLowerCase().includes(query)); if (index >= 0) { state.index = index; input.value = ''; render() } else { input.setCustomValidity('没有找到这个序号或单词'); input.reportValidity(); setTimeout(() => input.setCustomValidity(''), 1200) } }
    $('#jump').addEventListener('change', (event) => jumpToEntry(event.currentTarget))
    $('#jump').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); jumpToEntry(event.currentTarget) } })
    $('#clearQa').addEventListener('click', () => { if (confirm('清空本页读音 QA 的本地记录？此操作不能撤销。')) { state.records = {}; state.index = 0; persist(); render() } })
    $('#exportQa').addEventListener('click', () => { const qa = entries.map((entry) => ({ entryId: entry.entryId, headword: entry.headword, repairScope: entry.repairScope, previousVerdict: entry.previousVerdict, ...(state.records[entry.entryId] || emptyRecord()) })); const payload = { schemaVersion: 1, qaTarget: '${exportTarget}', exportedAt: new Date().toISOString(), qa }; const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2) + '\\n'], { type: 'application/json' })); link.download = '${exportFilename}'; link.click(); URL.revokeObjectURL(link.href) })
    document.addEventListener('keydown', (event) => { if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.target.closest('input, textarea, select') || event.target.closest('button') && event.key === 'Enter') return; const key = event.key.toLocaleLowerCase(); const verdicts = { '1': 'pass', h: 'american_fail', u: 'british_fail', i: 'both_fail' }; if (key === 'w') { event.preventDefault(); play('american') } else if (key === 'd') { event.preventDefault(); play('british') } else if (verdicts[key]) { event.preventDefault(); setVerdict(verdicts[key]) } else if (key === 'l') { event.preventDefault(); finalize('later') } else if (key === 'j') { event.preventDefault(); $('#jump').focus() } else if (event.key === ' ') { event.preventDefault(); finalize('reviewed') } else if (event.key === 'Backspace') { event.preventDefault(); move(-1) } else if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) } else if (event.key === 'ArrowRight') { event.preventDefault(); move(1) } })
    render()
  </script>
</body>
</html>
`

writeFileSync(outputPath, html)
console.log(`Wrote ${path.relative(rootDir, outputPath)} with ${entries.length} audio QA entries`)
