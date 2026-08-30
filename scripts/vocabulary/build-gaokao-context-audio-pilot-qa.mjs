#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'))
const originalWordMode = process.argv.includes('--original-word-v4')
const pilotDirectory = originalWordMode ? '.scratch/gaokao-audio-original-word-pilot-v4' : '.scratch/gaokao-audio-context-pilot-v3'
const publicAudioDirectory = originalWordMode ? 'original-word-pilot-v4' : 'context-trim-pilot-v3'
const sourceById = new Map(readJson('data/vocabulary/gaokao-frequency-source-ledger-v1.json').entries.map((entry) => [entry.entryId, entry]))
const american = readJson(`${pilotDirectory}/american-manifest.json`)
const british = readJson(`${pilotDirectory}/british-manifest.json`)
const britishById = new Map(british.entries.map((entry) => [entry.entryId, entry]))

const entries = american.entries.map((audio, index) => {
  const source = sourceById.get(audio.entryId)
  const britishAudio = britishById.get(audio.entryId)
  if (!source || !britishAudio) throw new Error(`Missing pilot source ${audio.entryId}`)
  return {
    index: index + 1,
    entryId: audio.entryId,
    headword: audio.headword,
    context: originalWordMode ? `直接输入原词：${audio.text}` : audio.context,
    partOfSpeech: source.observedPartOfSpeech,
    meanings: source.observedSourceMeanings,
    audio: {
      american: `../audio/${publicAudioDirectory}/american/${audio.path}`,
      british: `../audio/${publicAudioDirectory}/british/${britishAudio.path}`,
    },
  }
})

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
const outputPath = path.join(outputDirectory, originalWordMode ? 'original-word-audio-pilot-owner-qa-v4.html' : 'context-trimmed-audio-pilot-owner-qa-v3.html')
const pageTitle = originalWordMode ? '四词完整原词｜读音 V4' : '四词自然语境裁词｜读音 V3'
const heading = originalWordMode ? '四词完整原词 V4' : '四词自然语境裁词 V3'
const subheading = originalWordMode ? '不裁剪、不加 SSML、不加 IPA；完整原词以 Google 默认自然语速生成。' : '只验证新方法，不扩散到 117 词。整句自然生成后，按 Google SSML 时间点裁出目标词。'
const storageKey = originalWordMode ? 'gaokao-original-word-audio-pilot-owner-qa-v4' : 'gaokao-context-trimmed-audio-pilot-owner-qa-v3'
mkdirSync(outputDirectory, { recursive: true })
const escapedEntries = JSON.stringify(entries).replaceAll('<', '\\u003c')

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>${pageTitle}</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#1e1e1c;background:#f6f6f4}*{box-sizing:border-box}body{margin:0}.shell{width:min(880px,100%);margin:auto;padding:24px}h1{margin:0;font-size:28px}.sub{margin:8px 0 20px;color:#686862;line-height:1.6}.progress{font-size:13px;color:#2c6e56;font-weight:700}.card{margin-top:12px;overflow:hidden;border:1px solid #d8d8d2;border-radius:10px;background:#fff;box-shadow:0 2px 8px #0000000b}.word{padding:36px 24px;text-align:center;background:#eaf1ed}.word h2{margin:12px 0;font:700 58px/1 Georgia,serif}.meaning,.context{margin:7px 0;color:#64645f}.context strong{color:#1e4a3a}.qa{padding:28px}.audio,.verdicts,.nav{display:grid;gap:10px}.audio{grid-template-columns:1fr 1fr}.verdicts{grid-template-columns:repeat(4,1fr);margin-top:18px}.nav{grid-template-columns:1fr 1.3fr 1fr;margin-top:18px}button{min-height:50px;border:1px solid #cbcfc9;border-radius:8px;background:#fff;color:#20201e;font:600 15px inherit;cursor:pointer}button:hover{background:#f0f2ef}.audio button{border-color:#9dc8b7;color:#194d38}.playing,.selected[data-value=pass]{background:#2c6e56!important;color:#fff!important}.selected:not([data-value=pass]){background:#c93232!important;color:#fff!important}.status,.keys{text-align:center;color:#686862}.keys{margin:16px 0 0;font-size:12px;line-height:1.8}kbd{border:1px solid currentColor;border-radius:4px;padding:1px 5px;font:600 12px ui-monospace,monospace}@media(max-width:640px){.shell{padding:14px}.word h2{font-size:46px}.verdicts{grid-template-columns:1fr 1fr}.nav{grid-template-columns:1fr 1fr}.nav .primary{grid-column:1/-1;grid-row:1}}
</style></head><body><main class="shell"><h1>${heading}</h1><p class="sub">${subheading}</p><div class="progress" id="summary"></div><section class="card"><div class="word"><span id="position"></span><h2 id="headword"></h2><p class="meaning" id="meaning"></p><p class="context"><strong id="context"></strong></p></div><div class="qa"><div class="audio"><button data-accent="american">播放新美音 <kbd>W</kbd></button><button data-accent="british">播放新英音 <kbd>D</kbd></button></div><div class="verdicts"><button data-value="pass">都对</button><button data-value="american_fail">美音错 <kbd>H</kbd></button><button data-value="british_fail">英音错 <kbd>U</kbd></button><button data-value="both_fail">都错 <kbd>I</kbd></button></div><p class="status" id="status"></p><div class="nav"><button id="previous">上一个 <kbd>⌫</kbd></button><button class="primary" id="saveNext">保存并下一个 <kbd>空格</kbd></button><button id="clear">清空四词记录</button></div><p class="keys">先听这四个：正常就直接按空格；有问题先按 H/U/I，再按空格。</p></div></section></main>
<script>
const entries=${escapedEntries};const key='${storageKey}';const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'{"index":0,"records":{}}')}catch{return{index:0,records:{}}}};const state=read();let playing=null;const $=s=>document.querySelector(s);const stop=()=>{if(playing){playing.pause();playing.currentTime=0;playing=null}document.querySelectorAll('[data-accent]').forEach(b=>b.classList.remove('playing'))};const current=()=>entries[state.index];const persist=()=>localStorage.setItem(key,JSON.stringify(state));const play=accent=>{stop();const button=document.querySelector('[data-accent="'+accent+'"]');button.classList.add('playing');playing=new Audio(current().audio[accent]);playing.onended=stop;playing.onerror=stop;playing.play()};const render=()=>{stop();state.index=Math.max(0,Math.min(entries.length-1,state.index));const e=current(),r=state.records[e.entryId]||{};$('#position').textContent=e.index+' / '+entries.length;$('#headword').textContent=e.headword;$('#meaning').textContent=[e.partOfSpeech,e.meanings.join('；')].filter(Boolean).join(' · ');$('#context').textContent=e.context;document.querySelectorAll('[data-value]').forEach(b=>b.classList.toggle('selected',b.dataset.value===(r.verdict||'')));$('#status').textContent=r.verdict?({pass:'已选：都对',american_fail:'已选：美音错',british_fail:'已选：英音错',both_fail:'已选：都错'}[r.verdict]):'未选错误，保存时默认都对';const done=Object.values(state.records).filter(x=>x.done).length;$('#summary').textContent='已完成 '+done+' / 4 · 当前 '+e.headword;$('#previous').disabled=state.index===0;persist()};const verdict=v=>{state.records[current().entryId]={...(state.records[current().entryId]||{}),verdict:v};render()};const save=()=>{const e=current(),r=state.records[e.entryId]||{};state.records[e.entryId]={verdict:r.verdict||'pass',done:true,reviewedAt:new Date().toISOString()};state.index=Math.min(entries.length-1,state.index+1);render()};document.querySelectorAll('[data-accent]').forEach(b=>b.onclick=()=>play(b.dataset.accent));document.querySelectorAll('[data-value]').forEach(b=>b.onclick=()=>verdict(b.dataset.value));$('#previous').onclick=()=>{state.index--;render()};$('#saveNext').onclick=save;$('#clear').onclick=()=>{if(confirm('清空这四个小样的记录？')){state.index=0;state.records={};render()}};document.addEventListener('keydown',event=>{if(event.repeat||event.metaKey||event.ctrlKey||event.altKey)return;const k=event.key.toLowerCase();if(k==='w'){event.preventDefault();play('american')}else if(k==='d'){event.preventDefault();play('british')}else if(k==='h'){event.preventDefault();verdict('american_fail')}else if(k==='u'){event.preventDefault();verdict('british_fail')}else if(k==='i'){event.preventDefault();verdict('both_fail')}else if(event.key===' '){event.preventDefault();save()}else if(event.key==='Backspace'){event.preventDefault();state.index--;render()}});render();
</script></body></html>`

writeFileSync(outputPath, html)
console.log(`Wrote ${path.relative(root, outputPath)} with ${entries.length} pilot entries`)
