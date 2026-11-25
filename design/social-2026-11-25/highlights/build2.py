import sys, os
from PIL import Image
F, OUT, CROPS = sys.argv[1], sys.argv[2], sys.argv[3]
TOTAL=8
CSS=f"""
@font-face{{font-family:NS;font-weight:400;src:url({F}/noto-serif-sc-chinese-simplified-400-normal.woff2)}}
@font-face{{font-family:NS;font-weight:700;src:url({F}/noto-serif-sc-chinese-simplified-700-normal.woff2)}}
@font-face{{font-family:NS;font-weight:900;src:url({F}/noto-serif-sc-chinese-simplified-900-normal.woff2)}}
:root{{--bg:#DDF1E8;--ink:#1B231E;--deep:#2C6E56;--kick:#3F7F68;--mute:#4A564F}}
*{{margin:0;box-sizing:border-box}}
body{{width:1500px;height:2000px;position:relative;overflow:hidden;background:var(--bg);font-family:"Liberation Serif",NS,serif;color:var(--ink)}}
.kicker{{position:absolute;left:135px;top:150px;font:400 40px NS;color:var(--kick);letter-spacing:2px}}
h1{{position:absolute;left:132px;top:218px;font:900 104px/1.2 NS;letter-spacing:1px}}
.cap{{position:absolute;left:135px;font:400 32px NS;color:var(--kick)}}
.shot{{position:absolute;left:135px;background:#fff;border-radius:22px;padding:26px;box-shadow:0 22px 56px rgba(30,70,55,.18)}}
.shot img{{display:block}}
.call{{position:absolute;left:0;width:250px}}
.call .br{{position:absolute;left:-46px;width:22px;border:4px solid var(--deep);border-left:none;border-radius:0 8px 8px 0}}
.call .ar{{position:absolute;left:-24px;width:30px;height:4px;background:var(--deep)}}
.call b{{display:block;font:900 36px NS;color:var(--deep)}}
.call span{{display:block;font:400 28px/1.45 NS;color:var(--mute);margin-top:6px}}
.note{{position:absolute;left:135px;right:135px;font:400 36px/1.6 "Liberation Serif",NS;color:var(--mute)}}
.foot{{position:absolute;left:135px;right:135px;bottom:96px;display:flex;justify-content:space-between;font:400 36px NS;color:var(--kick)}}
"""
def page(n,kicker,title,crop,cap,calls,width=960,top=560,note=None,side=True,extra=''):
    im=Image.open(f"{CROPS}/{crop}.png"); s=width/im.width; h=round(im.height*s)
    x0=135+26+width+26
    cs=""
    if side:
        prev=0
        for (a,b,lab,desc) in calls:
            ya=top+26+a*h; yb=top+26+b*h
            ly=max(ya-6,prev+14); prev=ly+50+(44*((len(desc)+7)//8) if desc else 0)
            cs+=f'<div class="br" style="position:absolute;left:{x0+12}px;top:{ya:.0f}px;width:22px;height:{yb-ya:.0f}px;border:4px solid #2C6E56;border-left:none;border-radius:0 8px 8px 0"></div>'
            cs+=f'<div class="call" style="left:{x0+52}px;top:{ly:.0f}px"><b>{lab}</b><span>{desc}</span></div>'
    nt=f'<div class="note" style="top:{top+h+52+36}px">{note}</div>' if note else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="kicker">{kicker}</div><h1>{title}</h1>
<div class="cap" style="top:{top-52}px">{cap}</div>
<div class="shot" style="top:{top}px"><img src="{CROPS}/{crop}.png" style="width:{width}px"></div>{cs}{nt}{extra}
<div class="foot"><span>獭石题库</span><span>高考英语真题解析　<span style="font-family:'Liberation Serif'">{n}/{TOTAL}</span></span></div></body></html>"""
P={}
im=Image.open(f"{CROPS}/listen2.png"); lw=640; lh=round(im.height*lw/im.width); lt=1190
ex=f'<div class="cap" style="top:{lt-52}px">解析原页截图 · 听力第 2 题</div><div class="shot" style="top:{lt}px"><img src="{CROPS}/listen2.png" style="width:{lw}px"></div>'
ex+=f'<div class="call" style="left:{135+52+lw+50}px;top:{lt+120}px;width:470px"><b>听力也这样讲</b><span>原文、译文对着放，题号 [2] 直接标在答案那一句，淡绿底一眼找到。每段还标了主题语境。</span></div>'
P[2]=page(2,"亮点 1 · 答案速查","65 道题的答案，<br>一页查完","answers","解析原页截图 · 第 1 页",[],width=1178,side=False,extra=ex)
P[3]=page(3,"亮点 2 · 每题指回原文","先定位，<br>再拿原文说话","q25","解析原页截图 · 阅读 B 篇第 25 题",
 [(.17,.34,"定位","题干词回到第几段第几句"),(.38,.55,"原文依据","答案那句原样引出，淡绿底标出"),(.56,.98,"正确选项","选项的词对上原文哪个词")])
P[4]=page(4,"亮点 3 · 错项逐个讲","不说「与原文不符」，<br>说清错在哪","q26","解析原页截图 · 阅读 B 篇第 26 题",
 [(.04,.42,"先讲对的","正确选项为什么对"),(.55,.98,"再讲错的","A 算年龄、C 借了 roof、D 原文没提，各说一句错在哪")])
P[5]=page(5,"亮点 4 · 长难句拆开讲","长句子，<br>先抓主干","long34","解析原页截图 · 关联第 34 题",
 [(.03,.24,"方括号拆层次","一眼看出主干和修饰"),(.27,.74,"句子解析","先找主干，再一层层挂修饰"),(.76,.98,"参考译文","")])
P[6]=page(6,"亮点 5 · 完形和七选五","每个空，<br>都教一个找法","cloze48","解析原页截图 · 完形第 48 题",
 [(.02,.13,"脉络","这里要什么意思"),(.14,.3,"找法","凭原文哪个词：形容词看情感"),(.33,.98,"其余三项","逐个说为什么不行")],
 note="七选五把空前、答案、空后三行摆在一起；多余项说清它想骗哪一空。")
P[7]=page(7,"亮点 6 · 作文","一道作文，<br>三篇范文对着看","better","解析原页截图 · 应用文「提高版多做了什么」",
 [(.0,.35,"提高版的原句","引出来逐句讲"),(.36,.98,"多想了一步","比标准版具体在哪，为什么更好")],
 note="另有审题卡（必须做到 / 可以换）、标准版、参考范文、逐段看和本题可用表达。")
for n,h in P.items(): open(f"{OUT}/p{n}.html","w").write(h)
print("ok")
