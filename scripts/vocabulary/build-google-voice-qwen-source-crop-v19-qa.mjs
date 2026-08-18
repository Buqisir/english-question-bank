#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-source-crop-v19/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-voice-qwen-source-crop-v19' || manifest.entries.length !== 4 || manifest.failures.length !== 0) {
  throw new Error('Expected four completed V19 crop candidates for two cases')
}
const grouped = new Map()
for (const entry of manifest.entries) {
  const key = `${entry.entryId}:${entry.accent}`
  const group = grouped.get(key) ?? {base: entry, candidates: {}}
  group.candidates[entry.candidateLabel] = entry
  grouped.set(key, group)
}
const cases = [...grouped.values()].map(({base, candidates}) => {
  if (!candidates.A19 || !candidates.B19) throw new Error(`Missing A19/B19 pair: ${base.entryId} ${base.accent}`)
  return {
    id: `${base.entryId}--${base.accent}`,
    entryId: base.entryId,
    headword: base.headword,
    accent: base.accent,
    verifiedIpa: base.verifiedIpa,
    sourceLabel: base.sourceLabel,
    ownerSourceJudgment: base.ownerSourceJudgment,
    google: `/vocabulary-assets/gaokao-frequency-v1/audio/original-word-repair-v5/${base.accent}/${base.entryId}.mp3`,
    source: base.sourcePublicPath,
    a19: candidates.A19.publicPath,
    b19: candidates.B19.publicPath,
    a19Window: `${candidates.A19.startSeconds.toFixed(2)}–${candidates.A19.endSeconds.toFixed(2)}s`,
    b19Window: `${candidates.B19.startSeconds.toFixed(2)}–${candidates.B19.endSeconds.toFixed(2)}s`,
    a19Ratio: candidates.A19.activeToGoogleRatio,
    b19Ratio: candidates.B19.activeToGoogleRatio,
  }
}).sort((left, right) => left.headword.localeCompare(right.headword))
if (cases.length !== 2) throw new Error(`Expected two grouped V19 cases, received ${cases.length}`)

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-voice-qwen-source-crop-owner-qa-v19.html')
const payload = JSON.stringify(cases).replaceAll('<', '\\u003c')
writeFileSync(outputPath, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>高中 3000 词｜2 条源音精确裁切 V19</title><style>
:root{font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18202f;background:#f3f0e9}*{box-sizing:border-box}body{margin:0;padding:30px 18px}main{max-width:900px;margin:auto}h1{font-size:clamp(28px,5vw,42px);margin:0 0 10px}.intro{color:#60656f;line-height:1.65;margin:0 0 18px}.summary{position:sticky;top:10px;z-index:2;padding:12px 14px;border-radius:14px;background:#18202f;color:#fff;font-weight:750;box-shadow:0 8px 28px #17203324}.card{margin:15px 0;padding:20px;border:1px solid #ddd7cc;border-radius:18px;background:#fff;box-shadow:0 8px 26px #352f2710}.heading{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.heading h2{font-size:30px;margin:0}.badge{display:inline-block;padding:3px 8px;border-radius:999px;background:#e4eee9;color:#28584f;font-size:12px;font-weight:750}.ipa{margin-top:10px}.ipa strong{font-size:21px;color:#173d35}.issue{margin:10px 0;padding:10px 12px;border-left:4px solid #b98052;background:#fff8f0;color:#71451f}.windows{color:#5c655f;font-size:13px}.players{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.play{border:0;border-radius:12px;padding:13px 7px;font-size:12px;font-weight:750;cursor:pointer;color:#fff}.google{background:#68717d}.source{background:#816449}.a19{background:#35685e}.b19{background:#31547a}.status{min-height:20px;color:#315c55;font-size:13px}.choice{display:flex;gap:8px;flex-wrap:wrap}.choice button{padding:10px 13px;border:1px solid #cec7ba;border-radius:10px;background:#faf8f4;cursor:pointer}.choice button.selected{border-color:#315c55;background:#dfece8;color:#173d35}.note{width:100%;min-height:64px;margin-top:10px;padding:10px 12px;border:1px solid #d8d1c6;border-radius:10px;font:inherit}@media(max-width:700px){body{padding:18px 10px}.players{grid-template-columns:repeat(2,1fr)}}
</style></head><body><main><h1>2 条源音精确裁切｜V19</h1>
<p class="intro">这轮不重新调用千问。你已经确认 V17 源音里的目标词本身读对了，本页只比较两种裁切边界：A19 更紧，B19 多保留少量尾部。原 V17 污染片段也保留在第二个按钮，方便确认截的是不是同一次读音。</p>
<div class="summary" id="summary"></div><section id="cards"></section></main><script>
const cases=${payload};const key='gaokao-google-voice-qwen-source-crop-owner-qa-v19';const state=JSON.parse(localStorage.getItem(key)||'{}');const accentLabel={american:'美音',british:'英音'};let activeAudio,activeButton,activeLabel;const stopActive=()=>{if(activeAudio){activeAudio.pause();activeAudio.currentTime=0}if(activeButton)activeButton.textContent=activeLabel;activeAudio=activeButton=activeLabel=null};const save=()=>{localStorage.setItem(key,JSON.stringify(state));summary()};const summary=()=>{const done=cases.filter(item=>state[item.id]?.choice).length;document.querySelector('#summary').textContent='已判断 '+done+' / '+cases.length+' 条 · 待判断 '+(cases.length-done)};const cards=document.querySelector('#cards');for(const [index,item] of cases.entries()){const record=state[item.id]||{};const card=document.createElement('article');card.className='card';card.innerHTML='<div class="heading"><span>#'+String(index+1).padStart(2,'0')+'</span><h2>'+item.headword+'</h2><span>'+accentLabel[item.accent]+'</span><span class="badge">源音裁切</span></div><div class="ipa">核准目标：<strong>'+item.verifiedIpa+'</strong></div><div class="issue">你的依据：'+item.ownerSourceJudgment+'</div><div class="windows">A19 '+item.a19Window+'（'+item.a19Ratio.toFixed(2)+'× Google 时长） · B19 '+item.b19Window+'（'+item.b19Ratio.toFixed(2)+'×）</div><div class="players"><button class="play google" data-src="'+item.google+'">G · Google</button><button class="play source" data-src="'+item.source+'">'+item.sourceLabel+' · 原污染段</button><button class="play a19" data-src="'+item.a19+'">A19 · 紧裁</button><button class="play b19" data-src="'+item.b19+'">B19 · 保守裁</button></div><div class="status"></div><div class="choice"><button data-value="a19">A19 可用</button><button data-value="b19">B19 可用</button><button data-value="fail">都不行</button></div><textarea class="note" placeholder="如果仍有多余音或被截断，请写清楚在词头还是词尾">'+(record.issue||'')+'</textarea>';card.querySelectorAll('.play').forEach(button=>button.onclick=()=>{stopActive();activeButton=button;activeLabel=button.textContent;button.textContent='正在播放…';activeAudio=new Audio(button.dataset.src);activeAudio.addEventListener('ended',()=>{if(activeButton===button)stopActive()},{once:true});activeAudio.play().catch(error=>{button.textContent='播放失败';card.querySelector('.status').textContent='播放失败：'+error.message;activeAudio=activeButton=activeLabel=null})});card.querySelectorAll('[data-value]').forEach(button=>{button.classList.toggle('selected',record.choice===button.dataset.value);button.onclick=()=>{state[item.id]={...state[item.id],choice:button.dataset.value};save();card.querySelectorAll('[data-value]').forEach(candidate=>candidate.classList.toggle('selected',candidate===button))}});card.querySelector('.note').oninput=event=>{state[item.id]={...state[item.id],issue:event.target.value};save()};cards.append(card)}summary();
</script></body></html>`, 'utf8')
console.log(outputPath)
