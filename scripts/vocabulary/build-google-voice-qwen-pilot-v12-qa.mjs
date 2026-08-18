#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-pilot-v12/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-voice-qwen-pilot-v12' || manifest.entries.length !== 5) {
  throw new Error('Expected the five-candidate Google-voice Qwen V12 manifest')
}
const cases = manifest.entries.map((entry) => ({
  id: `${entry.entryId}--${entry.accent}`,
  entryId: entry.entryId,
  headword: entry.headword,
  accent: entry.accent,
  pronunciation: entry.pronunciation,
  voiceReference: entry.voiceReference,
  google: `/vocabulary-assets/gaokao-frequency-v1/audio/original-word-repair-v5/${entry.accent}/${entry.entryId}.mp3`,
  qwen: entry.publicPath,
}))

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, { recursive: true })
const outputPath = path.join(outputDirectory, 'google-voice-qwen-stress-pilot-owner-qa-v12.html')
const payload = JSON.stringify(cases).replaceAll('<', '\\u003c')
writeFileSync(outputPath, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>高中 3000 词｜Google 音色喂给千问 V12</title><style>
:root{font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f4f1ea}*{box-sizing:border-box}body{margin:0;padding:30px 18px}main{max-width:960px;margin:auto}h1{font-size:clamp(28px,5vw,46px);margin:0 0 10px}.intro{color:#60656f;line-height:1.65;margin:0 0 24px}.summary{position:sticky;top:12px;z-index:2;padding:12px 16px;border-radius:14px;background:#172033;color:#fff;box-shadow:0 8px 28px #17203324}.card{margin:16px 0;padding:20px;border:1px solid #ded9cf;border-radius:18px;background:#fff;box-shadow:0 8px 26px #352f2710}.heading{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.heading h2{font-size:30px;margin:0}.meta{color:#706a61;font-size:13px}.players{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:18px 0}.play{border:0;border-radius:12px;padding:14px 12px;font-size:15px;font-weight:750;cursor:pointer;color:#fff}.google{background:#68717d}.natural{background:#35685e}.stressed{background:#8c5637}.choice{display:flex;gap:9px;flex-wrap:wrap}.choice button{padding:10px 14px;border:1px solid #cec7ba;border-radius:10px;background:#faf8f4;cursor:pointer}.choice button.selected{border-color:#315c55;background:#dfece8;color:#173d35}.issue{width:100%;min-height:70px;margin-top:11px;padding:10px 12px;border:1px solid #d8d1c6;border-radius:10px;font:inherit}@media(max-width:620px){body{padding:20px 12px}.players{grid-template-columns:1fr}.play{width:100%}}
</style></head><body><main><h1>Google 音色喂给千问 V12</h1>
<p class="intro">每组比较：G 是你已判错的 Google 原音；Q 是从同一 Google 声线的合格词构建参考后，由 Qwen Base 重新生成的完整单词。当前 Base 音色克隆链路不支持 instruct，因此没有伪造“指令控重音”版本。这里只做本机私人小样，不替换正式音频。</p>
<div class="summary" id="summary"></div><section id="cards"></section></main><script>
const cases=${payload};const key='gaokao-google-voice-qwen-stress-pilot-owner-qa-v12';const state=JSON.parse(localStorage.getItem(key)||'{}');const accentLabel={american:'美音',british:'英音'};
const save=()=>{localStorage.setItem(key,JSON.stringify(state));summary()};const summary=()=>{const done=Object.values(state).filter(v=>v.choice).length;document.querySelector('#summary').textContent='已判断 '+done+' / '+cases.length+' 组 · 待判断 '+(cases.length-done)};
const cards=document.querySelector('#cards');for(const item of cases){const record=state[item.id]||{};const card=document.createElement('article');card.className='card';card.innerHTML='<div class="heading"><h2>'+item.headword+'</h2><span>'+accentLabel[item.accent]+' · '+item.pronunciation+'</span></div><div class="meta">参考声线：'+item.voiceReference+'</div><div class="players"><button class="play google" data-src="'+item.google+'">G · Google 原音</button><button class="play natural" data-src="'+item.qwen+'">Q · Qwen 重造</button></div><div class="choice"><button data-value="usable">Q 可用</button><button data-value="voice_drift">重音对，但音色不像</button><button data-value="fail">Q 仍不行</button></div><textarea class="issue" placeholder="可写：音色像不像、重音是否正确、有没有吞音或多余内容">'+(record.issue||'')+'</textarea>';let activeAudio;card.querySelectorAll('.play').forEach(button=>button.onclick=()=>{activeAudio?.pause();activeAudio=new Audio(button.dataset.src);activeAudio.play()});card.querySelectorAll('[data-value]').forEach(button=>{button.classList.toggle('selected',record.choice===button.dataset.value);button.onclick=()=>{state[item.id]={...state[item.id],choice:button.dataset.value};save();card.querySelectorAll('[data-value]').forEach(candidate=>candidate.classList.toggle('selected',candidate===button))}});card.querySelector('.issue').oninput=(event)=>{state[item.id]={...state[item.id],issue:event.target.value};save()};cards.append(card)}summary();
</script></body></html>`)
console.log(outputPath)
