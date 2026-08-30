#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-recovery-v16/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-voice-qwen-recovery-v16' || manifest.entries.length !== 62 || manifest.failures.length !== 0) {
  throw new Error('Expected 62 completed V16 candidates for 31 cases')
}
const grouped = new Map()
for (const entry of manifest.entries) {
  const key = `${entry.entryId}:${entry.accent}`
  const group = grouped.get(key) ?? {base: entry, candidates: {}}
  group.candidates[entry.candidateLabel] = entry
  grouped.set(key, group)
}
const cases = [...grouped.values()].sort((left, right) => left.base.caseIndex - right.base.caseIndex).map(({base, candidates}) => {
  if (!candidates.A16 || !candidates.B16) throw new Error(`Missing A16/B16 pair: ${base.entryId} ${base.accent}`)
  return {
    id: `${base.entryId}--${base.accent}`,
    entryId: base.entryId,
    headword: base.headword,
    accent: base.accent,
    pronunciation: base.pronunciation,
    sourceVersion: base.sourceVersion,
    issueClass: base.issueClass,
    ownerIssue: base.ownerIssue || '上一轮判定不通过，未写具体备注。',
    exampleText: base.exampleText,
    google: `/vocabulary-assets/gaokao-frequency-v1/audio/original-word-repair-v5/${base.accent}/${base.entryId}.mp3`,
    prior: base.priorPublicPath,
    a16: candidates.A16.publicPath,
    b16: candidates.B16.publicPath,
  }
})
if (cases.length !== 31) throw new Error(`Expected 31 grouped V16 cases, received ${cases.length}`)

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-voice-qwen-recovery-owner-qa-v16.html')
const payload = JSON.stringify(cases).replaceAll('<', '\\u003c')
writeFileSync(outputPath, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>高中 3000 词｜31 条统一返修 V16</title><style>
:root{font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18202f;background:#f3f0e9}*{box-sizing:border-box}body{margin:0;padding:30px 18px}main{max-width:1020px;margin:auto}h1{font-size:clamp(28px,5vw,44px);margin:0 0 10px}.intro{color:#60656f;line-height:1.65;margin:0 0 20px}.toolbar{position:sticky;top:10px;z-index:2;display:grid;grid-template-columns:1fr auto;gap:10px;padding:12px 14px;border-radius:14px;background:#18202f;color:#fff;box-shadow:0 8px 28px #17203324}.summary{font-weight:750;align-self:center}.search{min-width:220px;padding:9px 11px;border:0;border-radius:9px;font:inherit}.card{margin:15px 0;padding:19px;border:1px solid #ddd7cc;border-radius:18px;background:#fff;box-shadow:0 8px 26px #352f2710}.card.hidden{display:none}.heading{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.heading h2{font-size:29px;margin:0}.meta{color:#706a61;font-size:13px}.badge{display:inline-block;padding:3px 8px;border-radius:999px;background:#e4eee9;color:#28584f;font-size:12px;font-weight:750}.badge.boundary{background:#f8e8d9;color:#75441f}.issue{margin:10px 0 0;padding:10px 12px;border-left:4px solid #b98052;background:#fff8f0;color:#71451f}.example{margin-top:8px;color:#315c55;font-size:14px}.players{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.play{border:0;border-radius:12px;padding:13px 8px;font-size:13px;font-weight:750;cursor:pointer;color:#fff}.google{background:#68717d}.prior{background:#816449}.a16{background:#35685e}.b16{background:#31547a}.status{min-height:20px;color:#315c55;font-size:13px}.choice{display:flex;gap:8px;flex-wrap:wrap}.choice button{padding:10px 13px;border:1px solid #cec7ba;border-radius:10px;background:#faf8f4;cursor:pointer}.choice button.selected{border-color:#315c55;background:#dfece8;color:#173d35}.note{width:100%;min-height:64px;margin-top:10px;padding:10px 12px;border:1px solid #d8d1c6;border-radius:10px;font:inherit}@media(max-width:760px){body{padding:18px 10px}.toolbar{grid-template-columns:1fr}.search{width:100%;min-width:0}.players{grid-template-columns:repeat(2,1fr)}.play{width:100%}}
</style></head><body><main><h1>31 条统一返修｜V16</h1>
<p class="intro">这次是真正的剩余全量：V14 的 6 条失败 + C15 的 25 条失败，包含 violin 美音和英音。A16/B16 都先用完整自然例句建立词性和重音语境，再从两个保护停顿之间取出完整目标词，并额外保护词头词尾。G 是 Google 原音，上一版是 V14 或 C15 的失败候选。</p>
<div class="toolbar"><div class="summary" id="summary"></div><input class="search" id="search" placeholder="搜索单词、编号或口音"></div><section id="cards"></section></main><script>
const cases=${payload};const key='gaokao-google-voice-qwen-recovery-owner-qa-v16';const state=JSON.parse(localStorage.getItem(key)||'{}');const accentLabel={american:'美音',british:'英音'};const issueLabel={boundary:'完整边界修复',pronunciation_or_stress:'发音 / 重音探索'};let activeAudio,activeButton,activeLabel;const stopActive=()=>{if(activeAudio){activeAudio.pause();activeAudio.currentTime=0}if(activeButton)activeButton.textContent=activeLabel;activeAudio=activeButton=activeLabel=null};const save=()=>{localStorage.setItem(key,JSON.stringify(state));summary()};const summary=()=>{const done=cases.filter(item=>state[item.id]?.choice).length;document.querySelector('#summary').textContent='已判断 '+done+' / '+cases.length+' 条 · 待判断 '+(cases.length-done)};const cards=document.querySelector('#cards');for(const [index,item] of cases.entries()){const record=state[item.id]||{};const card=document.createElement('article');card.className='card';card.dataset.search=(item.entryId+' '+item.headword+' '+accentLabel[item.accent]).toLowerCase();card.innerHTML='<div class="heading"><span class="meta">#'+String(index+1).padStart(2,'0')+'</span><h2>'+item.headword+'</h2><span>'+accentLabel[item.accent]+' · '+item.pronunciation+'</span><span class="badge '+(item.issueClass==='boundary'?'boundary':'')+'">'+issueLabel[item.issueClass]+'</span><span class="badge">来自 '+item.sourceVersion+'</span></div><div class="issue">上一轮：'+item.ownerIssue+'</div><div class="example">例句：'+item.exampleText+'</div><div class="players"><button class="play google" data-src="'+item.google+'">G · Google</button><button class="play prior" data-src="'+item.prior+'">上一版失败</button><button class="play a16" data-src="'+item.a16+'">A16 · 新候选</button><button class="play b16" data-src="'+item.b16+'">B16 · 新候选</button></div><div class="status"></div><div class="choice"><button data-value="a16">A16 可用</button><button data-value="b16">B16 可用</button><button data-value="improved">有改善但都不行</button><button data-value="fail">都不行</button></div><textarea class="note" placeholder="请写：哪一版更好，以及仍存在的重音、元音、词头或词尾问题">'+(record.issue||'')+'</textarea>';card.querySelectorAll('.play').forEach(button=>button.onclick=()=>{stopActive();activeButton=button;activeLabel=button.textContent;button.textContent='正在播放…';activeAudio=new Audio(button.dataset.src);activeAudio.addEventListener('ended',()=>{if(activeButton===button)stopActive()},{once:true});activeAudio.play().catch(error=>{button.textContent='播放失败';card.querySelector('.status').textContent='播放失败：'+error.message;activeAudio=activeButton=activeLabel=null})});card.querySelectorAll('[data-value]').forEach(button=>{button.classList.toggle('selected',record.choice===button.dataset.value);button.onclick=()=>{state[item.id]={...state[item.id],choice:button.dataset.value};save();card.querySelectorAll('[data-value]').forEach(candidate=>candidate.classList.toggle('selected',candidate===button))}});card.querySelector('.note').oninput=event=>{state[item.id]={...state[item.id],issue:event.target.value};save()};cards.append(card)}summary();document.querySelector('#search').oninput=event=>{const query=event.target.value.trim().toLowerCase();document.querySelectorAll('.card').forEach(card=>card.classList.toggle('hidden',query&&!card.dataset.search.includes(query)))};
</script></body></html>`, 'utf8')
console.log(outputPath)
