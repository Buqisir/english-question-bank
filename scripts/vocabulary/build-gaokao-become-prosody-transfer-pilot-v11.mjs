#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const entryId = 'gaokao-frequency-0139-become'
const sourceRoot = path.join(root, '.scratch/gaokao-audio-original-word-repair-v5')
const outputRoot = path.join(root, '.scratch/gaokao-audio-prosody-transfer-pilot-v11')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/prosody-transfer-pilot-v11')
const qaPath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/become-prosody-transfer-owner-qa-v11.html')
const americanSourcePath = path.join(sourceRoot, 'american', `${entryId}.mp3`)
const britishReferencePath = path.join(sourceRoot, 'british', `${entryId}.mp3`)
const americanManifest = JSON.parse(await readFile(path.join(sourceRoot, 'american-manifest.json'), 'utf8'))
const britishManifest = JSON.parse(await readFile(path.join(sourceRoot, 'british-manifest.json'), 'utf8'))
const americanSource = americanManifest.entries.find((entry) => entry.entryId === entryId)
const britishReference = britishManifest.entries.find((entry) => entry.entryId === entryId)

if (americanSource?.voice !== 'en-US-Neural2-C' || britishReference?.voice !== 'en-GB-Neural2-D') {
  throw new Error('V11 requires the approved American C source and owner-approved British D reference')
}

const variants = [
  {
    id: 'A',
    label: '自然衔接',
    firstVolume: 0.78,
    firstTempo: 1,
    secondVolume: 1.26,
    secondTempo: 1,
  },
  {
    id: 'B',
    label: '重音更明确',
    firstVolume: 0.68,
    firstTempo: 1.08,
    secondVolume: 1.38,
    secondTempo: 0.95,
  },
]
const split = {
  firstEndSeconds: 0.246,
  secondStartSeconds: 0.291,
  crossfadeSeconds: 0.008,
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const probe = (filePath) => JSON.parse(execFileSync('ffprobe', [
  '-v', 'error', '-select_streams', 'a:0',
  '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration',
  '-of', 'json', filePath,
], { encoding: 'utf8' }))

await Promise.all([
  mkdir(outputRoot, { recursive: true }),
  mkdir(publicRoot, { recursive: true }),
])
const sourceBytes = await readFile(americanSourcePath)
const referenceBytes = await readFile(britishReferencePath)
const manifestEntries = []

for (const variant of variants) {
  const filename = `${entryId}-${variant.id.toLocaleLowerCase()}.mp3`
  const outputPath = path.join(outputRoot, filename)
  const publicPath = path.join(publicRoot, filename)
  const filter = [
    `[0:a]atrim=start=0:end=${split.firstEndSeconds},asetpts=PTS-STARTPTS,volume=${variant.firstVolume},atempo=${variant.firstTempo}[first]`,
    `[0:a]atrim=start=${split.secondStartSeconds},asetpts=PTS-STARTPTS,volume=${variant.secondVolume},atempo=${variant.secondTempo}[second]`,
    `[first][second]acrossfade=d=${split.crossfadeSeconds}:c1=tri:c2=tri,alimiter=limit=0.96:level=false[out]`,
  ].join(';')
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', americanSourcePath,
    '-filter_complex', filter, '-map', '[out]',
    '-ar', '24000', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '48k', outputPath,
  ])
  const bytes = await readFile(outputPath)
  await writeFile(publicPath, bytes)
  const metadata = probe(outputPath)
  const durationSeconds = Number(metadata.format.duration)
  if (metadata.streams?.[0]?.codec_name !== 'mp3'
    || Number(metadata.streams?.[0]?.sample_rate) !== 24_000
    || Number(metadata.streams?.[0]?.channels) !== 1
    || durationSeconds < 0.75
    || durationSeconds > 0.95) {
    throw new Error(`V11 ${variant.id}: implausible output audio`)
  }
  manifestEntries.push({
    variant: variant.id,
    label: variant.label,
    entryId,
    headword: 'become',
    voice: americanSource.voice,
    path: filename,
    bytes: bytes.length,
    sha256: sha256(bytes),
    durationSeconds: Number(durationSeconds.toFixed(3)),
    sourceSha256: sha256(sourceBytes),
    referenceSha256: sha256(referenceBytes),
    strategy: 'owner-approved-cross-accent-prosody-template-manual-edit',
    split,
    firstVolume: variant.firstVolume,
    firstTempo: variant.firstTempo,
    secondVolume: variant.secondVolume,
    secondTempo: variant.secondTempo,
  })
}

await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 'gaokao-frequency-prosody-transfer-pilot-v11',
  status: 'candidate_pending_owner_qa',
  entryId,
  headword: 'become',
  americanVoice: americanSource.voice,
  approvedBritishReferenceVoice: britishReference.voice,
  source: 'gaokao-frequency-original-word-repair-v5',
  variants: manifestEntries,
}, null, 2)}\n`)

const qaHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>become 重音迁移 A/B｜V11</title>
  <style>
    :root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #1e1e1c; background: #f6f6f4; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; }
    main { width: min(760px, 100%); margin: 0 auto; }
    h1 { margin: 0; font-size: 28px; }
    .sub { color: #666; line-height: 1.6; }
    .word { margin: 32px 0; font: 700 64px/1 Georgia, serif; text-align: center; }
    .panel { display: grid; gap: 12px; padding: 24px; border: 1px solid #d8d8d2; border-radius: 10px; background: #fff; }
    .audio { min-height: 58px; border: 1px solid #a5cdbd; border-radius: 8px; background: #fff; color: #123020; font: 600 16px/1.2 inherit; cursor: pointer; }
    .audio.playing { background: #2c6e56; color: #fff; }
    .choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
    .choice { min-height: 50px; border: 1px solid #d8d8d2; border-radius: 8px; background: #fff; cursor: pointer; }
    .choice.selected { border-color: #2c6e56; background: #2c6e56; color: #fff; }
    textarea { width: 100%; min-height: 88px; margin-top: 12px; padding: 12px; border: 1px solid #d8d8d2; border-radius: 8px; font: inherit; }
    .state { min-height: 24px; color: #2c6e56; font-weight: 600; }
    kbd { margin-left: 6px; padding: 2px 6px; border: 1px solid currentColor; border-radius: 4px; }
    @media (max-width: 560px) { body { padding: 16px; } .choices { grid-template-columns: 1fr; } .word { font-size: 52px; } }
  </style>
</head>
<body>
  <main>
    <h1>become 重音迁移 A/B · V11</h1>
    <p class="sub">同一个美音 C 女声。先听你已认可的英音重音参考，再比较两种美音手工迁移；两种都不行就停止这条返修路线。</p>
    <div class="word">become</div>
    <section class="panel">
      <button class="audio" data-audio="../audio/original-word-repair-v5/british/${entryId}.mp3">英音合格参考 <kbd>D</kbd></button>
      <button class="audio" data-audio="../audio/prosody-transfer-pilot-v11/${entryId}-a.mp3">美音 A · 自然衔接 <kbd>A</kbd></button>
      <button class="audio" data-audio="../audio/prosody-transfer-pilot-v11/${entryId}-b.mp3">美音 B · 重音更明确 <kbd>B</kbd></button>
      <div class="choices">
        <button class="choice" data-choice="A">选 A <kbd>1</kbd></button>
        <button class="choice" data-choice="B">选 B <kbd>2</kbd></button>
        <button class="choice" data-choice="none">都不行 <kbd>0</kbd></button>
      </div>
      <textarea aria-label="问题说明" placeholder="可选：哪里仍然不自然"></textarea>
      <p class="state" aria-live="polite"></p>
    </section>
  </main>
  <script>
    const storageKey = 'gaokao-become-prosody-transfer-owner-qa-v11'
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
    const textarea = document.querySelector('textarea')
    const state = document.querySelector('.state')
    let currentAudio = null
    textarea.value = saved.note || ''
    const render = () => {
      document.querySelectorAll('.choice').forEach((button) => button.classList.toggle('selected', button.dataset.choice === saved.choice))
      state.textContent = saved.choice ? (saved.choice === 'none' ? '已记：两种都不行' : '已选：美音 ' + saved.choice) : '尚未选择'
      localStorage.setItem(storageKey, JSON.stringify(saved))
    }
    const play = (button) => {
      if (currentAudio) currentAudio.pause()
      document.querySelectorAll('.audio').forEach((item) => item.classList.remove('playing'))
      button.classList.add('playing')
      currentAudio = new Audio(button.dataset.audio)
      currentAudio.addEventListener('ended', () => button.classList.remove('playing'))
      currentAudio.addEventListener('error', () => button.classList.remove('playing'))
      currentAudio.play()
    }
    document.querySelectorAll('.audio').forEach((button) => button.addEventListener('click', () => play(button)))
    document.querySelectorAll('.choice').forEach((button) => button.addEventListener('click', () => { saved.choice = button.dataset.choice; saved.reviewedAt = new Date().toISOString(); render() }))
    textarea.addEventListener('input', () => { saved.note = textarea.value; localStorage.setItem(storageKey, JSON.stringify(saved)) })
    document.addEventListener('keydown', (event) => {
      if (event.target.closest('textarea, input')) return
      const key = event.key.toLocaleLowerCase()
      const audioByKey = { d: 0, a: 1, b: 2 }
      if (key in audioByKey) { event.preventDefault(); document.querySelectorAll('.audio')[audioByKey[key]].click() }
      if (['0', '1', '2'].includes(key)) { event.preventDefault(); document.querySelectorAll('.choice')[key === '1' ? 0 : key === '2' ? 1 : 2].click() }
    })
    render()
  </script>
</body>
</html>
`

await writeFile(qaPath, qaHtml)

console.log(JSON.stringify({
  entryId,
  variants: manifestEntries.map((entry) => ({ variant: entry.variant, durationSeconds: entry.durationSeconds, sha256: entry.sha256 })),
  qaPath,
}, null, 2))
