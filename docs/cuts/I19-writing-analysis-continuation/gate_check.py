"""I19 范文词汇 gate：吃 paperId + 范文文本文件 → 吐"真超纲"（已滤原文/starters/名字）。
用法: python3 gate_check.py <paperId> <modelAnswerFile>
口径: 允许 = 课标 ∪ 库派生 ∪ 本题原文+starters 出现过的词 ∪ 专名(大写)。
"""
import json, re, sys, os
sys.path.insert(0, os.path.expanduser("~/.claude/skills/guokao-vocab-checker/scripts"))
import check

pid, ma_file = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
src = json.load(open(f"{here}/pilot/{pid}.in.json"))
material = src["materialText"] + " " + " ".join(src.get("continuationStarters", []))
ma = open(ma_file, encoding="utf-8").read()

src_words = set(w.lower() for w in re.findall(r"[A-Za-z]+", material))
caps = set(w.lower() for w in re.findall(r"\b[A-Z][a-z]+", ma + " " + material))

r = check.check_text(ma)
oov = [w for w, _ in r["unannotated_oov_words"]]
genuine = [w for w in oov if w not in src_words and w not in caps]
suspect = [f"{w}←{root}" for w, root, _ in r["suspect_derived_words"]
           if w not in src_words and w not in caps]

if genuine:
    print("GENUINE_OOV(必须改成课标词):", " ".join(sorted(genuine)))
else:
    print("CLEAN ✅ 零真超纲")
if suspect:
    print("SUSPECT(疑似派生·确认下，多半可留):", " ".join(suspect))
