#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifestPath = path.join(root, '.scratch/gaokao-google-voice-qwen-exact-crop-v20/manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (
  manifest.schemaVersion !== 'gaokao-frequency-google-voice-qwen-exact-crop-v20'
  || manifest.entries.length !== 2
  || manifest.failures.length !== 0
  || manifest.entries.some((entry) => entry.exactCandidateHashMatch !== true)
) {
  throw new Error('Expected two exact V17 full-source replays for V20 calibration')
}

const cases = manifest.entries.map((entry) => ({
  id: `${entry.entryId}--${entry.accent}`,
  entryId: entry.entryId,
  headword: entry.headword,
  accent: entry.accent,
  candidateLabel: entry.candidateLabel,
  verifiedIpa: entry.verifiedIpa,
  source: entry.rawPublicPath,
  google: entry.googlePublicPath,
  duration: entry.rawDurationSeconds,
  initialStart: entry.initialStartSeconds,
  initialEnd: entry.initialEndSeconds,
  prompt: entry.prompt,
  exactHash: entry.replayedCandidateSha256,
})).sort((left, right) => left.headword.localeCompare(right.headword))

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-voice-qwen-exact-crop-owner-qa-v20.html')
const payload = JSON.stringify(cases).replaceAll('<', '\\u003c')

writeFileSync(outputPath, `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>高中 3000 词｜完整源音精确裁切 V20</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1e1e1c;
      background: #f6f6f4;
      --surface: #ffffff;
      --ink: #1e1e1c;
      --muted: #6a6a64;
      --border: #d8d8d2;
      --teal: #2c6e56;
      --teal-soft: #e8f0ec;
      --danger: #8b3a31;
      --danger-soft: #f8ece9;
      --focus: #174c3a;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; background: #f6f6f4; }
    button, input, select { font: inherit; }
    button { min-height: 40px; }
    button:focus-visible, input:focus-visible, select:focus-visible, canvas:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--focus) 32%, transparent);
      outline-offset: 2px;
    }
    main { width: min(1020px, calc(100% - 32px)); margin: 0 auto; padding: 44px 0 72px; }
    .eyebrow { margin: 0 0 8px; color: var(--teal); font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    h1 { max-width: 760px; margin: 0; font-size: clamp(28px, 5vw, 42px); line-height: 1.08; letter-spacing: -.035em; }
    .intro { max-width: 740px; margin: 14px 0 0; color: var(--muted); font-size: 16px; line-height: 1.7; }
    .guide { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; margin: 28px 0 16px; overflow: hidden; border: 1px solid var(--border); border-radius: 8px; background: var(--border); }
    .guide div { min-height: 92px; padding: 16px; background: var(--surface); }
    .guide strong { display: block; margin-bottom: 7px; font-size: 14px; }
    .guide span { color: var(--muted); font-size: 13px; line-height: 1.55; }
    .summary { position: sticky; top: 10px; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 56px; margin-bottom: 18px; padding: 12px 16px; border: 1px solid #345d4e; border-radius: 8px; color: #fff; background: #254d3e; box-shadow: 0 8px 24px rgba(30, 30, 28, .12); }
    .summary strong { font-size: 14px; }
    .summary span { color: #dcebe4; font-size: 12px; }
    .card { margin: 18px 0; padding: 24px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); box-shadow: 0 8px 26px rgba(30, 30, 28, .05); }
    .card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 18px; }
    .title-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .index { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
    h2 { margin: 0; font-size: 28px; line-height: 1.1; letter-spacing: -.02em; }
    .accent { color: var(--muted); font-size: 14px; }
    .ipa { margin: 8px 0 0; color: var(--muted); font-size: 14px; }
    .ipa strong { color: var(--ink); font-size: 16px; font-weight: 650; }
    .verified { flex: none; padding: 6px 9px; border: 1px solid #b9d1c6; border-radius: 999px; color: #245b47; background: var(--teal-soft); font-size: 12px; font-weight: 750; }
    .reference-row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .reference-row p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
    .button { border: 1px solid var(--border); border-radius: 6px; color: var(--ink); background: #fff; cursor: pointer; transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease; }
    .button:hover { border-color: #afafa8; background: #f7f7f5; }
    .button.primary { border-color: var(--teal); color: #fff; background: var(--teal); }
    .button.primary:hover { border-color: #235a46; background: #235a46; }
    .button.danger { color: var(--danger); }
    .button.danger.selected { border-color: #d6a69f; background: var(--danger-soft); }
    .reference-button { flex: none; padding: 0 14px; }
    .wave-shell { position: relative; overflow: hidden; border: 1px solid var(--border); border-radius: 8px 8px 4px 4px; background: #fafaf8; cursor: crosshair; touch-action: none; }
    .wave-shell canvas { display: block; width: 100%; height: 178px; }
    .wave-help { position: absolute; top: 10px; left: 12px; z-index: 2; margin: 0; padding: 4px 7px; border-radius: 4px; color: #4e504c; background: rgba(255,255,255,.9); font-size: 12px; pointer-events: none; }
    .timeline { display: flex; justify-content: space-between; margin: 6px 1px 0; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
    .transport { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 14px 0 20px; }
    .transport .button { padding: 0 14px; }
    .speed { display: flex; align-items: center; gap: 7px; margin-left: auto; color: var(--muted); font-size: 12px; }
    .speed select { height: 40px; padding: 0 28px 0 10px; border: 1px solid var(--border); border-radius: 6px; color: var(--ink); background: #fff; }
    .boundaries { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .boundary { padding: 16px; border: 1px solid var(--border); border-radius: 6px; background: #fcfcfa; }
    .boundary-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 11px; }
    .boundary-head strong { font-size: 14px; }
    .time-value { font-size: 16px; font-variant-numeric: tabular-nums; }
    .boundary input[type="range"] { width: 100%; accent-color: var(--teal); }
    .nudge-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 10px; }
    .nudge-row button { min-height: 34px; padding: 0 5px; border: 1px solid var(--border); border-radius: 4px; color: #484944; background: #fff; cursor: pointer; font-size: 12px; font-variant-numeric: tabular-nums; }
    .set-now { width: 100%; margin-top: 8px; border-style: dashed !important; }
    .selection-receipt { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 14px 0; padding: 12px 14px; border: 1px solid var(--border); border-radius: 6px; background: #f8f8f6; }
    .selection-receipt strong { font-size: 14px; }
    .selection-receipt output { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
    .decision { display: flex; gap: 8px; flex-wrap: wrap; }
    .decision .button { padding: 0 15px; }
    .decision-status { min-height: 21px; margin: 11px 0 0; color: var(--muted); font-size: 13px; }
    .decision-status.ready { color: #245b47; font-weight: 650; }
    .decision-status.missing { color: var(--danger); font-weight: 650; }
    details { margin-top: 14px; border-top: 1px solid var(--border); }
    summary { padding-top: 13px; color: var(--muted); cursor: pointer; font-size: 12px; }
    .prompt { margin: 10px 0 0; padding: 12px; overflow-wrap: anywhere; border-radius: 4px; color: #4c4d48; background: #f6f6f4; font: 12px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
    .loading { color: var(--muted); }
    .load-error { color: var(--danger); }
    @media (max-width: 720px) {
      main { width: min(100% - 20px, 1020px); padding-top: 24px; }
      .guide { grid-template-columns: 1fr; }
      .guide div { min-height: 0; }
      .summary { align-items: flex-start; flex-direction: column; gap: 3px; }
      .card { padding: 18px 14px; }
      .card-head { align-items: flex-start; flex-direction: column; gap: 10px; }
      .wave-shell canvas { height: 150px; }
      .boundaries { grid-template-columns: 1fr; }
      .speed { width: 100%; margin-left: 0; }
      .selection-receipt { align-items: flex-start; flex-direction: column; gap: 5px; }
      .decision .button { flex: 1 1 180px; }
    }
    @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; } }
  </style>
</head>
<body>
  <!--
  THESIS: Replace guessed crop windows with an exact, audible Owner-controlled boundary tool.
  OWN WORLD: A quiet calibration bench with paper-white surfaces, technical receipts, and one restrained teal action color.
  STORY: Understand the three-step task, calibrate each verified full source, then leave two explicit saved decisions.
  FIRST VIEWPORT: Title, three-step operating guide, progress receipt, and the beginning of the first waveform.
  FORM: Compact workbench cards, waveform-first interaction, paired boundary controls, visible persisted decisions.
  FINISH: Full-source hash match, 10 ms nudges, accessible controls, responsive layout, and local-only persistence.
  SEED: crop-calibrator-v20-operate-01
  -->
  <main>
    <p class="eyebrow">Owner crop calibration · V20</p>
    <h1>完整源音里，亲手框出那个词</h1>
    <p class="intro">这次不再猜截点。两条都是 V17 当时那次生成的完整 8 秒源音，并已通过原候选哈希反向校验。先在波形上拖出大概范围，再听选区，用 10ms 按钮把词头、词尾对准。</p>
    <section class="guide" aria-label="操作步骤">
      <div><strong>1. 先听完整源音</strong><span>找到真正独立读出的目标词，不要只看静音间隔。</span></div>
      <div><strong>2. 拖拽并微调</strong><span>波形上粗选；分别用词头、词尾的 ±10ms / ±50ms 精调。</span></div>
      <div><strong>3. 保存判断</strong><span>选区完整干净就保存；若完整源音里也没有目标词，直接标记。</span></div>
    </section>
    <div class="summary" id="summary" aria-live="polite"></div>
    <section id="cards" aria-label="待裁切词条"></section>
  </main>
  <script>
    const cases = ${payload}
    const storageKey = 'gaokao-google-voice-qwen-exact-crop-owner-qa-v20'
    const accentLabel = {american: '美音', british: '英音'}
    const state = JSON.parse(localStorage.getItem(storageKey) || '{}')
    const players = new Set()

    function clamp(value, min, max) { return Math.min(max, Math.max(min, value)) }
    function seconds(value) { return Number(value).toFixed(3) + 's' }
    function nearlyEqual(left, right) { return Math.abs(Number(left) - Number(right)) < 0.0005 }
    function saveState() { localStorage.setItem(storageKey, JSON.stringify(state)); updateSummary() }
    function stopOtherPlayers(except) { for (const player of players) if (player !== except) player.stop() }
    function updateSummary() {
      const ready = cases.filter((item) => state[item.id]?.verdict === 'ready').length
      const missing = cases.filter((item) => state[item.id]?.verdict === 'missing').length
      const pending = cases.length - ready - missing
      document.querySelector('#summary').innerHTML = '<strong>已保存 ' + ready + ' 条 · 源音不可用 ' + missing + ' 条 · 待判断 ' + pending + ' 条</strong><span>记录仅保存在这台电脑的当前浏览器，不会改正式音频</span>'
    }

    function createCard(item, index) {
      const record = state[item.id] || {}
      let start = clamp(Number(record.start ?? item.initialStart), 0, item.duration - .08)
      let end = clamp(Number(record.end ?? item.initialEnd), start + .08, item.duration)
      let dragAnchor = null
      let animationFrame = null
      let selectionEnd = null
      let decoded = null
      let sourceMode = null

      const card = document.createElement('article')
      card.className = 'card'
      card.dataset.caseId = item.id
      card.innerHTML = \`
        <header class="card-head">
          <div>
            <div class="title-row"><span class="index"></span><h2></h2><span class="accent"></span></div>
            <p class="ipa">核准目标：<strong></strong></p>
          </div>
          <span class="verified">完整源音哈希一致</span>
        </header>
        <div class="reference-row"><button class="button reference-button" type="button">播放 Google 原音</button><p>先确认目标口音和完整读法，再去完整生成源里定位。</p></div>
        <div class="wave-shell"><p class="wave-help">绿色区只是旧自动范围，请在波形上拖拽重选</p><canvas tabindex="0" role="img"></canvas></div>
        <div class="timeline"><span>0.000s</span><span class="duration"></span></div>
        <div class="transport">
          <button class="button full-button" type="button">播放完整源音</button>
          <button class="button primary selection-button" type="button">播放当前选区</button>
          <button class="button reset-button" type="button">恢复自动初始范围</button>
          <label class="speed">播放速度<select aria-label="完整源音播放速度"><option value="0.75">0.75×</option><option value="1" selected>1×</option></select></label>
        </div>
        <div class="boundaries">
          <section class="boundary start-boundary">
            <div class="boundary-head"><strong>词头</strong><span class="time-value"></span></div>
            <input type="range" min="0" step="0.01" aria-label="词头时间">
            <div class="nudge-row"><button type="button" data-delta="-.05">−50ms</button><button type="button" data-delta="-.01">−10ms</button><button type="button" data-delta=".01">+10ms</button><button type="button" data-delta=".05">+50ms</button></div>
            <button class="button set-now" type="button">把当前播放位置设为词头</button>
          </section>
          <section class="boundary end-boundary">
            <div class="boundary-head"><strong>词尾</strong><span class="time-value"></span></div>
            <input type="range" min="0" step="0.01" aria-label="词尾时间">
            <div class="nudge-row"><button type="button" data-delta="-.05">−50ms</button><button type="button" data-delta="-.01">−10ms</button><button type="button" data-delta=".01">+10ms</button><button type="button" data-delta=".05">+50ms</button></div>
            <button class="button set-now" type="button">把当前播放位置设为词尾</button>
          </section>
        </div>
        <div class="selection-receipt"><strong>当前选区</strong><output></output></div>
        <div class="decision"><button class="button primary save-button" type="button">保存当前选区</button><button class="button danger missing-button" type="button">完整源音里没有完整目标词</button><button class="button clear-button" type="button">撤销本条判断</button></div>
        <p class="decision-status" aria-live="polite"></p>
        <details><summary>查看这条完整源音的生成脚本</summary><pre class="prompt"></pre></details>\`

      card.querySelector('.index').textContent = '#' + String(index + 1).padStart(2, '0')
      card.querySelector('h2').textContent = item.headword
      card.querySelector('.accent').textContent = accentLabel[item.accent] + ' · ' + item.candidateLabel
      card.querySelector('.ipa strong').textContent = item.verifiedIpa
      card.querySelector('canvas').setAttribute('aria-label', item.headword + ' ' + accentLabel[item.accent] + ' 完整源音波形')
      card.querySelector('.prompt').textContent = item.prompt

      const canvas = card.querySelector('canvas')
      const shell = card.querySelector('.wave-shell')
      const fullButton = card.querySelector('.full-button')
      const selectionButton = card.querySelector('.selection-button')
      const speedSelect = card.querySelector('.speed select')
      const startRange = card.querySelector('.start-boundary input')
      const endRange = card.querySelector('.end-boundary input')
      startRange.max = item.duration
      endRange.max = item.duration
      card.querySelector('.timeline .duration').textContent = seconds(item.duration)
      const startValue = card.querySelector('.start-boundary .time-value')
      const endValue = card.querySelector('.end-boundary .time-value')
      const receipt = card.querySelector('.selection-receipt output')
      const status = card.querySelector('.decision-status')
      const missingButton = card.querySelector('.missing-button')
      const googleButton = card.querySelector('.reference-button')
      const audio = new Audio(item.source)
      const googleAudio = new Audio(item.google)

      function dirty() {
        return record.verdict === 'ready' && (!nearlyEqual(start, record.savedStart) || !nearlyEqual(end, record.savedEnd))
      }
      function syncRecordDraft() {
        state[item.id] = {...record, start: Number(start.toFixed(3)), end: Number(end.toFixed(3))}
        Object.assign(record, state[item.id])
        saveState()
      }
      function updateStatus() {
        card.dataset.verdict = record.verdict || 'pending'
        card.dataset.savedStart = record.savedStart == null ? '' : String(record.savedStart)
        card.dataset.savedEnd = record.savedEnd == null ? '' : String(record.savedEnd)
        missingButton.classList.toggle('selected', record.verdict === 'missing')
        status.className = 'decision-status'
        if (dirty()) {
          status.textContent = '边界已修改，请重新保存当前选区。'
        } else if (record.verdict === 'ready') {
          status.classList.add('ready')
          status.textContent = '已保存：' + seconds(record.savedStart) + ' – ' + seconds(record.savedEnd) + '（' + seconds(record.savedEnd - record.savedStart) + '）'
        } else if (record.verdict === 'missing') {
          status.classList.add('missing')
          status.textContent = '已记录：完整源音里没有可用的完整目标词。'
        } else {
          status.textContent = '尚未保存。调整边界不会改正式音频。'
        }
      }
      function render() {
        startRange.value = start
        endRange.value = end
        startValue.textContent = seconds(start)
        endValue.textContent = seconds(end)
        receipt.textContent = seconds(start) + ' – ' + seconds(end) + ' · 时长 ' + seconds(end - start)
        updateStatus()
        draw()
      }
      function setStart(next, persist = true) {
        start = clamp(Number(next), 0, end - .08)
        start = Number(start.toFixed(3))
        render()
        if (persist) syncRecordDraft()
      }
      function setEnd(next, persist = true) {
        end = clamp(Number(next), start + .08, item.duration)
        end = Number(end.toFixed(3))
        render()
        if (persist) syncRecordDraft()
      }
      function stop() {
        audio.pause()
        googleAudio.pause()
        selectionEnd = null
        sourceMode = null
        fullButton.textContent = '播放完整源音'
        selectionButton.textContent = '播放当前选区'
        googleButton.textContent = '播放 Google 原音'
        if (animationFrame) cancelAnimationFrame(animationFrame)
        animationFrame = null
        draw()
      }
      function animate() {
        if (selectionEnd != null && audio.currentTime >= selectionEnd) stop()
        draw()
        if (!audio.paused) animationFrame = requestAnimationFrame(animate)
      }
      function playSource(mode) {
        stopOtherPlayers(controller)
        googleAudio.pause()
        if (sourceMode === mode && !audio.paused) { stop(); return }
        audio.pause()
        audio.playbackRate = Number(speedSelect.value)
        sourceMode = mode
        if (mode === 'selection') {
          audio.currentTime = start
          selectionEnd = end
          selectionButton.textContent = '停止选区'
          fullButton.textContent = '播放完整源音'
        } else {
          audio.currentTime = 0
          selectionEnd = null
          fullButton.textContent = '停止完整源音'
          selectionButton.textContent = '播放当前选区'
        }
        audio.play().then(animate).catch((error) => {
          stop()
          status.className = 'decision-status missing'
          status.textContent = '播放失败：' + error.message
        })
      }
      function pointerTime(event) {
        const rect = canvas.getBoundingClientRect()
        return clamp((event.clientX - rect.left) / rect.width * item.duration, 0, item.duration)
      }
      function draw() {
        const dpr = window.devicePixelRatio || 1
        const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
        const height = Math.max(1, Math.round(canvas.clientHeight * dpr))
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
        const context = canvas.getContext('2d')
        context.clearRect(0, 0, width, height)
        context.fillStyle = '#fafaf8'
        context.fillRect(0, 0, width, height)
        if (!decoded) {
          context.fillStyle = '#6a6a64'
          context.font = (13 * dpr) + 'px Inter, sans-serif'
          context.fillText('正在读取完整源音波形…', 16 * dpr, height / 2)
          return
        }
        const mid = height / 2
        const xStart = start / item.duration * width
        const xEnd = end / item.duration * width
        context.fillStyle = '#e8f0ec'
        context.fillRect(xStart, 0, Math.max(1, xEnd - xStart), height)
        context.strokeStyle = '#bfc0ba'
        context.lineWidth = Math.max(1, dpr)
        context.beginPath()
        context.moveTo(0, mid)
        context.lineTo(width, mid)
        context.stroke()
        const step = Math.max(1, Math.floor(decoded.length / width))
        context.strokeStyle = '#565954'
        context.lineWidth = Math.max(1, dpr)
        context.beginPath()
        for (let x = 0; x < width; x += Math.max(1, Math.round(dpr))) {
          const offset = Math.floor(x / width * decoded.length)
          let min = 1
          let max = -1
          for (let sampleIndex = offset; sampleIndex < Math.min(decoded.length, offset + step); sampleIndex += 1) {
            const value = decoded[sampleIndex]
            if (value < min) min = value
            if (value > max) max = value
          }
          const top = mid + min * mid * .86
          const bottom = mid + max * mid * .86
          context.moveTo(x, top)
          context.lineTo(x, bottom)
        }
        context.stroke()
        context.strokeStyle = '#2c6e56'
        context.lineWidth = 2 * dpr
        for (const x of [xStart, xEnd]) {
          context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke()
        }
        if (!audio.paused) {
          const playX = audio.currentTime / item.duration * width
          context.strokeStyle = '#1e1e1c'
          context.lineWidth = Math.max(1, dpr)
          context.beginPath(); context.moveTo(playX, 0); context.lineTo(playX, height); context.stroke()
        }
      }

      const controller = {stop}
      players.add(controller)
      audio.addEventListener('ended', stop)
      audio.addEventListener('loadedmetadata', draw)
      window.addEventListener('resize', draw)
      fullButton.addEventListener('click', () => playSource('full'))
      selectionButton.addEventListener('click', () => playSource('selection'))
      googleButton.addEventListener('click', () => {
        if (!googleAudio.paused) { stop(); return }
        stopOtherPlayers(controller)
        stop()
        googleButton.textContent = '停止 Google 原音'
        googleAudio.currentTime = 0
        googleAudio.play().catch((error) => { status.textContent = 'Google 原音播放失败：' + error.message })
        googleAudio.addEventListener('ended', () => { googleButton.textContent = '播放 Google 原音' }, {once: true})
      })
      startRange.addEventListener('input', (event) => setStart(event.target.value))
      endRange.addEventListener('input', (event) => setEnd(event.target.value))
      card.querySelectorAll('.start-boundary [data-delta]').forEach((button) => button.addEventListener('click', () => setStart(start + Number(button.dataset.delta))))
      card.querySelectorAll('.end-boundary [data-delta]').forEach((button) => button.addEventListener('click', () => setEnd(end + Number(button.dataset.delta))))
      card.querySelector('.start-boundary .set-now').addEventListener('click', () => setStart(audio.currentTime))
      card.querySelector('.end-boundary .set-now').addEventListener('click', () => setEnd(audio.currentTime))
      card.querySelector('.reset-button').addEventListener('click', () => {
        start = item.initialStart
        end = item.initialEnd
        render()
        syncRecordDraft()
      })
      card.querySelector('.save-button').addEventListener('click', () => {
        Object.assign(record, {start, end, savedStart: start, savedEnd: end, verdict: 'ready', savedAt: new Date().toISOString()})
        state[item.id] = {...record}
        saveState()
        render()
      })
      missingButton.addEventListener('click', () => {
        Object.assign(record, {start, end, verdict: 'missing', savedAt: new Date().toISOString()})
        delete record.savedStart
        delete record.savedEnd
        state[item.id] = {...record}
        saveState()
        render()
      })
      card.querySelector('.clear-button').addEventListener('click', () => {
        Object.assign(record, {start, end})
        delete record.verdict
        delete record.savedStart
        delete record.savedEnd
        delete record.savedAt
        state[item.id] = {...record}
        saveState()
        render()
      })
      shell.addEventListener('pointerdown', (event) => {
        stop()
        dragAnchor = pointerTime(event)
        shell.setPointerCapture(event.pointerId)
        start = clamp(dragAnchor, 0, item.duration - .08)
        end = clamp(start + .08, start + .08, item.duration)
        render()
      })
      shell.addEventListener('pointermove', (event) => {
        if (dragAnchor == null) return
        const current = pointerTime(event)
        start = clamp(Math.min(dragAnchor, current), 0, item.duration - .08)
        end = clamp(Math.max(dragAnchor, current), start + .08, item.duration)
        start = Number(start.toFixed(3)); end = Number(end.toFixed(3))
        render()
      })
      shell.addEventListener('pointerup', () => { if (dragAnchor != null) { dragAnchor = null; syncRecordDraft() } })
      shell.addEventListener('pointercancel', () => { if (dragAnchor != null) { dragAnchor = null; syncRecordDraft() } })

      render()
      fetch(item.source).then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status)
        return response.arrayBuffer()
      }).then(async (arrayBuffer) => {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        const context = new AudioContextClass()
        const buffer = await context.decodeAudioData(arrayBuffer)
        decoded = buffer.getChannelData(0)
        await context.close()
        draw()
      }).catch((error) => {
        canvas.classList.add('load-error')
        const context = canvas.getContext('2d')
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = '#8b3a31'
        context.fillText('波形读取失败：' + error.message, 16, canvas.height / 2)
      })
      return card
    }

    const cards = document.querySelector('#cards')
    cases.forEach((item, index) => cards.append(createCard(item, index)))
    updateSummary()
  </script>
</body>
</html>
`, 'utf8')

console.log(outputPath)
