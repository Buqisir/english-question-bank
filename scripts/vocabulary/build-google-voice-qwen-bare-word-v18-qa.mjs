#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-bare-word-v18/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-voice-qwen-bare-word-v18' || manifest.entries.length !== 22 || manifest.failures.length !== 0) {
  throw new Error('Expected 22 completed V18 candidates for 11 unresolved cases')
}
const grouped = new Map()
for (const entry of manifest.entries) {
  const key = `${entry.entryId}:${entry.accent}`
  const group = grouped.get(key) ?? {base: entry, candidates: {}}
  group.candidates[entry.candidateLabel] = entry
  grouped.set(key, group)
}
const cases = [...grouped.values()].sort((left, right) => left.base.caseIndex - right.base.caseIndex).map(({base, candidates}) => {
  if (!candidates.D18 || !candidates.R18) throw new Error(`Missing D18/R18 pair: ${base.entryId} ${base.accent}`)
  return {
    id: `${base.entryId}--${base.accent}`,
    entryId: base.entryId,
    headword: base.headword,
    accent: base.accent,
    verifiedIpa: base.verifiedIpa,
    v17OwnerNote: base.v17OwnerNote,
    canonicalText: base.canonicalText,
    bareRepairText: candidates.R18.generatedTargetText,
    sourceUrl: base.sourceUrl,
    google: `/vocabulary-assets/gaokao-frequency-v1/audio/original-word-repair-v5/${base.accent}/${base.entryId}.mp3`,
    c17: base.priorC17PublicPath,
    p17: base.priorP17PublicPath,
    d18: candidates.D18.publicPath,
    r18: candidates.R18.publicPath,
    d18Ratio: candidates.D18.activeToGoogleRatio,
    r18Ratio: candidates.R18.activeToGoogleRatio,
  }
})
if (cases.length !== 11) throw new Error(`Expected 11 grouped V18 cases, received ${cases.length}`)

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-voice-qwen-bare-word-owner-qa-v18.html')
const payload = JSON.stringify(cases).replaceAll('<', '\\u003c')
writeFileSync(outputPath, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>高中 3000 词｜11 条裸词返修 V18</title><style>
:root{font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18202f;background:#f3f0e9}*{box-sizing:border-box}body{margin:0;padding:30px 18px}main{max-width:1080px;margin:auto}h1{font-size:clamp(28px,5vw,44px);margin:0 0 10px}.intro{color:#60656f;line-height:1.65;margin:0 0 20px}.root-cause{margin:0 0 18px;padding:12px 14px;border-radius:12px;background:#fff1df;color:#75491d}.toolbar{position:sticky;top:10px;z-index:2;display:grid;grid-template-columns:1fr auto;gap:10px;padding:12px 14px;border-radius:14px;background:#18202f;color:#fff;box-shadow:0 8px 28px #17203324}.summary{font-weight:750;align-self:center}.search{min-width:220px;padding:9px 11px;border:0;border-radius:9px;font:inherit}.card{margin:15px 0;padding:19px;border:1px solid #ddd7cc;border-radius:18px;background:#fff;box-shadow:0 8px 26px #352f2710}.card.hidden{display:none}.heading{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.heading h2{font-size:29px;margin:0}.meta{color:#706a61;font-size:13px}.badge{display:inline-block;padding:3px 8px;border-radius:999px;background:#e4eee9;color:#28584f;font-size:12px;font-weight:750}.ipa{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:10px}.ipa strong{font-size:21px;color:#173d35}.source{font-size:12px;color:#586f88}.issue{margin:10px 0 0;padding:10px 12px;border-left:4px solid #b98052;background:#fff8f0;color:#71451f}.guide{margin-top:8px;color:#315c55;font-size:14px}.guide code{padding:2px 6px;border-radius:6px;background:#e7efec}.ratio{color:#777;font-size:12px}.players{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:16px 0}.play{border:0;border-radius:12px;padding:13px 7px;font-size:12px;font-weight:750;cursor:pointer;color:#fff}.google{background:#68717d}.c17,.p17{background:#816449}.d18{background:#35685e}.r18{background:#31547a}.status{min-height:20px;color:#315c55;font-size:13px}.choice{display:flex;gap:8px;flex-wrap:wrap}.choice button{padding:10px 13px;border:1px solid #cec7ba;border-radius:10px;background:#faf8f4;cursor:pointer}.choice button.selected{border-color:#315c55;background:#dfece8;color:#173d35}.note{width:100%;min-height:64px;margin-top:10px;padding:10px 12px;border:1px solid #d8d1c6;border-radius:10px;font:inherit}@media(max-width:820px){body{padding:18px 10px}.toolbar{grid-template-columns:1fr}.search{width:100%;min-width:0}.players{grid-template-columns:repeat(2,1fr)}.play{width:100%}}
</style></head><body><main><h1>11 条裸词返修｜V18</h1>
<p class="intro">V17 已保留 3 条可用结果：violin 英音 C17、canteen 美音 P17、downstairs 美音 C17。本页只返修其余 11 条。D18 只生成规范拼写；R18 使用第二裸词修复目标，两版都不再附带提示句。</p>
<p class="root-cause"><strong>这轮修的是根因：</strong>V17 有些目标词没有与提示句形成可靠停顿，截取器只能把整句交出来。V18 直接生成一个裸词，再保护首尾活动音；时长超过同一 Google 单词 1.8 倍的候选不会进入本页。</p>
<div class="toolbar"><div class="summary" id="summary"></div><input class="search" id="search" placeholder="搜索单词、编号或口音"></div><section id="cards"></section></main><script>
const cases=${payload};const key='gaokao-google-voice-qwen-bare-word-owner-qa-v18';const state=JSON.parse(localStorage.getItem(key)||'{}');const accentLabel={american:'美音',british:'英音'};let activeAudio,activeButton,activeLabel;const stopActive=()=>{if(activeAudio){activeAudio.pause();activeAudio.currentTime=0}if(activeButton)activeButton.textContent=activeLabel;activeAudio=activeButton=activeLabel=null};const save=()=>{localStorage.setItem(key,JSON.stringify(state));summary()};const summary=()=>{const done=cases.filter(item=>state[item.id]?.choice).length;document.querySelector('#summary').textContent='已判断 '+done+' / '+cases.length+' 条 · 待判断 '+(cases.length-done)};const cards=document.querySelector('#cards');for(const [index,item] of cases.entries()){const record=state[item.id]||{};const card=document.createElement('article');card.className='card';card.dataset.search=(item.entryId+' '+item.headword+' '+accentLabel[item.accent]).toLowerCase();card.innerHTML='<div class="heading"><span class="meta">#'+String(index+1).padStart(2,'0')+'</span><h2>'+item.headword+'</h2><span>'+accentLabel[item.accent]+'</span><span class="badge">裸词生成</span></div><div class="ipa">核准目标：<strong>'+item.verifiedIpa+'</strong><a class="source" href="'+item.sourceUrl+'" target="_blank" rel="noreferrer">Cambridge 依据</a></div><div class="issue">V17：'+item.v17OwnerNote+'</div><div class="guide">D18：<code>'+item.canonicalText+'</code> · R18：<code>'+item.bareRepairText+'</code> <span class="ratio">（有效时长 / Google：'+item.d18Ratio.toFixed(2)+'× / '+item.r18Ratio.toFixed(2)+'×）</span></div><div class="players"><button class="play google" data-src="'+item.google+'">G · Google</button><button class="play c17" data-src="'+item.c17+'">C17 · 上轮</button><button class="play p17" data-src="'+item.p17+'">P17 · 上轮</button><button class="play d18" data-src="'+item.d18+'">D18 · 裸词</button><button class="play r18" data-src="'+item.r18+'">R18 · 裸修复</button></div><div class="status"></div><div class="choice"><button data-value="d18">D18 可用</button><button data-value="r18">R18 可用</button><button data-value="improved">有改善但都不行</button><button data-value="fail">都不行</button></div><textarea class="note" placeholder="请写：哪一版更好，以及仍存在的元音、重音、词头或词尾问题">'+(record.issue||'')+'</textarea>';card.querySelectorAll('.play').forEach(button=>button.onclick=()=>{stopActive();activeButton=button;activeLabel=button.textContent;button.textContent='正在播放…';activeAudio=new Audio(button.dataset.src);activeAudio.addEventListener('ended',()=>{if(activeButton===button)stopActive()},{once:true});activeAudio.play().catch(error=>{button.textContent='播放失败';card.querySelector('.status').textContent='播放失败：'+error.message;activeAudio=activeButton=activeLabel=null})});card.querySelectorAll('[data-value]').forEach(button=>{button.classList.toggle('selected',record.choice===button.dataset.value);button.onclick=()=>{state[item.id]={...state[item.id],choice:button.dataset.value};save();card.querySelectorAll('[data-value]').forEach(candidate=>candidate.classList.toggle('selected',candidate===button))}});card.querySelector('.note').oninput=event=>{state[item.id]={...state[item.id],issue:event.target.value};save()};cards.append(card)}summary();document.querySelector('#search').oninput=event=>{const query=event.target.value.trim().toLowerCase();document.querySelectorAll('.card').forEach(card=>card.classList.toggle('hidden',query&&!card.dataset.search.includes(query)))};
</script></body></html>`, 'utf8')
console.log(outputPath)
