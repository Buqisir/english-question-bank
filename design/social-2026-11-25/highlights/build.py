import os, sys
F = sys.argv[1]; OUT = sys.argv[2]
TOTAL = 8
CSS = f"""
@font-face{{font-family:NS;font-weight:400;src:url({F}/noto-serif-sc-chinese-simplified-400-normal.woff2)}}
@font-face{{font-family:NS;font-weight:700;src:url({F}/noto-serif-sc-chinese-simplified-700-normal.woff2)}}
@font-face{{font-family:NS;font-weight:900;src:url({F}/noto-serif-sc-chinese-simplified-900-normal.woff2)}}
:root{{--bg:#DDF1E8;--ink:#1B231E;--deep:#2C6E56;--kick:#3F7F68;--mute:#6F7B74;--hl:#D3EBDF;--line:#E1EEE8}}
*{{margin:0;box-sizing:border-box}}
body{{width:1500px;height:2000px;position:relative;overflow:hidden;background:var(--bg);font-family:"Liberation Serif",NS,serif;color:var(--ink)}}
.kicker{{position:absolute;left:135px;top:150px;font:400 40px NS;color:var(--kick);letter-spacing:2px}}
h1{{position:absolute;left:132px;top:218px;font:900 104px/1.2 NS;letter-spacing:1px}}
.card{{position:absolute;left:135px;right:135px;background:#fff;border-radius:34px;padding:60px 66px}}
.foot{{position:absolute;left:135px;right:135px;bottom:96px;display:flex;justify-content:space-between;font:400 36px NS;color:var(--kick)}}
.num{{display:inline-flex;align-items:center;justify-content:center;min-width:58px;height:50px;padding:0 14px;border-radius:10px;background:var(--deep);color:#fff;font:700 34px "Liberation Serif";margin-right:16px;vertical-align:4px}}
.lab{{display:inline-block;width:175px;font:700 36px NS;color:var(--deep);vertical-align:top}}
.lab.m{{color:var(--mute);font-weight:400}}
.row{{display:flex;margin-top:26px}} .row .lab{{flex:none}} .row .v{{flex:1;font-size:42px;line-height:1.55}}
.zh{{font:400 35px/1.6 "Liberation Serif",NS;color:var(--mute)}}
.hl{{background:var(--hl);border-radius:6px;padding:0 4px}}
.q{{font-size:44px;line-height:1.45;font-weight:700}}
.sep{{height:2px;background:var(--line);margin:36px 0}}
.chip{{display:inline-block;font:400 34px NS;color:var(--deep);background:var(--bg);border-radius:999px;padding:8px 24px;margin:0 14px 16px 0}}
.note{{position:absolute;left:135px;right:135px;font:400 38px/1.6 "Liberation Serif",NS;color:#4A564F}}
"""
def page(n, kicker, title, body, extra=""):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}{extra}</style></head><body>
<div class="kicker">{kicker}</div><h1>{title}</h1>{body}
<div class="foot"><span>獭石题库</span><span>高考英语真题解析　<span style="font-family:'Liberation Serif'">{n}/{TOTAL}</span></span></div></body></html>"""

pages = {}
# 2 answer grid
L = "CABCACBACBACABACBABB"; R = "CBDADBACBCBCDDA"; Q7 = "ACGDF"; W = "DBCACBDDABCDBAC"
G = ["entirely","instructor","and","feet","am supposed","which","descriptive","on","being","to meet"]
def cells(start, ans, per=5):
    out=[]; 
    for i,a in enumerate(ans):
        if i and i%per==0: out.append('<span class="gap"></span>')
        out.append(f'<span class="c"><i>{start+i}</i><b>{a}</b></span>')
    return "".join(out)
grid = f"""<div class="card" style="top:520px;padding:56px 56px">
<div class="g"><span class="gl">听力</span><div class="gc">{cells(1,L[:10])}<br>{cells(11,L[10:])}</div></div>
<div class="g"><span class="gl">阅读</span><div class="gc">{cells(21,R)}</div></div>
<div class="g"><span class="gl">七选五</span><div class="gc">{cells(36,Q7)}</div></div>
<div class="g"><span class="gl">完形</span><div class="gc">{cells(41,W)}</div></div>
<div class="g"><span class="gl">语法填空</span><div class="gc gw">{''.join(f'<span class="w"><i>{56+i}</i><b>{g}</b></span>' for i,g in enumerate(G))}</div></div>
<div class="zh" style="margin-top:26px">2026 全国 II 卷 · 答案速查原样</div></div>
<div class="note" style="top:1640px">对完答案，再往后翻：每一题都有「为什么」。</div>"""
gcss = """.g{display:flex;margin-bottom:40px}.gl{flex:none;width:170px;font:700 36px NS;padding-top:30px}
.gc{flex:1;line-height:1}.c{display:inline-flex;flex-direction:column;align-items:center;width:56px;margin:0 2px 14px 0}
.c i{font:400 22px "Liberation Serif";font-style:normal;color:var(--mute);background:var(--bg);width:100%;text-align:center;padding:3px 0}
.c b{font:700 40px "Liberation Serif";padding-top:8px}.gap{display:inline-block;width:12px}
.gw{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.w{display:flex;flex-direction:column;align-items:center}
.w i{font:400 22px "Liberation Serif";font-style:normal;color:var(--mute);background:var(--bg);width:100%;text-align:center;padding:3px 0}
.w b{font:700 30px "Liberation Serif";padding-top:8px;white-space:nowrap}"""
pages[2] = page(2, "亮点 1 · 答案速查", "65 道题的答案，<br>一页查完", grid, gcss)

# 3 locate + evidence
b3 = """<div class="card" style="top:520px">
<div class="q"><span class="num">25</span>What made Reisley finally decide to settle down in Usonia?</div>
<div class="row"><span class="lab">定位</span><div class="v"><b>decide to settle down</b> → <b>decided to join</b><div class="zh">第 3 段末句 · 看同句 that 前的原因</div></div></div>
<div class="row"><span class="lab">原文依据</span><div class="v">“On their first trip out, they were <span class="hl">greeted with such enthusiasm from the 10 families who’d already established homes there</span> that they decided to join.”</div></div>
<div class="row"><span class="lab">正确选项</span><div class="v"><b>D</b>　The warmth of its residents.<div class="zh">选项的“热情”就是原文的 such enthusiasm，“居民”就是早已在那里安家的 10 户人家。</div></div></div>
</div>
<div class="note" style="top:1560px">听力也一样：原文、译文对着放，题号直接标在答案那一句上。</div>"""
pages[3] = page(3, "亮点 2 · 每题指回原文", "先定位，<br>再拿原文说话", b3)

# 4 wrong options
b4 = """<div class="card" style="top:520px">
<div class="q"><span class="num">26</span>What can we learn about Reisley’s house?</div>
<div class="row"><span class="lab">正确选项</span><div class="v"><b>B</b>　It uses local materials.<div class="zh">原文 “It is made with local materials”，选项只把“用……建造”说成“使用”。</div></div></div>
<div class="sep"></div>
<div class="row"><span class="lab m">A 错在</span><div class="v zh" style="color:#3E4943">1951 年他 26 岁才开始找房，如今 101 岁、在房里住了 73 年：101 − 73 = 28，房子比主人年轻约 28 岁，说它比主人还老不对。</div></div>
<div class="row"><span class="lab m">C 错在</span><div class="v zh" style="color:#3E4943">选项借了原文的 roof，可原文写的是平屋顶（a flat roof），不是尖顶。</div></div>
<div class="row"><span class="lab m">D 错在</span><div class="v zh" style="color:#3E4943">原文没提卖房；写的是他向参观者开放房子（opened his doors）。</div></div>
</div>
<div class="note" style="top:1620px">每个错项都指出借了原文哪个词、偷换在哪。</div>"""
pages[4] = page(4, "亮点 3 · 错项逐个讲", "不说「与原文不符」，<br>说清错在哪", b4)

# 5 long sentence
b5 = """<div class="card" style="top:520px">
<div class="zh" style="font-weight:700;color:var(--deep)">长难句解析 · 关联题目 34</div>
<div class="v" style="font-size:42px;line-height:1.75;margin-top:18px">They <span class="br">consist of an electric motor</span> <span class="br b2">which collects energy</span> used in the braking action that <span class="br b3">would be lost as heat</span> by conventional brakes.</div>
<div class="sep"></div>
<div class="row" style="margin-top:0"><span class="lab">句子解析</span><div class="v zh" style="color:#3E4943">主干是 They consist of an electric motor（它们由一台电动机构成）。which collects energy 修饰 motor；used in the braking action 是过去分词作后置定语，修饰 energy；that 从句再修饰这部分能量。三层修饰一环套一环，合起来就是再生制动的工作原理。</div></div>
<div class="row"><span class="lab">参考译文</span><div class="v zh" style="color:#3E4943">它由一台电动机构成，这台电动机会收集制动过程中消耗的能量，而这些能量在传统刹车中会以热的形式散失。</div></div>
</div>"""
c5 = """.br{border-bottom:5px solid #72BFA4;padding-bottom:2px}.br::before{content:"[";color:var(--deep);font-weight:700}.br::after{content:"]";color:var(--deep);font-weight:700}
.b2{border-bottom-color:#A9D8C4}.b3{border-bottom-color:#C9E6D8}"""
pages[5] = page(5, "亮点 4 · 长难句拆开讲", "长句子，<br>先抓主干", b5, c5)

# 6 cloze method
b6 = """<div class="card" style="top:520px">
<div class="q"><span class="num">48</span>D　disapproving　<span class="zh" style="font-size:32px">不赞成的</span></div>
<div class="row"><span class="lab">脉络</span><div class="v zh" style="color:#3E4943">男孩当面指出老师自己都没做到，要一个带着不满和责备的神情。</div></div>
<div class="row"><span class="lab">找法</span><div class="v"><b>形容词看情感：</b><span class="zh" style="color:#3E4943">他接着说 <span class="hl">you haven’t even done it yourself</span>，even 带着责备，四个里只有 disapproving 是不赞同。</span></div></div>
<div class="sep"></div>
<div class="zh" style="font-weight:700;color:var(--deep);margin-bottom:18px">这一篇用到的找法</div>
<span class="chip">名词看复现</span><span class="chip">动词看搭配</span><span class="chip">形容词看情感</span><span class="chip">名词看情感</span><span class="chip">词组看语境义</span><span class="chip">形容词看复现</span><span class="chip">动词看复现</span>
</div>
<div class="note" style="top:1580px">七选五把空前、答案、空后三行摆在一起；多余项说清它想骗哪一空。</div>"""
pages[6] = page(6, "亮点 5 · 完形和七选五", "每个空，<br>都教一个找法", b6)

# 7 writing
b7 = """<div class="card" style="top:520px">
<div class="zh" style="font-weight:700;color:var(--deep)">应用文 · 给外教 Kate 写邮件</div>
<div style="margin-top:20px"><span class="chip">审题卡：必须做到 / 可以换</span><span class="chip">标准版范文</span><span class="chip">提高版范文</span><span class="chip">参考范文</span><span class="chip">逐段看</span><span class="chip">本题可用表达</span></div>
<div class="sep" style="margin-top:20px"></div>
<div class="zh" style="font-weight:700;color:var(--deep)">提高版多做了什么</div>
<div class="row"><span class="lab m">标准版</span><div class="v">I suggest adding a picture to each essay.</div></div>
<div class="row"><span class="lab">提高版</span><div class="v">… giving each essay <span class="hl">an illustration of the moment the writer cares about most, such as a rainy walk home or Grandma’s dumplings</span>.</div></div>
<div class="row"><span class="lab"></span><div class="v zh">说清画什么，再举两个画面，建议一读就能照着做。</div></div>
</div>
<div class="note" style="top:1640px">读后续写同样三篇范文，另讲「容易写偏」。</div>"""
pages[7] = page(7, "亮点 6 · 作文", "一道作文，<br>三篇范文对着看", b7)

# 8 coverage
rows = [("听力","原文、译文对照，题号标在原句；每段标主题语境"),("阅读","篇章结构、段落作用、全文译文、长难句"),("七选五","空前 / 答案 / 空后，多余项讲透"),("完形","主线和情感线，每空脉络 + 找法"),("语法填空","每空标提示词和考点"),("写作","审题卡、三篇范文、逐段看、可用表达")]
b8 = '<div class="card" style="top:520px">' + "".join(f'<div class="row" style="margin-top:{0 if i==0 else 34}px"><span class="lab" style="width:190px">{a}</span><div class="v zh" style="color:#3E4943;font-size:40px">{b}</div></div>' for i,(a,b) in enumerate(rows)) + """
<div class="sep"></div><div class="zh">已出：<b style="color:var(--ink)">2025 新课标 II 卷</b> · <b style="color:var(--ink)">2026 全国 II 卷</b>　每份 22 页</div></div>"""
pages[8] = page(8, "全卷覆盖", "从听力到读后续写，<br>一题不落", b8)

os.makedirs(OUT, exist_ok=True)
for n, html in pages.items():
    open(f"{OUT}/p{n}.html", "w").write(html)
print("ok", sorted(pages))
