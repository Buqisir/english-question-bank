#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-seed-draw-v22/manifest.json'), 'utf8'))

if (
  manifest.schemaVersion !== 'gaokao-frequency-google-voice-qwen-seed-draw-v22'
  || manifest.entries.length !== 20
  || manifest.failures.length !== 0
  || manifest.formalAssetsChanged !== false
) throw new Error('Expected twenty private V22 seed-draw candidates')

const targets = new Map([
  ['gaokao-frequency-2081-violin', '重音在 LIN，末元音是 /ɪ/'],
  ['gaokao-frequency-1887-hello', '重读 LO'],
  ['gaokao-frequency-2396-ballet', '读作 /bælˈeɪ/，重读 LAY'],
  ['gaokao-frequency-2823-dolphin', '末音节是 /fɪn/，不是 /fən/'],
  ['gaokao-frequency-2952-domain', '重读 MAIN'],
])

const grouped = new Map()
for (const entry of manifest.entries) {
  const group = grouped.get(entry.entryId) ?? {base: entry, candidates: {}}
  group.candidates[entry.candidateLabel] = entry.publicPath
  grouped.set(entry.entryId, group)
}

const labels = ['C22', 'D22', 'E22', 'F22']
const cases = [...grouped.values()].map(({base, candidates}) => {
  if (!labels.every((label) => candidates[label])) throw new Error(`Incomplete V22 draw set: ${base.entryId}`)
  return {
    id: `${base.entryId}--american`,
    entryId: base.entryId,
    headword: base.headword,
    verifiedIpa: base.verifiedIpa,
    target: targets.get(base.entryId),
    candidates,
  }
}).sort((left, right) => left.headword.localeCompare(right.headword))

if (cases.length !== 5 || !cases.every((entry) => entry.target)) throw new Error('Expected the exact five unresolved V22 cases')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-voice-qwen-seed-draw-owner-qa-v22.html')
const payload = JSON.stringify(cases).replaceAll('<', '\\u003c')

writeFileSync(outputPath, `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>高中 3000 词｜5 条抽卡 V22</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1e1e1c;
      background: #f6f6f4;
      --surface: #fff;
      --ink: #1e1e1c;
      --muted: #6a6a64;
      --border: #d8d8d2;
      --green: #2c6e56;
      --green-deep: #1e4a3a;
      --green-soft: #e8f0ec;
      --red: #8b3a31;
      --red-soft: #f8ece9;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; background: #f6f6f4; }
    button, textarea { font: inherit; }
    button:focus-visible, textarea:focus-visible { outline: 3px solid rgba(44, 110, 86, .2); outline-offset: 2px; }
    main { width: min(900px, calc(100% - 32px)); margin: 0 auto; padding: 36px 0 72px; }
    h1 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: -.02em; }
    .intro { margin: 10px 0 20px; color: var(--muted); line-height: 1.6; }
    .summary { position: sticky; top: 8px; z-index: 5; display: flex; justify-content: space-between; gap: 12px; margin-bottom: 16px; padding: 12px 16px; border-radius: 8px; color: #fff; background: var(--green-deep); box-shadow: 0 8px 24px rgba(30, 30, 28, .12); }
    .summary span { font-size: 12px; }
    .card { margin: 16px 0; padding: 20px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
    .title-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    h2 { margin: 0; font-size: 28px; line-height: 1.2; letter-spacing: -.02em; }
    .accent, .ipa, .target, .status { color: var(--muted); font-size: 14px; }
    .ipa { margin: 8px 0 0; }
    .ipa strong { color: var(--ink); font-size: 16px; }
    .target { margin: 10px 0 14px; }
    .target::before { content: "听："; color: var(--ink); font-weight: 700; }
    .players { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .play { min-height: 44px; border: 1px solid var(--green); border-radius: 6px; color: var(--green-deep); background: var(--green-soft); cursor: pointer; font-weight: 700; }
    .play.playing { color: #fff; background: var(--green); }
    .decision { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
    .choice { min-height: 40px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; color: var(--ink); background: #fff; cursor: pointer; }
    .choice.selected { border-color: var(--green); color: var(--green-deep); background: var(--green-soft); font-weight: 700; }
    .choice[data-value="fail"].selected { border-color: var(--red); color: var(--red); background: var(--red-soft); }
    .note { width: 100%; min-height: 44px; margin-top: 12px; padding: 10px 12px; resize: vertical; border: 1px solid var(--border); border-radius: 6px; color: var(--ink); background: #fff; }
    .status { min-height: 20px; margin: 8px 0 0; font-size: 12px; }
    @media (max-width: 620px) {
      main { width: calc(100% - 20px); padding-top: 24px; }
      .summary { align-items: flex-start; flex-direction: column; gap: 5px; }
      .card { padding: 16px; }
      .players { grid-template-columns: repeat(2, 1fr); }
      .decision .choice { flex: 1 1 110px; }
    }
  </style>
</head>
<body>
  <main>
    <h1>剩余 5 个词｜抽卡 V22</h1>
    <p class="intro">equator 已保留 A21。每个词听 C22–F22，选一个可用的；都不行再写一句。</p>
    <div class="summary" id="summary" aria-live="polite"></div>
    <section id="cards" aria-label="V22 抽卡词条"></section>
  </main>
  <script>
    const cases = ${payload}
    const labels = ${JSON.stringify(labels)}
    const storageKey = 'gaokao-google-voice-qwen-seed-draw-owner-qa-v22'
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
      const failed = cases.filter((item) => state[item.id]?.choice === 'fail').length
      document.querySelector('#summary').innerHTML = '<strong>已判断 ' + done + ' / ' + cases.length + ' · 都不行 ' + failed + '</strong><span>结果保存在当前浏览器</span>'
    }
    function createCard(item) {
      const record = state[item.id] || {}
      const card = document.createElement('article')
      card.className = 'card'
      card.dataset.caseId = item.id
      card.innerHTML = \`
        <div class="title-row"><h2></h2><span class="accent">美音</span></div>
        <p class="ipa">音标：<strong></strong></p>
        <div class="target"></div>
        <div class="players"></div>
        <div class="decision"></div>
        <textarea class="note" rows="1" placeholder="都不行时写一句原因（可选）"></textarea>
        <p class="status" aria-live="polite"></p>\`
      card.querySelector('h2').textContent = item.headword
      card.querySelector('.ipa strong').textContent = item.verifiedIpa
      card.querySelector('.target').textContent = item.target
      const players = card.querySelector('.players')
      const decision = card.querySelector('.decision')
      labels.forEach((label) => {
        const play = document.createElement('button')
        play.className = 'play'
        play.type = 'button'
        play.dataset.label = label
        play.textContent = label
        play.addEventListener('click', () => {
          if (activeButton === play) { stopAudio(); return }
          stopAudio()
          activeButton = play
          activeLabel = label
          play.textContent = '停止 ' + label
          play.classList.add('playing')
          activeAudio = new Audio(item.candidates[label])
          activeAudio.addEventListener('ended', stopAudio, {once:true})
          activeAudio.play().catch((error) => { stopAudio(); status.textContent = '播放失败：' + error.message })
        })
        players.append(play)

        const choice = document.createElement('button')
        choice.className = 'choice'
        choice.type = 'button'
        choice.dataset.value = label.toLowerCase()
        choice.textContent = label + ' 可用'
        decision.append(choice)
      })
      const fail = document.createElement('button')
      fail.className = 'choice'
      fail.type = 'button'
      fail.dataset.value = 'fail'
      fail.textContent = '都不行'
      decision.append(fail)

      const note = card.querySelector('.note')
      const status = card.querySelector('.status')
      note.value = record.note || ''
      function updateCard() {
        card.querySelectorAll('.choice').forEach((button) => {
          const selected = button.dataset.value === state[item.id]?.choice
          button.classList.toggle('selected', selected)
          button.setAttribute('aria-pressed', String(selected))
        })
        const choice = state[item.id]?.choice
        status.textContent = choice ? '已记录：' + (choice === 'fail' ? '都不行' : choice.toUpperCase() + ' 可用') : '尚未判断'
      }
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
