#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const v38 = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-neural2-violin-canonical-v-diagnosis-v38/manifest.json'), 'utf8'))
const v39 = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-neural2-violin-plain-text-diagnosis-v39/manifest.json'), 'utf8'))
if (v39.schemaVersion !== 'gaokao-frequency-google-neural2-violin-plain-text-diagnosis-v39' || v39.formalAssetsChanged !== false) throw new Error('Expected private V39 diagnostic manifest')

const sources = {
  authority: v39.authority.audioUrl,
  phoneme: v38.entry.context.publicPath,
  plain: v39.entry.context.publicPath,
}
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>violin phoneme 排查 V39</title>
<style>:root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20231f;background:#f5f6f2}*{box-sizing:border-box}body{margin:0;padding:32px 18px}.wrap{max-width:920px;margin:auto}h1{font-size:32px;margin:0 0 8px}.lead{color:#63685f;margin:0 0 24px;line-height:1.65}.notice{background:#eaf3ee;border:1px solid #b7d0c3;border-radius:14px;padding:16px 18px;margin-bottom:18px;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{background:#fff;border:1px solid #d9dcd4;border-radius:16px;padding:20px}.n{color:#2c725b;font-weight:750}.card h2{font-size:20px;margin:8px 0}.card p{color:#666b63;line-height:1.5;min-height:72px}button{width:100%;border:1px solid #2c725b;background:#2c725b;color:#fff;border-radius:11px;padding:12px;font-size:16px;font-weight:700;cursor:pointer}button.playing{background:#fff;color:#2c725b}.question{margin-top:18px;background:#fff;border:1px solid #d9dcd4;border-radius:16px;padding:20px}.choice{display:flex;gap:10px;margin-top:10px}.choice button{width:auto;background:#fff;color:#20231f;border-color:#cfd3ca}.choice button.selected{background:#e9f3ee;color:#205b48;border-color:#6aa68e}@media(max-width:720px){body{padding:20px 12px}.grid{grid-template-columns:1fr}.card p{min-height:0}}</style></head>
<body><main class="wrap"><h1>violin phoneme 排查 V39</h1><p class="lead">这轮不是候选抽卡，只检查 Google 的音标标签有没有把自然发音弄坏。</p><div class="notice"><strong>唯一变量：</strong>③ 删除了 ② 的 phoneme 标签，只保留普通拼写 <code>violin</code>。女声、语速、句子完全相同。</div>
<section class="grid"><article class="card"><span class="n">① 标准</span><h2>Cambridge 真人</h2><p>正确目标，不参与正式资产。</p><button data-audio="authority">播放真人标准</button></article><article class="card"><span class="n">② 已失败</span><h2>Google + 音标</h2><p>V38 原样保留，作为失败对照。</p><button data-audio="phoneme">播放 V38</button></article><article class="card"><span class="n">③ 单变量</span><h2>Google 普通拼写</h2><p>只去掉音标标签，听它是否更接近真人。</p><button data-audio="plain">播放 V39</button></article></section>
<section class="question"><strong>③ Google 普通拼写是否正确？</strong><div class="choice" data-question="plain"><button data-value="yes">对</button><button data-value="no">不对</button></div></section></main>
<script>const sources=${JSON.stringify(sources).replaceAll('<','\\u003c')};let current=null;document.querySelectorAll('[data-audio]').forEach(button=>button.addEventListener('click',()=>{if(current){current.audio.pause();current.button.classList.remove('playing');current.button.textContent=current.label;if(current.button===button){current=null;return}}const label=button.textContent;const audio=new Audio(sources[button.dataset.audio]);current={audio,button,label};button.classList.add('playing');button.textContent='停止';audio.addEventListener('ended',()=>{button.classList.remove('playing');button.textContent=label;current=null},{once:true});audio.play()}));document.querySelectorAll('[data-question]').forEach(group=>group.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{group.querySelectorAll('button').forEach(item=>item.classList.remove('selected'));button.classList.add('selected');localStorage.setItem('gaokao-google-neural2-violin-plain-text-diagnosis-owner-qa-v39',JSON.stringify({plain:button.dataset.value}))})));</script></body></html>`

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-neural2-violin-plain-text-diagnosis-owner-qa-v39.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
