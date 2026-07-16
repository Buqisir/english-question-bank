# grammar-facets-v2 D1 step1 — 嫌疑名单

共 8 条（上限 20）。每条为脚本判定不确定/规则与旧标签冲突的空，需 owner 抽验判例。

## paper-2020-i / q-2020-i-064
- answer: `accuracy`　hint: `accurate`　旧 facetKey: `grammar-fill.given.derivation.verb-to-noun`
- 试标 facetKey: `grammar-fill.given.conversion.adjective-to-noun`
- reason 摘要: 空格与 Historical 一起作句子主语，需要名词，故把形容词 accurate 派生为名词 accuracy（准确性）。
- 疑点: 旧标签 verb-to-noun，但 answer "accuracy" 以 -acy 结尾（经典形→名后缀，如 accurate→accuracy），hint "accurate" 疑为形容词非动词，方向应为 adjective-to-noun

## paper-2024-i / q-2024-i-059
- answer: `closed`　hint: `close`　旧 facetKey: `grammar-fill.given.verb.non-finite`　旧 role: `subject-complement`
- 试标 role: `predicative`
- reason 摘要: stays 为系动词，本空作主语补足语描述 structure 的状态；结构被关闭，用过去分词 closed 表被动/状态（保持关闭着）。
- 疑点: reason 显示"系动词"后接表语场景，旧标签 subject-complement 应为 predicative（表语），非主语补足语

## paper-2024-i / q-2024-i-065
- answer: `richness`　hint: `rich`　旧 facetKey: `grammar-fill.given.noun`
- 试标 facetKey: `grammar-fill.given.conversion.adjective-to-noun`
- reason 摘要: the ___ of gardening 中，冠词 the 与 of 短语之间需名词；形容词 rich 派生为名词 richness（丰富）作 define 的宾语中心词。
- 疑点: 旧标签 given.noun 但 answer 以 -ness 结尾（经典形→名后缀），hint "rich" 疑为形容词，非名词单复数/所有格；程序性证据见 program.md "rich→richness 挂名词桶"

## paper-2024-ii / q-2024-ii-062
- answer: `visibility`　hint: `visible`　旧 facetKey: `grammar-fill.given.derivation.noun-to-adj`
- 试标 facetKey: `grammar-fill.given.conversion.adjective-to-noun`
- reason 摘要: 空格前有形容词 international 修饰、动词 increased 作宾语，需名词，故由形容词 visible 派生为名词 visibility。
- 疑点: 旧标签 noun-to-adj，但 answer "visibility" 以名词后缀结尾、非形容词后缀；hint "visible" 疑为形容词，方向应为 adjective-to-noun

## paper-2025-ii / q-2025-ii-063
- answer: `absence`　hint: `absent`　旧 facetKey: `grammar-fill.given.derivation.noun-to-adj`
- 试标 facetKey: `grammar-fill.given.conversion.adjective-to-noun`
- reason 摘要: 空格前有定冠词 the、后有 of 短语，是“the + 名词 + of”结构，须用名词；形容词 absent 派生为名词 absence（缺少）。
- 疑点: 旧标签 noun-to-adj，但 answer "absence" 以名词后缀结尾、非形容词后缀；hint "absent" 疑为形容词，方向应为 adjective-to-noun

## paper-zj-2022-jun / q-zj-2022-jun-057
- answer: `to do`　hint: `do`　旧 facetKey: `grammar-fill.given.verb.non-finite`　旧 role: `object`
- 试标 role: `object-complement`
- reason 摘要: tell sb (not) to do sth 为固定搭配，宾语补足语用动词不定式；否定词 not 置于 to 前，故填 to do。
- 疑点: reason 自述"宾补/宾语补足语"，旧标签为 object，改判 object-complement

## paper-zj-2022-jun / q-zj-2022-jun-058
- answer: `photographer`　hint: `photograph`　旧 facetKey: `grammar-fill.given.noun`
- 试标 facetKey: `grammar-fill.given.conversion.noun-to-noun`
- reason 摘要: a former ___ 后接名词且指人；冠词 a 与 former 提示需要单数可数的“职业人”名词，故由 photograph 派生为 photographer。
- 疑点: 旧标签 given.noun，answer 非 hint 的规则复数/所有格形（疑为派生，如职业后缀 -er/-or），试标 noun-to-noun 待核

## paper-zj-2026-jan / q-zj-2026-jan-056
- answer: `to finish`　hint: `finish`　旧 facetKey: `grammar-fill.given.verb.non-finite`　旧 role: `object`
- 试标 role: `object-complement`
- reason 摘要: 本句已有谓语 wait（waiting for a microwave），微波炉与 finish 之间为「等微波炉去做完加热」，wait for sb./sth. to do 为固定搭配，逻辑宾语后接
- 疑点: reason 自述"宾补/宾语补足语"，旧标签为 object，改判 object-complement
