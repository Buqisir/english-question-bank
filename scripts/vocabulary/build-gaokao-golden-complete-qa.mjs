#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '../..')
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'))

const sample = readJson('data/vocabulary/gaokao-frequency-golden-sample-v1.json').entries
const learning = readJson('data/vocabulary/gaokao-frequency-golden-learning-reviewed-v1.json').entries
const visuals = readJson('data/vocabulary/gaokao-frequency-golden-visual-manifest-v1.json').entries
const americanPayload = readJson('data/vocabulary/gaokao-frequency-golden-american-audio-manifest-v1.json')
const britishPayload = readJson('data/vocabulary/gaokao-frequency-golden-british-audio-manifest-v1.json')
const american = americanPayload.entries
const british = britishPayload.entries
const bindingPath = path.join(rootDir, 'data/vocabulary/gaokao-frequency-golden-visual-bindings-v1.json')
const bindings = existsSync(bindingPath) ? JSON.parse(readFileSync(bindingPath, 'utf8')).entries : []

const byId = (entries) => new Map(entries.map((entry) => [entry.entryId, entry]))
const learningById = byId(learning)
const visualById = byId(visuals)
const americanById = byId(american)
const britishById = byId(british)
const bindingById = byId(bindings)

const visualAssetUrl = (assetPath) => {
  const marker = '/vocabulary-assets/gaokao-frequency-v1/'
  if (!assetPath?.startsWith(marker)) throw new Error(`Unexpected asset path: ${assetPath}`)
  return `../${assetPath.slice(marker.length)}`
}

const audioAssetUrl = (payload, assetPath) => {
  const publicPath = `${payload.publicBasePath}/${assetPath}`.replaceAll('//', '/')
  return visualAssetUrl(publicPath)
}

const entries = sample.map((source, index) => {
  const content = learningById.get(source.entryId)
  const visual = visualById.get(source.entryId)
  const us = americanById.get(source.entryId)
  const gb = britishById.get(source.entryId)
  const binding = bindingById.get(source.entryId) ?? null
  if (!content || !visual || !us || !gb) throw new Error(`Incomplete QA data for ${source.entryId}`)
  return {
    index: index + 1,
    entryId: source.entryId,
    headword: source.headword,
    frequencyRank: source.frequencyRank,
    frequencyStage: source.frequencyStage,
    curriculumTag: source.curriculumTag,
    phonetics: content.phonetics,
    partOfSpeech: content.partOfSpeech,
    teachingSenses: content.teachingSenses,
    examples: content.examples,
    visual: {
      src: visualAssetUrl(visual.path),
      alt: visual.alt,
      slug: visual.slug,
      width: visual.width,
      height: visual.height,
    },
    binding,
    audio: {
      american: audioAssetUrl(americanPayload, us.path),
      british: audioAssetUrl(britishPayload, gb.path),
    },
  }
})

const escapeScriptJson = (value) => JSON.stringify(value).replaceAll('<', '\\u003c')
const outputDirectory = path.join(rootDir, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
const outputPath = path.join(outputDirectory, 'golden-complete-owner-qa-v1.html')
mkdirSync(outputDirectory, { recursive: true })

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>高中 3000 词｜90 词完整 QA</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f4ef; color: #1e2523; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; }
    button { font: inherit; }
    .shell { width: min(1120px, 100%); margin: 0 auto; padding: 24px; }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
    .eyebrow { margin: 0 0 4px; color: #61706a; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(22px, 3vw, 34px); letter-spacing: -.03em; }
    .top-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .button { border: 1px solid #c8cec9; border-radius: 12px; background: #fff; color: #26302d; padding: 9px 13px; cursor: pointer; }
    .button:hover { border-color: #87938d; }
    .button.primary { color: #fff; border-color: #1f684d; background: #1f684d; }
    .progress { height: 8px; overflow: hidden; border-radius: 999px; background: #dedfd9; margin-bottom: 16px; }
    .progress > i { display: block; height: 100%; width: 0; border-radius: inherit; background: #2a7558; transition: width 160ms ease; }
    .card { display: grid; grid-template-columns: minmax(260px, .8fr) minmax(360px, 1.2fr); overflow: hidden; border: 1px solid #d5d7d2; border-radius: 24px; background: #fff; box-shadow: 0 18px 50px rgba(44, 53, 49, .09); }
    .visual-panel { min-height: 610px; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 34px; background: #e7efe8; color: #264e40; }
    .visual-panel img { display: block; width: auto; height: min(300px, 34vh); max-width: 100%; object-fit: contain; }
    .visual-meta { margin-top: 20px; text-align: center; }
    .mode { display: inline-flex; align-items: center; gap: 7px; border-radius: 999px; background: rgba(255,255,255,.7); padding: 7px 11px; font-size: 13px; font-weight: 700; }
    .mode[data-mode="sentence-scene"] { color: #714e0d; background: #fff2c9; }
    .mode[data-mode="visual-gap"] { color: #8a322d; background: #ffe3df; }
    .slug { margin: 10px 0 0; color: #61706a; font-size: 12px; }
    .content { padding: 34px 38px 30px; }
    .position { color: #6d7772; font-size: 13px; }
    .word { margin: 14px 0 4px; font: 700 clamp(42px, 6vw, 68px)/.98 Georgia, "Times New Roman", serif; letter-spacing: -.045em; }
    .meta { color: #67736e; font-size: 14px; }
    .audio-row { display: flex; gap: 10px; margin: 22px 0 12px; }
    .audio-button { min-width: 136px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid #b9c3bd; border-radius: 999px; background: #fff; padding: 10px 14px; cursor: pointer; }
    .audio-button.playing { color: #fff; border-color: #1f684d; background: #1f684d; }
    kbd { min-width: 22px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid currentColor; border-radius: 6px; padding: 1px 5px; font: 700 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; opacity: .72; }
    .audio-qa { border: 1px solid #d8ddd9; border-radius: 14px; background: #f7f8f6; padding: 12px; margin-bottom: 18px; }
    .qa-label { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 9px; color: #5d6964; font-size: 12px; font-weight: 800; letter-spacing: .04em; }
    .audio-verdicts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
    .audio-verdict { border: 1px solid #c8ceca; border-radius: 10px; background: #fff; color: #313936; padding: 8px 5px; cursor: pointer; font-size: 12px; }
    .audio-verdict.selected[data-audio-value="pass"] { color: #fff; border-color: #247253; background: #247253; }
    .audio-verdict.selected:not([data-audio-value="pass"]) { color: #fff; border-color: #a33c35; background: #a33c35; }
    .senses { margin: 0 0 22px; font-size: 18px; line-height: 1.55; }
    .examples { display: grid; gap: 11px; }
    .example { border-left: 3px solid #d5dbd7; padding: 3px 0 3px 14px; }
    .example.bound { border-left-color: #cf9d2f; background: linear-gradient(90deg, #fff8e7, transparent); }
    .english { margin: 0; font: 18px/1.45 Georgia, "Times New Roman", serif; }
    mark { color: inherit; background: #ffe386; border-radius: 4px; padding: 0 2px; }
    .chinese { margin: 3px 0 0; color: #66706b; font-size: 14px; }
    .binding-note { min-height: 40px; margin: 18px 0 0; color: #765d28; font-size: 13px; line-height: 1.5; }
    .verdicts { display: grid; grid-template-columns: 1.2fr .9fr 1.5fr; gap: 8px; margin-top: 16px; }
    .verdict { border: 1px solid #ccd1cd; border-radius: 12px; background: #fff; padding: 10px 8px; cursor: pointer; }
    .verdict.selected[data-action="other-issue"] { color: #fff; border-color: #a33c35; background: #a33c35; }
    .verdict[data-action="save"] { color: #fff; border-color: #247253; background: #247253; }
    .shortcut-help { margin: 12px 0 0; color: #69736f; font-size: 11px; line-height: 1.8; }
    .shortcut-help kbd { margin: 0 2px; }
    .nav { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: center; margin-top: 16px; }
    .nav .button:last-child { justify-self: end; }
    .summary { color: #66716c; font-size: 13px; text-align: center; }
    .grid-view { display: none; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
    body.grid .single-view, body.grid .nav, body.grid .progress { display: none; }
    body.grid .grid-view { display: grid; }
    .grid-card { min-width: 0; border: 1px solid #d6d8d3; border-radius: 16px; background: #fff; padding: 14px; color: #23483b; }
    .grid-card img { width: 100%; height: 118px; object-fit: contain; }
    .grid-word { color: #1e2523; font-weight: 800; margin-top: 8px; overflow-wrap: anywhere; }
    .grid-detail { margin-top: 4px; color: #66716c; font-size: 11px; line-height: 1.35; overflow-wrap: anywhere; }
    .grid-card[data-mode="sentence-scene"] { border-color: #d7b55b; background: #fffbef; }
    .grid-card[data-mode="visual-gap"] { border-color: #d6857e; background: #fff4f2; }
    @media (max-width: 760px) {
      .shell { padding: 14px; }
      .topbar { align-items: flex-start; }
      .card { grid-template-columns: 1fr; border-radius: 18px; }
      .visual-panel { min-height: 280px; padding: 24px; }
      .visual-panel img { height: 210px; }
      .content { padding: 25px 22px; }
      .word { font-size: 46px; }
      .audio-row { flex-direction: column; }
      .audio-button { width: 100%; }
      .audio-verdicts { grid-template-columns: repeat(2, 1fr); }
      .verdicts { grid-template-columns: 1fr 1fr; }
      .verdict[data-action="save"] { grid-column: 1 / -1; }
      .grid-view { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div><p class="eyebrow">Google Neural2 · 90-word golden sample</p><h1>读音 × 图片 × 三条例句 QA</h1></div>
      <div class="top-actions"><button class="button" id="toggleGrid">90 图总览</button><button class="button" id="exportQa">导出 QA</button><button class="button" id="clearQa">清空记录</button></div>
    </header>
    <div class="progress"><i id="progressBar"></i></div>
    <section class="single-view card">
      <div class="visual-panel">
        <img id="visual" alt="">
        <div class="visual-meta"><span class="mode" id="mode"></span><p class="slug" id="slug"></p></div>
      </div>
      <div class="content">
        <div class="position" id="position"></div>
        <h2 class="word" id="word"></h2>
        <div class="meta" id="meta"></div>
        <div class="audio-row"><button class="audio-button" data-accent="american">▶ 美音 C <kbd>A</kbd></button><button class="audio-button" data-accent="british">▶ 英音 D（男） <kbd>B</kbd></button></div>
        <section class="audio-qa" aria-label="读音 QA">
          <div class="qa-label"><span>读音 QA</span><span id="audioQaState">尚未判断</span></div>
          <div class="audio-verdicts">
            <button class="audio-verdict" data-audio-value="pass"><kbd>1</kbd> 都对</button>
            <button class="audio-verdict" data-audio-value="american_fail"><kbd>2</kbd> 美音错</button>
            <button class="audio-verdict" data-audio-value="british_fail"><kbd>3</kbd> 英音错</button>
            <button class="audio-verdict" data-audio-value="both_fail"><kbd>4</kbd> 都错</button>
          </div>
        </section>
        <p class="senses" id="senses"></p>
        <div class="examples" id="examples"></div>
        <p class="binding-note" id="bindingNote"></p>
        <div class="verdicts"><button class="verdict" data-action="other-issue"><kbd>X</kbd> 图片/例句有问题</button><button class="verdict" data-action="later"><kbd>L</kbd> 稍后再看</button><button class="verdict" data-action="save" id="saveNext"><kbd>Enter</kbd> 保存并下一个</button></div>
        <p class="shortcut-help"><kbd>A</kbd> 美音　<kbd>B</kbd> 英音　<kbd>1</kbd> 都对　<kbd>2</kbd> 美音错　<kbd>3</kbd> 英音错　<kbd>4</kbd> 都错　<kbd>X</kbd> 其他问题　<kbd>L</kbd> 稍后　<kbd>←</kbd><kbd>→</kbd> 切词</p>
      </div>
    </section>
    <nav class="nav"><button class="button" id="previous">← 上一个</button><div class="summary" id="summary"></div><button class="button primary" id="next">下一个 →</button></nav>
    <section class="grid-view" id="grid"></section>
  </main>
  <script>
    const entries = ${escapeScriptJson(entries)}
    const storageKey = 'gaokao-golden-complete-owner-qa-v1'
    const storedVerdicts = JSON.parse(localStorage.getItem(storageKey + ':verdicts') || '{}')
    const records = Object.fromEntries(Object.entries(storedVerdicts).map(([entryId, value]) => {
      if (value && typeof value === 'object') return [entryId, value]
      if (value === 'pass') return [entryId, { status: 'pass', audioVerdict: 'pass', contentVerdict: 'pass', migratedFromV1: true }]
      if (value === 'fail') return [entryId, { status: 'fail', audioVerdict: 'pending', contentVerdict: 'fail', migratedFromV1: true }]
      if (value === 'later') return [entryId, { status: 'later', audioVerdict: 'pending', contentVerdict: 'pending', migratedFromV1: true }]
      return [entryId, { status: 'pending', audioVerdict: 'pending', contentVerdict: 'pending' }]
    }))
    const state = { index: Number(localStorage.getItem(storageKey + ':index') || 0), records }
    let currentAudio = null
    const $ = (selector) => document.querySelector(selector)
    const modeLabel = (entry) => ({ 'direct-sense': '直接词义图', 'sentence-scene': '句义图', 'visual-gap': '视觉缺口' }[entry.binding?.visualMode] || '待语义分类')
    const audioVerdictLabel = (value) => ({ pass: '美音、英音都对', american_fail: '美音不对，英音正确', british_fail: '英音不对，美音正确', both_fail: '美音、英音都不对', pending: '尚未判断' }[value] || '尚未判断')
    const emptyRecord = () => ({ status: 'pending', audioVerdict: 'pending', contentVerdict: 'pending' })
    const currentRecord = () => state.records[entries[state.index].entryId] || emptyRecord()
    const ensureCurrentRecord = () => {
      const entryId = entries[state.index].entryId
      state.records[entryId] ||= emptyRecord()
      return state.records[entryId]
    }
    const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char])
    const highlighted = (text, highlight) => {
      const safe = escapeHtml(text); const target = escapeHtml(highlight)
      const index = safe.toLocaleLowerCase().indexOf(target.toLocaleLowerCase())
      return index < 0 ? safe : safe.slice(0, index) + '<mark>' + safe.slice(index, index + target.length) + '</mark>' + safe.slice(index + target.length)
    }
    const stopAudio = () => {
      if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null }
      document.querySelectorAll('.audio-button').forEach((button) => button.classList.remove('playing'))
    }
    const persist = () => {
      localStorage.setItem(storageKey + ':index', String(state.index))
      localStorage.setItem(storageKey + ':verdicts', JSON.stringify(state.records))
    }
    const playAccent = (accent) => {
      const entry = entries[state.index]
      const button = document.querySelector('.audio-button[data-accent="' + accent + '"]')
      stopAudio(); button.classList.add('playing'); currentAudio = new Audio(entry.audio[accent]); currentAudio.addEventListener('ended', stopAudio); currentAudio.addEventListener('error', stopAudio); currentAudio.play()
    }
    const setAudioVerdict = (value) => {
      const record = ensureCurrentRecord()
      record.audioVerdict = value
      record.status = 'pending'
      delete record.reviewedAt
      persist(); render()
    }
    const toggleOtherIssue = () => {
      const record = ensureCurrentRecord()
      record.contentVerdict = record.contentVerdict === 'fail' ? 'pass' : 'fail'
      record.status = 'pending'
      delete record.reviewedAt
      persist(); render()
    }
    const advance = () => {
      if (state.index < entries.length - 1) state.index += 1
      render()
    }
    const finalizeCurrent = (requestedStatus) => {
      const record = ensureCurrentRecord()
      if (requestedStatus === 'later') {
        record.status = 'later'
      } else {
        if (record.audioVerdict === 'pending') record.audioVerdict = 'pass'
        if (record.contentVerdict === 'pending') record.contentVerdict = 'pass'
        record.status = record.audioVerdict === 'pass' && record.contentVerdict === 'pass' ? 'pass' : 'fail'
      }
      record.reviewedAt = new Date().toISOString()
      persist(); advance()
    }
    const render = () => {
      stopAudio()
      state.index = Math.max(0, Math.min(entries.length - 1, state.index))
      const entry = entries[state.index]
      $('#visual').src = entry.visual.src; $('#visual').alt = entry.visual.alt
      $('#mode').textContent = modeLabel(entry); $('#mode').dataset.mode = entry.binding?.visualMode || 'unclassified'
      $('#slug').textContent = entry.visual.slug
      $('#position').textContent = entry.index + ' / ' + entries.length + ' · 频序 ' + entry.frequencyRank + ' · ' + entry.frequencyStage
      $('#word').textContent = entry.headword
      $('#meta').textContent = entry.partOfSpeech + ' · 美 ' + entry.phonetics.american + ' · 英 ' + entry.phonetics.british
      $('#senses').textContent = entry.teachingSenses.join('；')
      const boundId = entry.binding?.visualSentenceId
      $('#examples').innerHTML = entry.examples.map((example) => '<article class="example ' + (boundId === 'candidate-' + example.candidateId ? 'bound' : '') + '"><p class="english">' + highlighted(example.english, example.highlight) + '</p><p class="chinese">' + escapeHtml(example.chinese) + '</p></article>').join('')
      $('#bindingNote').textContent = entry.binding?.bindingRationale || '当前仅为原图候选；语义模式尚未冻结。'
      const record = currentRecord()
      $('#audioQaState').textContent = audioVerdictLabel(record.audioVerdict)
      document.querySelectorAll('.audio-verdict').forEach((button) => button.classList.toggle('selected', record.audioVerdict === button.dataset.audioValue))
      document.querySelector('[data-action="other-issue"]').classList.toggle('selected', record.contentVerdict === 'fail')
      $('#saveNext').innerHTML = record.audioVerdict !== 'pending' || record.contentVerdict === 'fail' ? '<kbd>Enter</kbd> 保存结果并下一个' : '<kbd>Enter</kbd> 全部合格并下一个'
      const values = Object.values(state.records)
      const completed = values.filter((value) => ['pass', 'fail', 'later'].includes(value.status))
      const pass = values.filter((value) => value.status === 'pass').length
      const fail = values.filter((value) => value.status === 'fail').length
      const audioIssues = values.filter((value) => ['american_fail', 'british_fail', 'both_fail'].includes(value.audioVerdict)).length
      $('#summary').textContent = '已过 ' + completed.length + ' / ' + entries.length + ' · 合格 ' + pass + ' · 有问题 ' + fail + ' · 读音问题 ' + audioIssues
      $('#progressBar').style.width = (completed.length / entries.length * 100) + '%'
      $('#previous').disabled = state.index === 0; $('#next').disabled = state.index === entries.length - 1
      persist()
    }
    document.querySelectorAll('.audio-button').forEach((button) => button.addEventListener('click', () => playAccent(button.dataset.accent)))
    document.querySelectorAll('.audio-verdict').forEach((button) => button.addEventListener('click', () => setAudioVerdict(button.dataset.audioValue)))
    document.querySelector('[data-action="other-issue"]').addEventListener('click', toggleOtherIssue)
    document.querySelector('[data-action="later"]').addEventListener('click', () => finalizeCurrent('later'))
    $('#saveNext').addEventListener('click', () => finalizeCurrent('reviewed'))
    $('#previous').addEventListener('click', () => { state.index -= 1; render() })
    $('#next').addEventListener('click', () => { state.index += 1; render() })
    $('#toggleGrid').addEventListener('click', () => { document.body.classList.toggle('grid'); $('#toggleGrid').textContent = document.body.classList.contains('grid') ? '返回逐词 QA' : '90 图总览' })
    $('#clearQa').addEventListener('click', () => { if (confirm('清空这 90 个词的本地 QA 记录？')) { state.records = {}; state.index = 0; persist(); render() } })
    $('#exportQa').addEventListener('click', () => {
      const audioParts = (verdict) => ({
        american: verdict === 'american_fail' || verdict === 'both_fail' ? 'fail' : verdict === 'pending' ? 'pending' : 'pass',
        british: verdict === 'british_fail' || verdict === 'both_fail' ? 'fail' : verdict === 'pending' ? 'pending' : 'pass',
      })
      const qa = entries.map((entry) => {
        const record = state.records[entry.entryId] || emptyRecord()
        const audio = audioParts(record.audioVerdict)
        const issues = []
        if (audio.american === 'fail') issues.push('american_audio')
        if (audio.british === 'fail') issues.push('british_audio')
        if (record.contentVerdict === 'fail') issues.push('visual_or_examples')
        return { entryId: entry.entryId, headword: entry.headword, status: record.status, audioVerdict: record.audioVerdict, americanAudio: audio.american, britishAudio: audio.british, contentVerdict: record.contentVerdict, issues, reviewedAt: record.reviewedAt || null }
      })
      const payload = { schemaVersion: 2, qaTarget: 'gaokao-frequency-golden-complete-v1', exportedAt: new Date().toISOString(), shortcutContract: { playAmerican: 'A', playBritish: 'B', audioPass: '1', americanFail: '2', britishFail: '3', bothFail: '4', otherIssue: 'X', later: 'L', saveAndNext: 'Enter', previous: 'ArrowLeft', next: 'ArrowRight' }, qa }
      const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2) + '\\n'], { type: 'application/json' })); link.download = 'gaokao-frequency-golden-complete-owner-qa-v1.json'; link.click(); URL.revokeObjectURL(link.href)
    })
    document.addEventListener('keydown', (event) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target.closest('input, textarea, select') || event.target.closest('button') && event.key === 'Enter') return
      const key = event.key.toLocaleLowerCase()
      const audioByKey = { '1': 'pass', '2': 'american_fail', '3': 'british_fail', '4': 'both_fail' }
      if (key === 'a') { event.preventDefault(); playAccent('american') }
      else if (key === 'b') { event.preventDefault(); playAccent('british') }
      else if (audioByKey[key]) { event.preventDefault(); setAudioVerdict(audioByKey[key]) }
      else if (key === 'x') { event.preventDefault(); toggleOtherIssue() }
      else if (key === 'l') { event.preventDefault(); finalizeCurrent('later') }
      else if (event.key === 'Enter') { event.preventDefault(); finalizeCurrent('reviewed') }
      else if (event.key === 'ArrowLeft' && state.index > 0) { event.preventDefault(); state.index -= 1; render() }
      else if (event.key === 'ArrowRight' && state.index < entries.length - 1) { event.preventDefault(); state.index += 1; render() }
    })
    $('#grid').innerHTML = entries.map((entry) => '<article class="grid-card" data-mode="' + (entry.binding?.visualMode || 'unclassified') + '"><img src="' + entry.visual.src + '" alt="' + escapeHtml(entry.visual.alt) + '"><div class="grid-word">' + entry.index + '. ' + escapeHtml(entry.headword) + '</div><div class="grid-detail">' + escapeHtml(modeLabel(entry)) + '<br>' + escapeHtml(entry.visual.slug) + '<br>' + escapeHtml(entry.teachingSenses.join('；')) + '</div></article>').join('')
    render()
  </script>
</body>
</html>
`

writeFileSync(outputPath, html)
console.log(`Wrote ${path.relative(rootDir, outputPath)} with ${entries.length} complete QA entries`)
