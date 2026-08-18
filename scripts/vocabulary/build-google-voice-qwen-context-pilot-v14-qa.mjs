#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const v13 = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-full-v13/manifest.json'), 'utf8'))
const v14 = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-context-pilot-v14/manifest.json'), 'utf8'))
if (v14.schemaVersion !== 'gaokao-frequency-google-voice-qwen-context-pilot-v14' || v14.entries.length !== 15 || v14.failures.length !== 0) {
  throw new Error('Expected 15 completed context-first V14 candidates')
}
const oldByKey = new Map(v13.entries.map((entry) => [`${entry.entryId}:${entry.accent}`, entry]))
const cases = v14.entries.slice().sort((left, right) => left.caseIndex - right.caseIndex).map((entry) => {
  const old = oldByKey.get(`${entry.entryId}:${entry.accent}`)
  if (!old) throw new Error(`Missing V13 comparison candidate: ${entry.entryId} ${entry.accent}`)
  return {
    id: `${entry.entryId}--${entry.accent}`,
    entryId: entry.entryId,
    headword: entry.headword,
    accent: entry.accent,
    pronunciation: entry.pronunciation,
    context: `${entry.contextBeforeUsed} … ${entry.headword} … ${entry.contextAfterUsed}`,
    google: `/vocabulary-assets/gaokao-frequency-v1/audio/original-word-repair-v5/${entry.accent}/${entry.entryId}.mp3`,
    oldQwen: old.publicPath,
    contextQwen: entry.publicPath,
  }
})

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, { recursive: true })
const outputPath = path.join(outputDirectory, 'google-voice-qwen-context-pilot-owner-qa-v14.html')
const payload = JSON.stringify(cases).replaceAll('<', '\\u003c')
writeFileSync(outputPath, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>高中 3000 词｜Qwen 上下文重音 V14</title><style>
:root{font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f4f1ea}*{box-sizing:border-box}body{margin:0;padding:30px 18px}main{max-width:980px;margin:auto}h1{font-size:clamp(28px,5vw,44px);margin:0 0 10px}.intro{color:#60656f;line-height:1.65;margin:0 0 22px}.summary{position:sticky;top:10px;z-index:2;padding:12px 15px;border-radius:14px;background:#172033;color:#fff;box-shadow:0 8px 28px #17203324}.card{margin:15px 0;padding:19px;border:1px solid #ded9cf;border-radius:18px;background:#fff;box-shadow:0 8px 26px #352f2710}.heading{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.heading h2{font-size:29px;margin:0}.meta{color:#706a61;font-size:13px}.context{margin-top:8px;color:#315c55;font-size:14px}.players{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:16px 0}.play{border:0;border-radius:12px;padding:13px 10px;font-size:14px;font-weight:750;cursor:pointer;color:#fff}.google{background:#68717d}.old{background:#816449}.contextual{background:#35685e}.status{min-height:20px;color:#315c55;font-size:13px}.choice{display:flex;gap:8px;flex-wrap:wrap}.choice button{padding:10px 13px;border:1px solid #cec7ba;border-radius:10px;background:#faf8f4;cursor:pointer}.choice button.selected{border-color:#315c55;background:#dfece8;color:#173d35}.issue{width:100%;min-height:64px;margin-top:10px;padding:10px 12px;border:1px solid #d8d1c6;border-radius:10px;font:inherit}@media(max-width:680px){body{padding:18px 10px}.players{grid-template-columns:1fr}.play{width:100%}}
</style></head><body><main><h1>上下文重音修复｜V14</h1>
<p class="intro">15 条代表性失败音频。G 是原 Google，Q13 是上一版失败候选，C14 是把目标词放进自然语境、保留停顿后再安全抽出的新候选。仍使用同一 Google 美音女声／英音男声参考，没有使用无效的 instruct，也没有拼接音节。</p>
<div class="summary" id="summary"></div><section id="cards"></section></main><script>
const cases=${payload};const key='gaokao-google-voice-qwen-context-pilot-owner-qa-v14';const state=JSON.parse(localStorage.getItem(key)||'{}');const accentLabel={american:'美音',british:'英音'};let activeAudio;const save=()=>{localStorage.setItem(key,JSON.stringify(state));summary()};const summary=()=>{const done=cases.filter(item=>state[item.id]?.choice).length;document.querySelector('#summary').textContent='已判断 '+done+' / '+cases.length+' 条 · 待判断 '+(cases.length-done)};const cards=document.querySelector('#cards');for(const [index,item] of cases.entries()){const record=state[item.id]||{};const card=document.createElement('article');card.className='card';card.innerHTML='<div class="heading"><span class="meta">#'+String(index+1).padStart(2,'0')+'</span><h2>'+item.headword+'</h2><span>'+accentLabel[item.accent]+' · '+item.pronunciation+'</span></div><div class="context">上下文：'+item.context+'</div><div class="players"><button class="play google" data-src="'+item.google+'">G · Google 原音</button><button class="play old" data-src="'+item.oldQwen+'">Q13 · 上版失败</button><button class="play contextual" data-src="'+item.contextQwen+'">C14 · 上下文新版</button></div><div class="status"></div><div class="choice"><button data-value="usable">C14 可用</button><button data-value="improved">有改善但仍不行</button><button data-value="fail">C14 仍不行</button></div><textarea class="issue" placeholder="请写：重音有没有改善、元音或吞音是否仍有问题">'+(record.issue||'')+'</textarea>';card.querySelectorAll('.play').forEach(button=>button.onclick=()=>{activeAudio?.pause();const label=button.textContent;button.textContent='正在播放…';activeAudio=new Audio(button.dataset.src);activeAudio.addEventListener('ended',()=>{button.textContent=label},{once:true});activeAudio.play().catch(error=>{button.textContent='播放失败';card.querySelector('.status').textContent='播放失败：'+error.message})});card.querySelectorAll('[data-value]').forEach(button=>{button.classList.toggle('selected',record.choice===button.dataset.value);button.onclick=()=>{state[item.id]={...state[item.id],choice:button.dataset.value};save();card.querySelectorAll('[data-value]').forEach(candidate=>candidate.classList.toggle('selected',candidate===button))}});card.querySelector('.issue').oninput=event=>{state[item.id]={...state[item.id],issue:event.target.value};save()};cards.append(card)}summary();
</script></body></html>`, 'utf8')
console.log(outputPath)
