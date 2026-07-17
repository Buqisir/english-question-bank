-- paper-2026-i 破折号归一（dash-optionbank-gate 刀，2026-07-16）
-- 标准 v2 §7：英文破折号 = en-dash「 – 」前后各一空格；中文语境全角「—」保留。
-- 本地库已应用；生产部署时对 question-bank.sqlite 执行本文件（幂等）。
-- asset 文件侧同批修改随 git 部署，无需额外动作。
UPDATE passages SET material_text = replace(material_text, ' — ', ' – ')
  WHERE id IN ('passage-2026-i-reading-a', 'passage-2026-i-reading-d');
UPDATE passages SET material_text = replace(material_text, 'together--spaces', 'together – spaces')
  WHERE id = 'passage-2026-i-reading-a';
UPDATE passages SET material_text = replace(material_text, 'inspired--than', 'inspired – than')
  WHERE id = 'passage-2026-i-reading-d';
