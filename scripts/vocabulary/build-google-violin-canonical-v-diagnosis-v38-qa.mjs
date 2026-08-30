#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-neural2-violin-canonical-v-diagnosis-v38/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-neural2-violin-canonical-v-diagnosis-v38' || manifest.formalAssetsChanged !== false) throw new Error('Expected private V38 diagnostic manifest')

const audio = {
  authority: manifest.authority.audioUrl,
  context: manifest.entry.context.publicPath,
  crop: manifest.entry.crop.publicPath,
}
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>violin 单点诊断 V38</title>
  <style>
    :root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20231f;background:#f5f6f2}
    *{box-sizing:border-box}body{margin:0;padding:32px 18px}.wrap{max-width:920px;margin:auto}
    h1{font-size:32px;margin:0 0 8px}.lead{color:#63685f;margin:0 0 26px;line-height:1.65}
    .notice{background:#fff7d8;border:1px solid #e6d78a;border-radius:14px;padding:16px 18px;margin-bottom:18px;line-height:1.6}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{background:#fff;border:1px solid #d9dcd4;border-radius:16px;padding:20px;box-shadow:0 3px 12px #20231f0a}
    .n{color:#2c725b;font-weight:750}.card h2{font-size:20px;margin:8px 0}.card p{color:#666b63;line-height:1.5;min-height:72px}
    button{width:100%;border:1px solid #2c725b;background:#2c725b;color:white;border-radius:11px;padding:12px;font-size:16px;font-weight:700;cursor:pointer}
    button.playing{background:#fff;color:#2c725b}.question{margin-top:18px;background:#fff;border:1px solid #d9dcd4;border-radius:16px;padding:20px}
    .question strong{display:block;margin-bottom:10px}.choice{display:flex;gap:10px}.choice button{width:auto;background:#fff;color:#20231f;border-color:#cfd3ca}.choice button.selected{background:#e9f3ee;color:#205b48;border-color:#6aa68e}
    .source{margin-top:20px;font-size:14px;color:#73786f}.source a{color:#2c725b}
    @media(max-width:720px){body{padding:20px 12px}.grid{grid-template-columns:1fr}.card p{min-height:0}.choice{flex-wrap:wrap}}
  </style>
</head>
<body>
  <main class="wrap">
    <h1>violin 单点诊断 V38</h1>
    <p class="lead">不抽卡，只判断两件事：Google 整句里的词是否正确；如果正确，裁切后是否才变坏。</p>
    <div class="notice"><strong>本轮唯一改动：</strong>把 V37 错写的开头 /w/ 恢复成权威音标的 /v/。目标仍是 /aɪ/ 像“歪”，LIN 主重读；音色、速度、句子和裁切算法都没动。</div>
    <section class="grid">
      <article class="card"><span class="n">① 基准</span><h2>Cambridge 真人美音</h2><p>先听目标。注意开头是轻微 /v/ 摩擦，后面 /aɪ/ 才是你说的“歪”。</p><button data-audio="authority">播放真人基准</button></article>
      <article class="card"><span class="n">② 合成</span><h2>Google 完整句</h2><p>听句中 violin 本身。若这里已错，问题在合成，不在裁切。</p><button data-audio="context">播放完整句</button></article>
      <article class="card"><span class="n">③ 裁切</span><h2>同一条音的单词切片</h2><p>与②完全同源。若②对而③错，问题就是切点或淡入淡出。</p><button data-audio="crop">播放裁切词</button></article>
    </section>
    <section class="question"><strong>Google 完整句里的 violin 对吗？</strong><div class="choice" data-question="context"><button data-value="yes">对</button><button data-value="no">不对</button></div></section>
    <section class="question"><strong>如果完整句对，裁切后还对吗？</strong><div class="choice" data-question="crop"><button data-value="yes">对</button><button data-value="no">不对</button><button data-value="skip">完整句已错</button></div></section>
    <p class="source">权威锚点：<a href="${manifest.authority.pageUrl}" target="_blank" rel="noreferrer">Cambridge Dictionary US /ˌvaɪ.əˈlɪn/</a></p>
  </main>
  <script>
    const sources=${JSON.stringify(audio).replaceAll('<', '\\u003c')};
    let current=null;
    document.querySelectorAll('[data-audio]').forEach((button)=>button.addEventListener('click',()=>{
      if(current){current.audio.pause();current.button.classList.remove('playing');current.button.textContent=current.label;if(current.button===button){current=null;return}}
      const label=button.textContent;const audio=new Audio(sources[button.dataset.audio]);current={audio,button,label};button.classList.add('playing');button.textContent='停止';
      audio.addEventListener('ended',()=>{button.classList.remove('playing');button.textContent=label;current=null},{once:true});audio.play();
    }));
    document.querySelectorAll('[data-question]').forEach((group)=>group.querySelectorAll('button').forEach((button)=>button.addEventListener('click',()=>{
      group.querySelectorAll('button').forEach((item)=>item.classList.remove('selected'));button.classList.add('selected');
      localStorage.setItem('gaokao-google-neural2-violin-canonical-v-diagnosis-owner-qa-v38',JSON.stringify({...JSON.parse(localStorage.getItem('gaokao-google-neural2-violin-canonical-v-diagnosis-owner-qa-v38')||'{}'),[group.dataset.question]:button.dataset.value}));
    })));
  </script>
</body>
</html>`

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-neural2-violin-canonical-v-diagnosis-owner-qa-v38.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
