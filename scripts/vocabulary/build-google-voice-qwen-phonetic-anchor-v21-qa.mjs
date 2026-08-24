#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const v21 = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-phonetic-anchor-v21/manifest.json'), 'utf8'))

if (
  v21.schemaVersion !== 'gaokao-frequency-google-voice-qwen-phonetic-anchor-v21'
  || v21.entries.length !== 12
  || v21.failures.length !== 0
  || v21.formalAssetsChanged !== false
) throw new Error('Expected twelve private V21 phonetic-anchor candidates')

const latestTargets = new Map([
  ['gaokao-frequency-2081-violin', 'vio 要对；主重音在 LIN，末元音是 /ɪ/'],
  ['gaokao-frequency-1887-hello', '主重音放在 LO'],
  ['gaokao-frequency-2396-ballet', '主重音放在 LAY'],
  ['gaokao-frequency-2823-dolphin', '末音节是 /fɪn/，不是 /fən/'],
  ['gaokao-frequency-2952-domain', 'MAIN 要明显重读'],
  ['gaokao-frequency-2956-equator', '开头要有 /ɪ/，KWAY 重读，而且必须是独立完整单词'],
])
const grouped = new Map()
for (const entry of v21.entries) {
  const key = `${entry.entryId}:${entry.accent}`
  const group = grouped.get(key) ?? {base: entry, candidates: {}}
  group.candidates[entry.candidateLabel] = entry
  grouped.set(key, group)
}

const cases = [...grouped.entries()].map(([key, {base, candidates}]) => {
  if (!candidates.A21 || !candidates.B21) throw new Error(`Incomplete V21 comparison set: ${key}`)
  return {
    id: key.replace(':', '--'),
    entryId: base.entryId,
    headword: base.headword,
    accent: base.accent,
    verifiedIpa: base.verifiedIpa,
    target: latestTargets.get(base.entryId),
    google: `/vocabulary-assets/gaokao-frequency-v1/audio/original-word-repair-v5/american/${base.entryId}.mp3`,
    a21: candidates.A21.publicPath,
    b21: candidates.B21.publicPath,
  }
}).sort((left, right) => left.headword.localeCompare(right.headword))

if (cases.length !== 6 || !cases.every((entry) => entry.target)) throw new Error('Expected the exact six V21 Owner repair cases')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-voice-qwen-phonetic-anchor-owner-qa-v21.html')
const payload = JSON.stringify(cases).replaceAll('<', '\\u003c')

writeFileSync(outputPath, `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>高中 3000 词｜6 条近音锚点复修 V21</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1e1e1c;
      background: #f6f6f4;
      --surface: #ffffff;
      --surface-2: #ededeb;
      --ink: #1e1e1c;
      --muted: #6a6a64;
      --border: #d8d8d2;
      --teal: #2c6e56;
      --teal-deep: #1e4a3a;
      --teal-soft: #e8f0ec;
      --danger: #8b3a31;
      --danger-soft: #f8ece9;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; background: #f6f6f4; }
    button, textarea { font: inherit; }
    button:focus-visible, textarea:focus-visible { outline: 3px solid rgba(44, 110, 86, .2); outline-offset: 2px; }
    main { width: min(960px, calc(100% - 32px)); margin: 0 auto; padding: 40px 0 72px; }
    h1 { max-width: 720px; margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: -.02em; }
    .intro { max-width: 74ch; margin: 12px 0 24px; color: var(--muted); font-size: 16px; line-height: 1.6; }
    .summary { position: sticky; top: 8px; z-index: 8; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 52px; margin-bottom: 16px; padding: 12px 16px; border-radius: 8px; color: #fff; background: var(--teal-deep); box-shadow: 0 8px 24px rgba(30, 30, 28, .12); }
    .summary strong { font-size: 14px; }
    .summary span { color: #fff; font-size: 12px; }
    .card { margin: 16px 0; padding: 20px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
    .card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .title-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    h2 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: -.02em; }
    .accent { color: var(--muted); font-size: 14px; }
    .ipa { margin: 8px 0 0; color: var(--muted); font-size: 14px; }
    .ipa strong { color: var(--ink); font-size: 16px; }
    .target { margin: 12px 0 14px; color: var(--muted); font-size: 14px; line-height: 1.5; }
    .target::before { content: "听："; color: var(--ink); font-weight: 700; }
    .players { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .play { min-height: 44px; padding: 8px; border: 1px solid var(--border); border-radius: 6px; color: var(--ink); background: #fff; cursor: pointer; font-size: 14px; font-weight: 650; transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease; }
    .play:hover { border-color: var(--muted); background: var(--surface-2); }
    .play.new { border-color: var(--teal); color: var(--teal-deep); background: var(--teal-soft); }
    .play.playing { border-color: var(--teal); color: #fff; background: var(--teal); }
    .decision { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
    .choice { min-height: 40px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 6px; color: var(--ink); background: #fff; cursor: pointer; font-size: 14px; }
    .choice.selected { border-color: var(--teal); color: var(--teal-deep); background: var(--teal-soft); font-weight: 700; }
    .choice[data-value="fail"].selected { border-color: var(--danger); color: var(--danger); background: var(--danger-soft); }
    .note { width: 100%; min-height: 44px; margin-top: 12px; padding: 10px 12px; resize: vertical; border: 1px solid var(--border); border-radius: 6px; color: var(--ink); background: #fff; font-size: 14px; line-height: 1.5; }
    .note::placeholder { color: #6a6a64; }
    .status { min-height: 20px; margin: 8px 0 0; color: var(--muted); font-size: 12px; }
    @media (max-width: 720px) {
      main { width: min(100% - 20px, 960px); padding-top: 24px; }
      .summary { align-items: flex-start; flex-direction: column; gap: 6px; }
      .card { padding: 16px; }
      .players { grid-template-columns: repeat(3, 1fr); }
      .decision .choice { flex: 1 1 140px; }
    }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  </style>
</head>
<body>
  <!--
  THESIS: Make six stubborn pronunciation judgments fast with only Google, A21, and B21.
  OWN-WORLD: Neutral workbench surfaces, compact controls, and restrained ink-green signatures.
  STORY: Listen to three clips in order, then choose A21, B21, or neither.
  FIRST VIEWPORT: A short task heading, sticky progress, and the first comparison card.
  FORM: A narrow extension of the established Owner audio-QA workbench; Operate mode; seed v21-phonetic-anchor-operate-01.
  -->
  <main>
    <h1>剩余 6 个词｜V21</h1>
    <p class="intro">每个词依次听 Google、A21、B21，然后选一个可用的；都不行时可写一句问题。</p>
    <div class="summary" id="summary" aria-live="polite"></div>
    <section id="cards" aria-label="V21 待判断词条"></section>
  </main>
  <script>
    const cases = ${payload}
    const storageKey = 'gaokao-google-voice-qwen-phonetic-anchor-owner-qa-v21'
    const state = JSON.parse(localStorage.getItem(storageKey) || '{}')
    let activeAudio = null
    let activeButton = null
    let activeLabel = ''

    function stopAudio() {
      if (activeAudio) { activeAudio.pause(); activeAudio.currentTime = 0 }
      if (activeButton) { activeButton.textContent = activeLabel; activeButton.classList.remove('playing') }
      activeAudio = null; activeButton = null; activeLabel = ''
    }
    function save() { localStorage.setItem(storageKey, JSON.stringify(state)); updateSummary() }
    function updateSummary() {
      const done = cases.filter((item) => state[item.id]?.choice).length
      const a21 = cases.filter((item) => state[item.id]?.choice === 'a21').length
      const b21 = cases.filter((item) => state[item.id]?.choice === 'b21').length
      const failed = cases.filter((item) => state[item.id]?.choice === 'fail').length
      document.querySelector('#summary').innerHTML = '<strong>已判断 ' + done + ' / ' + cases.length + ' · A21 ' + a21 + ' · B21 ' + b21 + ' · 都不行 ' + failed + '</strong><span>判断与备注保存在当前浏览器</span>'
    }
    function createCard(item) {
      const record = state[item.id] || {}
      const card = document.createElement('article')
      card.className = 'card'
      card.dataset.caseId = item.id
      card.dataset.choice = record.choice || ''
      card.innerHTML = \`
        <header class="card-head"><div><div class="title-row"><h2></h2><span class="accent">美音</span></div><p class="ipa">音标：<strong></strong></p></div></header>
        <div class="target"></div>
        <div class="players">
          <button class="play" type="button" data-source="google" data-label="Google">Google</button>
          <button class="play new" type="button" data-source="a21" data-label="A21">A21</button>
          <button class="play new" type="button" data-source="b21" data-label="B21">B21</button>
        </div>
        <div class="decision"><button class="choice" type="button" data-value="a21">A21 可用</button><button class="choice" type="button" data-value="b21">B21 可用</button><button class="choice" type="button" data-value="fail">都不行</button></div>
        <textarea class="note" rows="1" placeholder="都不行时写一句原因（可选）"></textarea>
        <p class="status" aria-live="polite"></p>\`
      card.querySelector('h2').textContent = item.headword
      card.querySelector('.ipa strong').textContent = item.verifiedIpa
      card.querySelector('.target').textContent = item.target
      const note = card.querySelector('.note')
      note.value = record.note || ''
      const status = card.querySelector('.status')
      function updateCard() {
        card.dataset.choice = state[item.id]?.choice || ''
        card.querySelectorAll('.choice').forEach((button) => {
          const selected = button.dataset.value === state[item.id]?.choice
          button.classList.toggle('selected', selected)
          button.setAttribute('aria-pressed', String(selected))
        })
        status.textContent = state[item.id]?.choice ? '已记录：' + ({a21:'A21 可用', b21:'B21 可用', fail:'都不行'}[state[item.id].choice]) : '尚未判断'
      }
      card.querySelectorAll('.play').forEach((button) => button.addEventListener('click', () => {
        if (activeButton === button) { stopAudio(); return }
        stopAudio()
        activeButton = button
        activeLabel = button.textContent
        button.textContent = '停止 ' + button.dataset.label
        button.classList.add('playing')
        activeAudio = new Audio(item[button.dataset.source])
        activeAudio.addEventListener('ended', stopAudio, {once:true})
        activeAudio.play().catch((error) => { stopAudio(); status.textContent = '播放失败：' + error.message })
      }))
      card.querySelectorAll('.choice').forEach((button) => button.addEventListener('click', () => {
        const choice = state[item.id]?.choice === button.dataset.value ? '' : button.dataset.value
        state[item.id] = {...state[item.id], choice, note: note.value}
        save(); updateCard()
      }))
      note.addEventListener('input', () => { state[item.id] = {...state[item.id], note: note.value}; save() })
      updateCard()
      return card
    }
    const cards = document.querySelector('#cards')
    cases.forEach((item) => cards.append(createCard(item)))
    updateSummary()
  </script>
</body>
</html>
`, 'utf8')

console.log(outputPath)
