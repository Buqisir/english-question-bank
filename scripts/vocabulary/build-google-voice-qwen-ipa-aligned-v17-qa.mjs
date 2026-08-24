#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-ipa-aligned-v17/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-voice-qwen-ipa-aligned-v17' || manifest.entries.length !== 28 || manifest.failures.length !== 0) {
  throw new Error('Expected 28 completed V17 candidates for 14 cases')
}
const grouped = new Map()
for (const entry of manifest.entries) {
  const key = `${entry.entryId}:${entry.accent}`
  const group = grouped.get(key) ?? {base: entry, candidates: {}}
  group.candidates[entry.candidateLabel] = entry
  grouped.set(key, group)
}
const cases = [...grouped.values()].sort((left, right) => left.base.caseIndex - right.base.caseIndex).map(({base, candidates}) => {
  if (!candidates.C17 || !candidates.P17) throw new Error(`Missing C17/P17 pair: ${base.entryId} ${base.accent}`)
  return {
    id: `${base.entryId}--${base.accent}`,
    entryId: base.entryId,
    headword: base.headword,
    accent: base.accent,
    sourceIpa: base.sourceIpa,
    verifiedIpa: base.verifiedIpa,
    ipaChanged: base.sourceIpa !== base.verifiedIpa,
    materialCorrection: base.finding.startsWith('Material correction'),
    finding: base.finding,
    ownerIssue: base.ownerIssue,
    guideText: base.guideText,
    stressSpelling: base.stressSpelling,
    sourceUrl: base.sourceUrl,
    google: `/vocabulary-assets/gaokao-frequency-v1/audio/original-word-repair-v5/${base.accent}/${base.entryId}.mp3`,
    a16: base.priorA16PublicPath,
    b16: base.priorB16PublicPath,
    c17: candidates.C17.publicPath,
    p17: candidates.P17.publicPath,
  }
})
if (cases.length !== 14) throw new Error(`Expected 14 grouped V17 cases, received ${cases.length}`)

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-voice-qwen-ipa-aligned-owner-qa-v17.html')
const payload = JSON.stringify(cases).replaceAll('<', '\\u003c')
writeFileSync(outputPath, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>高中 3000 词｜14 条 IPA 对准返修 V17</title><style>
:root{font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18202f;background:#f3f0e9}*{box-sizing:border-box}body{margin:0;padding:30px 18px}main{max-width:1080px;margin:auto}h1{font-size:clamp(28px,5vw,44px);margin:0 0 10px}.intro{color:#60656f;line-height:1.65;margin:0 0 20px}.toolbar{position:sticky;top:10px;z-index:2;display:grid;grid-template-columns:1fr auto;gap:10px;padding:12px 14px;border-radius:14px;background:#18202f;color:#fff;box-shadow:0 8px 28px #17203324}.summary{font-weight:750;align-self:center}.search{min-width:220px;padding:9px 11px;border:0;border-radius:9px;font:inherit}.card{margin:15px 0;padding:19px;border:1px solid #ddd7cc;border-radius:18px;background:#fff;box-shadow:0 8px 26px #352f2710}.card.hidden{display:none}.heading{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.heading h2{font-size:29px;margin:0}.meta{color:#706a61;font-size:13px}.badge{display:inline-block;padding:3px 8px;border-radius:999px;background:#e4eee9;color:#28584f;font-size:12px;font-weight:750}.badge.corrected{background:#f8e1cf;color:#7e3f18}.ipa{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:10px}.ipa strong{font-size:21px;color:#173d35}.old-ipa{color:#777;text-decoration:line-through}.finding{margin:9px 0 0;color:#5f554b;font-size:14px}.issue{margin:10px 0 0;padding:10px 12px;border-left:4px solid #b98052;background:#fff8f0;color:#71451f}.guide{margin-top:8px;color:#315c55;font-size:14px}.guide code{padding:2px 6px;border-radius:6px;background:#e7efec}.source{font-size:12px;color:#586f88}.players{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:16px 0}.play{border:0;border-radius:12px;padding:13px 7px;font-size:12px;font-weight:750;cursor:pointer;color:#fff}.google{background:#68717d}.a16,.b16{background:#816449}.c17{background:#35685e}.p17{background:#31547a}.status{min-height:20px;color:#315c55;font-size:13px}.choice{display:flex;gap:8px;flex-wrap:wrap}.choice button{padding:10px 13px;border:1px solid #cec7ba;border-radius:10px;background:#faf8f4;cursor:pointer}.choice button.selected{border-color:#315c55;background:#dfece8;color:#173d35}.note{width:100%;min-height:64px;margin-top:10px;padding:10px 12px;border:1px solid #d8d1c6;border-radius:10px;font:inherit}@media(max-width:820px){body{padding:18px 10px}.toolbar{grid-template-columns:1fr}.search{width:100%;min-width:0}.players{grid-template-columns:repeat(2,1fr)}.play{width:100%}}
</style></head><body><main><h1>14 条 IPA 对准返修｜V17</h1>
<p class="intro">本轮先用 Cambridge Dictionary 核准口音、词性、IPA 和主重音，再把 IPA 转成千问能读懂的发音引导。C17 保留规范拼写；P17 直接使用重音拼读。download、dolphin、downstairs 的目标已实质纠正，era 采用 Cambridge 收录且与你判断一致的 EAR-uh 美音变体。所有音频仍是本地私有候选。</p>
<div class="toolbar"><div class="summary" id="summary"></div><input class="search" id="search" placeholder="搜索单词、编号或口音"></div><section id="cards"></section></main><script>
const cases=${payload};const key='gaokao-google-voice-qwen-ipa-aligned-owner-qa-v17';const state=JSON.parse(localStorage.getItem(key)||'{}');const accentLabel={american:'美音',british:'英音'};let activeAudio,activeButton,activeLabel;const stopActive=()=>{if(activeAudio){activeAudio.pause();activeAudio.currentTime=0}if(activeButton)activeButton.textContent=activeLabel;activeAudio=activeButton=activeLabel=null};const save=()=>{localStorage.setItem(key,JSON.stringify(state));summary()};const summary=()=>{const done=cases.filter(item=>state[item.id]?.choice).length;document.querySelector('#summary').textContent='已判断 '+done+' / '+cases.length+' 条 · 待判断 '+(cases.length-done)};const cards=document.querySelector('#cards');for(const [index,item] of cases.entries()){const record=state[item.id]||{};const card=document.createElement('article');card.className='card';card.dataset.search=(item.entryId+' '+item.headword+' '+accentLabel[item.accent]).toLowerCase();card.innerHTML='<div class="heading"><span class="meta">#'+String(index+1).padStart(2,'0')+'</span><h2>'+item.headword+'</h2><span>'+accentLabel[item.accent]+'</span>'+(item.materialCorrection?'<span class="badge corrected">目标音标已纠正</span>':'<span class="badge">IPA 已核准</span>')+'</div><div class="ipa">核准目标：<strong>'+item.verifiedIpa+'</strong>'+(item.ipaChanged?'<span class="old-ipa">原目标 '+item.sourceIpa+'</span>':'')+'<a class="source" href="'+item.sourceUrl+'" target="_blank" rel="noreferrer">Cambridge 依据</a></div><div class="finding">'+item.finding+'</div><div class="issue">上一轮：'+item.ownerIssue+'</div><div class="guide">发音引导：<code>'+item.guideText+'</code> · 拼读目标：<code>'+item.stressSpelling+'</code></div><div class="players"><button class="play google" data-src="'+item.google+'">G · Google</button><button class="play a16" data-src="'+item.a16+'">A16 · 失败</button><button class="play b16" data-src="'+item.b16+'">B16 · 失败</button><button class="play c17" data-src="'+item.c17+'">C17 · 规范拼写</button><button class="play p17" data-src="'+item.p17+'">P17 · 重音拼读</button></div><div class="status"></div><div class="choice"><button data-value="c17">C17 可用</button><button data-value="p17">P17 可用</button><button data-value="improved">有改善但都不行</button><button data-value="fail">都不行</button></div><textarea class="note" placeholder="请写：哪一版更好，以及仍存在的元音、重音、词头或词尾问题">'+(record.issue||'')+'</textarea>';card.querySelectorAll('.play').forEach(button=>button.onclick=()=>{stopActive();activeButton=button;activeLabel=button.textContent;button.textContent='正在播放…';activeAudio=new Audio(button.dataset.src);activeAudio.addEventListener('ended',()=>{if(activeButton===button)stopActive()},{once:true});activeAudio.play().catch(error=>{button.textContent='播放失败';card.querySelector('.status').textContent='播放失败：'+error.message;activeAudio=activeButton=activeLabel=null})});card.querySelectorAll('[data-value]').forEach(button=>{button.classList.toggle('selected',record.choice===button.dataset.value);button.onclick=()=>{state[item.id]={...state[item.id],choice:button.dataset.value};save();card.querySelectorAll('[data-value]').forEach(candidate=>candidate.classList.toggle('selected',candidate===button))}});card.querySelector('.note').oninput=event=>{state[item.id]={...state[item.id],issue:event.target.value};save()};cards.append(card)}summary();document.querySelector('#search').oninput=event=>{const query=event.target.value.trim().toLowerCase();document.querySelectorAll('.card').forEach(card=>card.classList.toggle('hidden',query&&!card.dataset.search.includes(query)))};
</script></body></html>`, 'utf8')
console.log(outputPath)
