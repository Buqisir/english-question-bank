#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-qwen-dual-teacher-violin-v40/manifest.json'), 'utf8'))
const teacher = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-qwen-dual-teacher-violin-v40/teacher-receipt.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-qwen-dual-teacher-violin-v40' || manifest.formalAssetsChanged !== false) throw new Error('Expected one private V40 Qwen candidate')
const sources = {
  authority: 'https://dictionary.cambridge.org/media/english/us_pron/v/vio/violi/violin.mp3',
  teacher: teacher.publicPath,
  final: manifest.entry.publicPath,
}
// The phonetic teacher remains scratch-only and is copied nowhere public. The QA
// page therefore compares only the known-good authority with the final Qwen output.
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>violin 双教师 Qwen V40</title><style>:root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20231f;background:#f5f6f2}*{box-sizing:border-box}body{margin:0;padding:32px 18px}.wrap{max-width:980px;margin:auto}h1{font-size:32px;margin:0 0 8px}.lead{color:#63685f;line-height:1.65;margin:0 0 22px}.notice{background:#eaf3ee;border:1px solid #b7d0c3;border-radius:14px;padding:16px 18px;line-height:1.6;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{background:white;border:1px solid #d9dcd4;border-radius:16px;padding:22px}.card h2{font-size:20px}.card p{color:#666b63;line-height:1.55;min-height:96px}button{width:100%;border:1px solid #2c725b;background:#2c725b;color:white;border-radius:11px;padding:13px;font-size:16px;font-weight:700;cursor:pointer}button.playing{background:white;color:#2c725b}@media(max-width:760px){body{padding:20px 12px}.grid{grid-template-columns:1fr}.card p{min-height:0}}</style></head><body><main class="wrap"><h1>violin 双教师 Qwen V40</h1><p class="lead">先确认内部教师读音，再判断 Qwen 能否把正确发音迁移到原 Google 女声音色。</p><div class="notice"><strong>没有换最终音色。</strong>千问参考的大头仍是原 Google 女声；②只负责教“歪啊 LIN”，③才是最终候选。</div><section class="grid"><article class="card"><h2>① Cambridge 正确发音</h2><p>本地听觉基准，不进入正式资产，也没有喂给千问。</p><button data-audio="authority">播放正确基准</button></article><article class="card"><h2>② 内部发音教师</h2><p>不同音色没关系，只判断它有没有准确读出“歪啊 LIN”。它只教发音，不作为最终音频。</p><button data-audio="teacher">播放内部教师</button></article><article class="card"><h2>③ Qwen 最终候选 V40</h2><p>必须同时满足：发音像①②，音色仍像原 Google 美国女声。</p><button data-audio="final">播放 V40</button></article></section></main><script>const sources=${JSON.stringify(sources).replaceAll('<','\\u003c')};let current=null;document.querySelectorAll('[data-audio]').forEach(button=>button.addEventListener('click',()=>{if(current){current.audio.pause();current.button.classList.remove('playing');current.button.textContent=current.label;if(current.button===button){current=null;return}}const label=button.textContent;const audio=new Audio(sources[button.dataset.audio]);current={audio,button,label};button.classList.add('playing');button.textContent='停止';audio.addEventListener('ended',()=>{button.classList.remove('playing');button.textContent=label;current=null},{once:true});audio.play()}));</script></body></html>`
const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'qwen-dual-teacher-violin-owner-qa-v40.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
