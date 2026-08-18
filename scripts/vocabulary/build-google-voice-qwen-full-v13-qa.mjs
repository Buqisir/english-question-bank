#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-full-v13/manifest.json'), 'utf8'))
const attempted = manifest.entries.length + manifest.failures.length
if (manifest.schemaVersion !== 'gaokao-frequency-google-voice-qwen-full-v13' || manifest.plannedWords !== 117 || manifest.plannedCandidates !== 158 || attempted !== 158) {
  throw new Error('Expected the completed 117-word / 158-pronunciation Google-voice Qwen V13 manifest')
}

const cases = [
  ...manifest.entries.map((entry) => ({
    id: `${entry.entryId}--${entry.accent}`,
    caseIndex: entry.caseIndex,
    entryId: entry.entryId,
    headword: entry.headword,
    accent: entry.accent,
    pronunciation: entry.pronunciation,
    voiceReference: entry.voiceReference,
    generationStatus: 'generated',
    google: `/vocabulary-assets/gaokao-frequency-v1/audio/original-word-repair-v5/${entry.accent}/${entry.entryId}.mp3`,
    qwen: entry.publicPath,
    rms: entry.rms,
    durationSeconds: entry.durationSeconds,
  })),
  ...manifest.failures.map((entry) => ({
    id: `${entry.entryId}--${entry.accent}`,
    caseIndex: entry.caseIndex,
    entryId: entry.entryId,
    headword: entry.headword,
    accent: entry.accent,
    pronunciation: entry.pronunciation,
    voiceReference: entry.voiceReference,
    generationStatus: 'failed',
    generationError: entry.error,
    google: `/vocabulary-assets/gaokao-frequency-v1/audio/original-word-repair-v5/${entry.accent}/${entry.entryId}.mp3`,
  })),
].sort((left, right) => left.caseIndex - right.caseIndex)

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, { recursive: true })
const outputPath = path.join(outputDirectory, 'google-voice-qwen-full-owner-qa-v13.html')
const payload = JSON.stringify(cases).replaceAll('<', '\\u003c')
writeFileSync(outputPath, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>高中 3000 词｜Google 音色喂给千问全量 V13</title><style>
:root{font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f4f1ea}*{box-sizing:border-box}body{margin:0;padding:30px 18px}main{max-width:960px;margin:auto}h1{font-size:clamp(28px,5vw,46px);margin:0 0 10px}.intro{color:#60656f;line-height:1.65;margin:0 0 20px}.toolbar{position:sticky;top:10px;z-index:2;display:grid;grid-template-columns:1fr auto;gap:10px;padding:12px 14px;border-radius:14px;background:#172033;color:#fff;box-shadow:0 8px 28px #17203324}.summary{font-weight:750;align-self:center}.search{min-width:220px;padding:9px 11px;border:0;border-radius:9px;font:inherit}.card{margin:14px 0;padding:18px;border:1px solid #ded9cf;border-radius:18px;background:#fff;box-shadow:0 8px 26px #352f2710}.card.hidden{display:none}.card.failed{border-color:#d6a08a;background:#fff9f5}.heading{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.heading h2{font-size:28px;margin:0}.index,.meta{color:#706a61;font-size:13px}.players{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:15px 0}.play{border:0;border-radius:12px;padding:13px 11px;font-size:15px;font-weight:750;cursor:pointer;color:#fff}.play:disabled{cursor:not-allowed;opacity:.46}.google{background:#68717d}.qwen{background:#35685e}.choice{display:flex;gap:9px;flex-wrap:wrap}.choice button{padding:10px 14px;border:1px solid #cec7ba;border-radius:10px;background:#faf8f4;cursor:pointer}.choice button.selected{border-color:#315c55;background:#dfece8;color:#173d35}.issue{width:100%;min-height:64px;margin-top:10px;padding:10px 12px;border:1px solid #d8d1c6;border-radius:10px;font:inherit}.signal{min-height:20px;color:#315c55;font-size:13px}.error{color:#9a3e23;font-size:13px;line-height:1.45;word-break:break-word}@media(max-width:620px){body{padding:18px 10px}.toolbar{grid-template-columns:1fr}.search{width:100%;min-width:0}.players{grid-template-columns:1fr}.play{width:100%}}
</style></head><body><main><h1>Google 音色喂给千问｜全量 V13</h1>
<p class="intro">覆盖修复计划中的 117 个单词、158 条美英音候选。G 是已判错的 Google 原音；Q 是用同声线合格词作为精确参考后，由 Qwen Base 自然重造的完整单词。这里仍是本机私人候选，不替换正式音频。</p>
<div class="toolbar"><div class="summary" id="summary"></div><input class="search" id="search" placeholder="搜索单词或编号"></div><section id="cards"></section></main><script>
const cases=${payload};const key='gaokao-google-voice-qwen-full-owner-qa-v13';const state=JSON.parse(localStorage.getItem(key)||'{}');const accentLabel={american:'美音',british:'英音'};let activeAudio;
const save=()=>{localStorage.setItem(key,JSON.stringify(state));summary()};const summary=()=>{const done=cases.filter(item=>state[item.id]?.choice).length;const failed=cases.filter(item=>item.generationStatus==='failed').length;document.querySelector('#summary').textContent='已判断 '+done+' / '+cases.length+' 条 · 待判断 '+(cases.length-done)+' · 自动生成失败 '+failed};
const cards=document.querySelector('#cards');for(const item of cases){const record=state[item.id]||{};const card=document.createElement('article');card.className='card'+(item.generationStatus==='failed'?' failed':'');card.dataset.search=(item.entryId+' '+item.headword+' '+accentLabel[item.accent]).toLowerCase();const signal=item.generationStatus==='generated'?'自动音频门通过 · '+item.durationSeconds.toFixed(2)+' 秒 · RMS '+item.rms.toFixed(4):'';const error=item.generationStatus==='failed'?'<div class="error">自动生成失败：'+item.generationError+'</div>':'';card.innerHTML='<div class="heading"><span class="index">#'+String(item.caseIndex+1).padStart(3,'0')+'</span><h2>'+item.headword+'</h2><span>'+accentLabel[item.accent]+' · '+item.pronunciation+'</span></div><div class="meta">参考声线：'+item.voiceReference+'</div><div class="players"><button class="play google" data-src="'+item.google+'">G · Google 原音</button><button class="play qwen" '+(item.qwen?'data-src="'+item.qwen+'"':'disabled')+'>Q · Qwen 重造</button></div><div class="signal">'+signal+'</div>'+error+'<div class="choice"><button data-value="usable">Q 可用</button><button data-value="voice_drift">重音对，但音色不像</button><button data-value="fail">Q 仍不行</button></div><textarea class="issue" placeholder="可写：音色、重音、吞音、多余内容或无声">'+(record.issue||'')+'</textarea>';card.querySelectorAll('.play[data-src]').forEach(button=>button.onclick=()=>{activeAudio?.pause();const label=button.textContent;button.textContent='正在播放…';activeAudio=new Audio(button.dataset.src);activeAudio.addEventListener('ended',()=>{button.textContent=label},{once:true});activeAudio.play().catch(error=>{button.textContent='播放失败';card.querySelector('.signal').textContent='播放失败：'+error.message})});card.querySelectorAll('[data-value]').forEach(button=>{button.classList.toggle('selected',record.choice===button.dataset.value);button.onclick=()=>{state[item.id]={...state[item.id],choice:button.dataset.value};save();card.querySelectorAll('[data-value]').forEach(candidate=>candidate.classList.toggle('selected',candidate===button))}});card.querySelector('.issue').oninput=event=>{state[item.id]={...state[item.id],issue:event.target.value};save()};cards.append(card)}summary();document.querySelector('#search').oninput=event=>{const query=event.target.value.trim().toLowerCase();document.querySelectorAll('.card').forEach(card=>card.classList.toggle('hidden',query&&!card.dataset.search.includes(query)))};
</script></body></html>`, 'utf8')
console.log(outputPath)
