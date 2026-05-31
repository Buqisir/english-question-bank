# Grammar-Fill Facets V1 — 语法填空考点框架库（静态·教学 IP）

Cut: I13 语法填空解析 · 第一刀（生成）
Last synced: 2026-05-31 (drafting — walking 考点 with PO 黄学伟)
进度（2026-05-31）:
- ✅ 字段 shape 已确认（7 字段）；given 分支总原则（提示词词性总闸 + 词性转换看目标词性）已锁。
- ✅ **整棵考点树全部对齐（11 个 facet）**：
  - 有提示词 6：谓语动词（一找二判三 + N+1）/ 非谓语（快路·慢路算法 + role 字段 A）/ 名词（数·所有格）/
    词性转换（名→形·动→名·动→形）/ 形容词（变副词·比较级）/ 代词 · 数词。
  - 无提示词 5：介词（本意·搭配·词频表）/ 冠词（特指·泛指本质 + 拥有vs种类操作测试 + 诚实残余）/
    代词（it 四用法·that·those 比较结构·one·ones 泛指）/ 连词四类（位置定类型·缺成分定引导词）。
- ⏳ **下一步**：写 `grammar-fill-analysis-v1.contract.md`（AI 每空 JSON，对标 cloze-analysis-v1）
  → `plan.md`（DEV 契约）→ PA → DEV（analyzeGrammarFill.mjs + validator + prompt + verifier）。
Open review items: analysis-v1 contract 未写；prompt/生成/render 未做（render 是后续刀）。

## 这是什么

这是**静态的**考点框架库，誊写自 PO 黄学伟 的语法填空讲义（xmind）。它是 PO 的教学
IP，**不由 AI 生成**（零幻觉）。AI 每空只做三件事：① 定 `facet_key` → ② 把该空**代入**
此处的「解题框架」（认主语 / 时态 / 触发词）→ ③ 高亮「证据」。

成对产物：
- 本文件 `grammar-fill-facets-v1.md` — 静态框架库（一次性写好，本刀对齐）。
- `grammar-fill-analysis-v1.contract.md` — AI 每空解析的 JSON 形状（引用 facet_key + 代入 +
  证据），对标 `I8-cloze-analysis/cloze-analysis-v1.contract.md`，本刀稍后写。

## Facet 命名约定（对齐 I0-facet-taxonomy-foundation）

- `facet_key`：小写 ASCII、点分、**最多 4 层**。中文只出现在 `label_zh`。
- 命名空间 = `grammar-fill`。主轴 = `given`（有提示词·找主谓宾）/ `no-hint`（无提示词·判 n+1）。
- 时态/语态/主被动等是「解题框架」里的**步骤**，不是独立 facet（否则超 4 层）。

## 每个考点的记录字段（← 先请 PO 确认这套字段对不对）

| 字段 | 含义 |
| --- | --- |
| `facet_key` / `label_zh` / `label_en` / `parent_key` | 标识与归属 |
| `blank_type` | `given` 有提示词 / `no-hint` 无提示词 |
| `recognize` | **识别信号**：怎么判定这个空是此考点（AI 定 facet 的依据） |
| `framework` | **解题框架**：你的固定解题步骤（IP 的核心，静态展示） |
| `gaokao_focus` | **高考考向**：高考侧重 / 易考点（可空） |
| `evidence_targets` | **证据高亮**：AI 该在正文里高亮哪些触发词 |
| `answer_logic` | **答案逻辑**：有提示词=形变规则(base→form)；无提示词=该补什么 |

---

## 考点树（全量 leaf，自讲义誊写 — 逐条待对齐）

| facet_key | label_zh | parent_key | 状态 |
| --- | --- | --- | --- |
| `grammar-fill` | 语法填空 | | 根 |
| `grammar-fill.given` | 有提示词（找主谓宾） | `grammar-fill` | |
| `grammar-fill.given.verb` | 动词（2-4个） | `grammar-fill.given` | |
| `grammar-fill.given.verb.finite` | 谓语动词 | `grammar-fill.given.verb` | **★模板，下方详写** |
| `grammar-fill.given.verb.non-finite` | 非谓语动词 | `grammar-fill.given.verb` | 待对齐 |
| `grammar-fill.given.noun` | 名词（≥1） | `grammar-fill.given` | 数+所有格（词性转换已抽出） |
| `grammar-fill.given.adjective` | 形容词（≥1） | `grammar-fill.given` | 待对齐 |
| `grammar-fill.given.derivation` | 词性转换 | `grammar-fill.given` | **独立 facet（PO 确认）** |
| `grammar-fill.given.derivation.noun-to-adj` | 名词→形容词 | `grammar-fill.given.derivation` | 常考 |
| `grammar-fill.given.derivation.verb-to-noun` | 动词→名词 | `grammar-fill.given.derivation` | 常考 |
| `grammar-fill.given.derivation.verb-to-adj` | 动词→形容词 | `grammar-fill.given.derivation` | 常考 |
| `grammar-fill.given.pronoun` | 代词 | `grammar-fill.given` | 待对齐 |
| `grammar-fill.given.numeral` | 数词 | `grammar-fill.given` | 待对齐 |
| `grammar-fill.no-hint` | 无提示词（判 n+1） | `grammar-fill` | |
| `grammar-fill.no-hint.preposition` | 介词（1个） | `grammar-fill.no-hint` | 待对齐 |
| `grammar-fill.no-hint.article` | 冠词（1个） | `grammar-fill.no-hint` | 待对齐 |
| `grammar-fill.no-hint.pronoun` | 代词 | `grammar-fill.no-hint` | 待对齐 |
| `grammar-fill.no-hint.conjunction` | 连词 | `grammar-fill.no-hint` | |
| `grammar-fill.no-hint.conjunction.coordinating` | 并列连词 | `grammar-fill.no-hint.conjunction` | 待对齐 |
| `grammar-fill.no-hint.conjunction.relative-clause` | 定语从句 | `grammar-fill.no-hint.conjunction` | 待对齐 |
| `grammar-fill.no-hint.conjunction.noun-clause` | 名词性从句 | `grammar-fill.no-hint.conjunction` | 待对齐 |
| `grammar-fill.no-hint.conjunction.adverbial-clause` | 状语从句 | `grammar-fill.no-hint.conjunction` | 待对齐 |

> 注：代词在 given（主格/宾格/形容词性/名词性/反身）和 no-hint（it 形式主宾 / that-those-one-ones
> 替代）都出现，故拆为两个 facet。从句是否拆成独立 leaf、还是并入「连词（带谓语）」，待对齐。

### given 分支总原则（PO 确认 2026-05-31）

**从给定提示词出发：提示词的词性 = 进入哪条 given 子分支的总闸。**
- 给定**动词原形** → `verb`（再由 N+1 判定 `finite` 谓语 / `non-finite` 非谓语）。
- 给定**名词** → `noun`；给定**形容词** → `adjective`；给定**代词** → `given.pronoun`；
  给定**数词** → `numeral`。
- AI 定 facet 的第一步永远是「看提示词是什么词性」。
- **词性转换例外（PO 确认 2026-05-31）**：当空需要的词性 ≠ 提示词词性时，归入独立 facet
  `grammar-fill.given.derivation`，按「从什么词性→什么词性」分子叶。常考方向：名词→形容词、
  动词→名词、动词→形容词。（即 facet 看「目标词性」，不看提示词。）

---

## ★ 模板详写：`grammar-fill.given.verb.finite` 谓语动词

- **blank_type**: `given`
- **recognize（识别信号）**: 前提——提示词是**动词原形**。**N+1 判断**：一句里的谓语动词数 =
  「带出谓语的连词数」+ 1。据此判断本空是否填谓语动词（若谓语槽位未满 → 谓语；若已满 → 非谓语）。
  tips: 一句里可按「一个主动一个被动」预设。
- **framework（解题框架·你的IP）**:
  1. **一找**：确定主语的「数」和谓语（主谓一致）。
  2. **二判语态**：主语与该动作是主动还是被动。
  3. **三判时态**：落实这个动作到底发生在什么时候。
     - 时间标志词 → 锁定一般现在 / 一般过去。
     - #一般现在时：相对不变的客观描述（节日描述 / 人·物的性质功能 / 道理真理）。
     - #一般过去时：发生在过去的动作或状态。
- **gaokao_focus**: 主谓一致 + 时态语态的综合；客观描述/真理用一般现在时是高频陷阱。
- **evidence_targets（证据高亮）**: 主语（定数与语态）、时间标志词（定时态）、并列谓语/连词
  （定时态呼应）。
- **answer_logic（形变）**: base 动词 → 按「数 × 语态 × 时态」变位。
  例：`he`（单数）× 主动 × 过去（`Yesterday`）→ `wear` → **wore**。

---

## `grammar-fill.given.verb.non-finite` 非谓语动词（一般 2-3 个）— 待 PO 对齐

- **blank_type**: `given`
- **recognize（识别信号）**: 前提——提示词是**动词原形**。N+1 判断后该位置**不需要**再加谓语动词
  （谓语槽已满）→ 填非谓语。
- **framework（解题框架·框架123）**:
  1. **判位置 → 定成分**（在句中什么位置，作什么成分）。定成分有两个作用：① 为第 2 步判主被动
     提供逻辑主语；② 决定第 3 步走「快路」还是「慢路」。
  2. **选逻辑主语 → 判主被动**。
  3. **按形变表锁定形式 — 算法按成分分两路（PO 确认 2026-05-31）**：
     - **快路｜作主语 / 宾语 / 表语 / 宾补**：由**固定搭配或具体辨析情形直接锁定形变表的某一行**
       （例：`want` → `want to do` 锁「不定式」行；介词后 / `enjoy` 类 → 锁「doing」行）。
       锁行后**只需判主被动**即得答案。
     - **慢路｜作定语 / 状语**：**走表格**（自上而下）——
       1. 先测「不定式作定语/状语」条件是否满足：
       2. **满足** → 锁「不定式」行（`to do` / `to be done`）→ 判主被动 → 答案。
       3. **不满足** → 删掉不定式行 → 判主被动（在 doing 系 / done 系间选）→ 再判进行/完成 → 答案。
  > 即：快路只判一个主被动；慢路先淘汰不定式行，再主被动，（完成/进行）。
- **形变表（成分 × 主/被动）**:

  | 含义 | 主动 | 被动 |
  | --- | --- | --- |
  | 同时进行（伴随状语）/ 进行 / 正在进行 | `doing` | `being done` |
  | 完成 | （无）| `done`（也可只表状态）|
  | 不定式作定语 / 状语 | `to do` | `to be done` |

- **7 种成分（位置判定 → 定成分）**:
  - **作主语**：非谓语整体动作（事情）在谓语动词/系动词**之前**。（回忆 to do 与 doing 作主语的区别）
  - **作表语**：在系动词之后 / 形容词做表语。（不定式 vs 动名词作表语；done 与 v-ing 作表语＝形容词的区别）
  - **作宾语**：在谓语动词或介词之后。（介词后接动名词；记常见接动名词的谓语动词，及含介词 to）
  - **作定语（有修饰性）**：单词作前置定语紧贴被修饰名词**之前**〔#高考考向：现在分词/过去分词作前置定语〕；
    短语作后置定语紧跟被修饰名词**之后**。
  - **作状语**：与主句隔开，常用**逗号**隔开（修饰动作）。-独立主格结构 -表状态的系表结构。
  - **作宾补**：谓语动词+宾语+宾补 / `with` 复合结构。① 一般用 to do；② 感官动词（4 种形式）；
    ③ 使役 make/let/have/get（2233）；④ catch/keep/find/leave（1234）；⑤ with+宾语+非谓语。
  - **作主补**（从宾补的被动视角）：谓语动词+宾补。感官/使役省略的 to 需还原。
- **#不定式作定语**：① 序数词/最高级/the only·the very·the last 之后或其修饰的名词之后；
  ② 抽象名词之后（解释该抽象名词内容）；③ 表将来动作。
- **#不定式作状语**：① 表「为了」作目的状语；② adj 后作状语；③ only to 表意料之外的结果。
- **只表状态的 done**：be dressed in / be absorbed in。
- **gaokao_focus**: 现在分词 vs 过去分词作前置定语；作状语的主被动（逻辑主语）。
- **evidence_targets（证据高亮）**: 非谓语所处**位置**（谓语前/系动词后/介词后/名词前后/逗号隔开）、
  **逻辑主语**、宾补结构里的谓语动词（感官/使役/catch keep find leave）、被修饰的名词。
- **answer_logic（形变）**: base → {`doing` / `being done` / `done` / `to do` / `to be done`}，
  由「成分 × 主被动 ×（完成/进行）」决定。

- **role 标注（PO 确认 (A) 2026-05-31）**: 非谓语每空 AI 额外标注 `role`（主语/宾语/表语/定语/
  状语/宾补/主补）+ `path`（快路/慢路）。成分是解题主线枢纽（决定走哪条路），值得结构化，render
  可显、可统计。证据高亮含「固定搭配触发词」（锁行的那个 `want`/介词/`enjoy` 等）。「暂时够」，不再加。

---

---

## `grammar-fill.given.noun` 名词（≥1）— 待 PO 对齐

- **blank_type**: `given`
- **recognize**: 提示词是名词，且空需要的也是名词（变形/变数/所有格）。提示词是名词但空需别的词性
  → 走 `derivation`。
- **framework / 考点两类**（词性转换已抽到 `derivation`）:
  1. **变复数（数）**。
  2. **变所有格**（`'s`）。
- **gaokao_focus**: 单复数由限定词/谓语/语境决定；不可数名词不加复数。
- **evidence_targets**: 限定词（a/the/数词/this·these）、`of` 结构、谓语单复数（主谓一致回指）、
  可数/不可数线索。
- **answer_logic**: 给定名词 → 单/复数 或 所有格（由限定词/谓语/语境定）。

---

## `grammar-fill.given.derivation` 词性转换 — 待 PO 对齐

- **blank_type**: `given`
- **recognize（PO 确认 2026-05-31）**: 空需要的词性 ≠ 提示词词性 → 词性转换。按「从→到」分：
  - `noun-to-adj` 名词→形容词（如 health→healthy）
  - `verb-to-noun` 动词→名词（如 decide→decision）
  - `verb-to-adj` 动词→形容词（如 surprise→surprising/surprised）
- **framework**: ① 由空的句法位置/搭配判定**目标词性**（缺定语/表语→形容词；缺主宾→名词）；
  ② 把提示词派生为该词性的正确形式（注意 v→adj 的 -ing/-ed 之分＝主被动/情感）。
- **gaokao_focus**: 动→形的 -ing（令人…）vs -ed（感到…）之分；名↔形常见词族。
- **evidence_targets**: 决定目标词性的句法信号（被修饰的名词、系动词、冠词/限定词、主宾位置）。
- **answer_logic**: 提示词 → 目标词性的派生形（v→adj 还要判 -ing/-ed）。

- **形→副归属（PO 确认 (1) 2026-05-31）**: 「形容词→副词（变副词）」**不**进 derivation；它是
  `adjective` facet 的首要默认动作。derivation 只含跨类三方向 名→形 / 动→名 / 动→形。

---

## `grammar-fill.given.adjective` 形容词（≥1）— 待 PO 对齐

- **blank_type**: `given`
- **recognize**: 提示词是形容词（且空需要形容词/副词/比较级——非"变成别的词类"，那走 derivation）。
- **framework / 考点两类**（词性转换已抽到 `derivation`）:
  1. **优先考虑变副词（形→副）**：若空在修饰形容词/副词/动词/整句 → 变副词。这是给定形容词的**默认首选**。
  2. **比较级 / 最高级**：① 识别明显提示词 `than` / `far` / `even` / `the+最高级`；② 结合句意考虑暗含比较。
- **gaokao_focus**: 暗含比较（无明显 than 也要比较级）；变副词的修饰对象判定。
- **evidence_targets**: 被修饰对象（动词/形容词/副词/整句 → 判变副词）、比较标志词（than/even/far/the…）、
  句意暗含比较的线索。
- **answer_logic**: 给定形容词 → {副词 | 比较级 | 最高级 | 原级}，由句法（修饰对象）+ 比较标志决定。

---

## `grammar-fill.given.pronoun` 代词（给定）— 待 PO 对齐

- **blank_type**: `given`
- **recognize**: 提示词是代词。
- **framework**: 由句法位置定形式——① 主格/宾格（主语→主格；宾语/介词后→宾格）；
  ② 形容词性物主代词（+名词）/ 名词性物主代词（独立使用）；③ 反身代词（宾语与主语同指）。
- **gaokao_focus**: 反身代词（同指）；物主代词形容词性 vs 名词性。
- **evidence_targets**: 指代的先行词、句法位置（主/宾/介词后）、其后是否接名词。
- **answer_logic**: 给定代词 → 对应「格 / 物主性 / 反身」形式。

---

## `grammar-fill.given.numeral` 数词 — 待 PO 对齐

- **blank_type**: `given`
- **recognize**: 提示词是数词（基数词）。
- **framework**: 基数词变序数词（看序数标志：`the+序数`、日期、排序语境）。
- **gaokao_focus**: 基数 → 序数。
- **evidence_targets**: `the` / 排序或日期语境。
- **answer_logic**: 基数 → 序数（或保持基数）。

---

---

## no-hint 分支总原则（待 PO 对齐）

无提示词（判 n+1）。AI 定 facet 靠**位置 + 是否带出新谓语**：
- 空**带出一个新谓语**（多一套主谓）→ `conjunction`（从属/并列），再分 定从 / 名词性从句 / 状从 / 并列。
  （n+1：谓语数 = 带谓语连词数 + 1，缺连词就在此填。）
- 空**不带新谓语、连接并列成分** → `conjunction.coordinating` 并列连词。
- 空**紧贴名词作限定** → `article` 冠词。
- 空**引出介宾（其后名词/代词）或构成介词搭配** → `preposition` 介词。
- 空**处在名词位置作替代/形式主宾** → `no-hint.pronoun` 代词。

> PO 待对齐：这个"位置+是否带谓语"的判定闸对吗？有没有更顺手的判定顺序？

---

## `grammar-fill.no-hint.preposition` 介词（1 个）— 待 PO 对齐

- **blank_type**: `no-hint`
- **recognize**: 空后接名词/代词（介宾），或 动词/形容词 + 空 构成介词搭配；不带出新谓语。
- **framework**: ① 常见**固定搭配**；② 一定要了解各介词的**本意**（时间/地点/方式/方向…）。
- **gaokao_focus（#高考考向）**: 本意，或简单固定搭配中**插入修饰成分**（搭配被定语/状语隔开，迷惑性）。
- **高考介词词频（高→低，PO 讲义）**: for(15) · to(8) · at(6) · by(6) · on(6) · in(6) · as(5) ·
  from(4) · with(4) · of(3) · after(1) · behind(1) · into(1) · till(1) · until(1) · without(1)。
- **evidence_targets**: 搭配的核心词（动词/名词/形容词）、介词宾语、本意线索（时间/地点/方式词）。
- **answer_logic**: 补一个介词，由固定搭配或本意定。

---

## `grammar-fill.no-hint.article` 冠词（1 个）— 待 PO 对齐

- **blank_type**: `no-hint`
- **recognize**: 空紧贴名词作限定（名词前，无提示词）。
- **framework — 本质（PO 黄学伟 与小川 2026-05-31 深度对齐，有语言学背书）**:

  **一句话本质：特指 vs 泛指 = 可识别性。**
  - **the = 特指 = 可识别**：能锁定"是哪一个"。
  - **a/an = 泛指 = 种类**：一类中的一个，锁不定。（PO 洞察：**"种类"就是"泛指"的本质**。）

  **the 特指三类**（都是"可识别/拥有"的具体表现）：
  1. **复指特指（回指）**：前文出现过的名词前（可同义不同词）。
  2. **限定性特指**：被 `of` 短语 / 后置定语限定的名词前 —— ⚠️ **不是有 of 就 the**（见下操作测试）。
  3. **含意性特指**：共享语境中双方都能识别的名词前。
  - **a/an** 非特指/泛指；a/an 按**首音素**（元音音素用 an：university→a、X-ray→an、hour→an）。

- **操作测试（怎么判，不靠猜"识别不识别"）—— "N of Y" 型冠词空**:
  > **of 后面那个，是 N 的"主人"吗？（Y 拥有/具有 N 吗 / 能否改写成 Y's N）**
  > - 是主人（拥有/属性）→ 特指 → **the**：history of Beijing→Beijing's history✓；culture of
  >   grassroots Beijingers✓；price of fashion✓。
  > - 不是主人，of 只说"哪一类/关于啥"（**描述性属格 descriptive genitive**）→ 泛指 → **a**：
  >   way of dressing（≠dressing's way）、sense of humour、way of life。
  - **学生陷阱（中文"的"）**：中文"北京**的**历史"(拥有) 和 "穿衣**的**方式"(种类) 都用"的"，
    要拆开——拥有的"的"→the，种类的"的"→a。
- **诚实的边界（AI 不可当万能公式！）**: 上面是**主线规律 + 残余例外**，不是铁律。残余靠固定搭配/
  语感兜底：① 部分关系 partitive：`the number of`(数量) vs `a number of`(许多)、`a piece of`；
  ② part-whole `the top of the hill`/`the use of`（改's 勉强仍 the）；③ 's 偏爱有生命主人，无生命所属
  (the leg of the table) 改写信号弱。冠词有一块是**纯习惯用法**，无规则能 100% 覆盖。
- **固定搭配（先查，命中直接出，不走上面逻辑）**: `the`—in the end、as a result、on the whole、
  play the piano…；`a/an`—for a while、in a hurry、take a break、once in a while…
- **gaokao_focus**: 三类特指辨析；of 短语的"拥有 vs 种类"；a/an 首音素。
- **evidence_targets**: 前文同指名词（复指）、`of` 后的"主人/种类"词（限定性）、共享语境线索（含意性）、
  名词首音素（a/an）、命中的固定搭配。
- **answer_logic**: 补 `the` / `a` / `an`（语法填空空必须填，不取零冠词）。先查固定搭配 → 再 of 的
  拥有/种类测试 → 再回指/含意 / 新引入信号。

---

## `grammar-fill.no-hint.pronoun` 代词（无提示词）— 待 PO 对齐

- **blank_type**: `no-hint`
- **recognize**: 空在名词位置（主语 / 动词或介词的宾语），需要代词来**指代/替代**前文，或填 **it** 的
  **特殊句式**（形式主语/形式宾语/强调句）。（**they 基本不作无提示词答案**，主考 it / that·those / one·ones。）
- **framework — 三条岔路**:
  1. **it** — 四种用法：
     - ① **指代**前文那个本身（完全同一个、同一情况），**不在比较结构里**。
     - ② **形式主语**：`It` + be + adj/n + **to do / that 从句**（真主语后置）。
     - ③ **形式宾语**：V + `it` + 宾补 + **to do / that 从句**（find/make/think `it` hard to…）。
     - ④ **强调句（it-cleft）**：`It` is/was + 被强调成分 + **that/who** + 其余。
       判据：去掉 `It is/was … that` 后，剩下的仍是**完整句子**（区别于形式主语：那个去掉后不完整）。
  2. **that / those** — **替代词，标志是"比较结构"**（PO 切法 2026-05-31）：替代"the + 名词（+ of Y）"，
     指**同类、另一份**。比较结构两种：① **比较级比较** larger/better… **than** *that* of…；
     ② **different 比较** different **from** *that* of…。that 替不可数/单数可数；those 替复数。
  3. **one / ones** — **替代词**：替代"**同类中泛泛的一个**"。one 替单数；ones 替复数。
- **本质（接回冠词那根主线 — 特指 vs 泛指）**:
  - **it = the same（同一个本身）**、**that/those ≈ "the one(s)"（同类·特定的那个）** → 都是**特指**（the 家族）。
  - **one/ones ≈ "a one(s)"（同类·泛泛一个）** → **泛指**（a 家族）。
  - **操作判（PO 切法）**：① 看到**比较/对比结构**（than / different from / similar to / the same as…）
    → **that(单·不可数)/those(复)**；② 指前文**同一个本身**，或命中 **it 特殊句式**（形式主语/形式宾语/
    强调句）→ **it**；③ 指**泛泛同类的可数一个/些** → **one/ones**。
- **gaokao_focus**: that/those vs one/ones（特指替代 vs 泛指替代）；**it 强调句**（It is/was…that…）；
  it 形式主宾 vs 真指代。
- **evidence_targets**: 被指代/替代的**先行词**（在上文）、句法位置（主/宾/介词后）、比较/对比结构里的
  对比对象（than that of… 型）、**强调句框架 It…that** 与被强调成分、形式主宾的真主语/真宾语
  （to do / that 从句）、先行词的可数性与单复数。
- **answer_logic**: 补 it / that / those / one / ones（由"特指 vs 泛指 × 单复数/可数性"定）。

---

## `grammar-fill.no-hint.conjunction` 连词 — 子闸 + 四类（待 PO 对齐）

**连词子闸**（确定是连词后，先分两支）：
- 连接**对等的成分/分句**（无主从、不引出从句作成分）→ **并列连词**。
- **引出一个从句**（带出新谓语、有主从）→ **三大从句**，再按两步分：
  1. **看位置**：空前有**先行词（名/代词）**→ 定语从句；从句占**名词成分位置**（主/宾/表）→ 名词性从句；
     **前后两句都完整**、逻辑连接 → 状语从句。
  2. **看缺成分**：从句**缺主/宾/表** → 用"代词类"引导词；**不缺**（缺的是状语或不缺）→ 用"副词类/单纯连词"。

### `…conjunction.coordinating` 并列连词
- **recognize**: 连接对等的词/短语/分句，无主从，不引出作成分的从句。
- **framework**: 按逻辑选——顺承并列 `and`、转折 `but`/`yet`、选择 `or`、因果 `for`/`so`。
  关联结构：`both…and`、`either…or`、`neither…nor`、`not only…but (also)`、`not…but`、`whether…or`。
- **gaokao_focus**: 关联词配对（neither/nor、either/or）、not only…but also、`while` 对比（弱逻辑）。
- **evidence_targets**: 被连接的两个对等成分、逻辑关系信号。
- **answer_logic**: 补并列连词。

### `…conjunction.relative-clause` 定语从句
- **recognize**: 空前有**先行词（名词/代词）**，从句修饰它，空作引导词。
- **framework**: ① 判从句**缺什么成分**：缺主/宾/表 → 关系代词；不缺（缺状语）→ 关系副词。
  ② 试代入 `whose`（前后名词有从属关系）。③ 据指代（人/物/时间/地点）选词。
- **引导词**：关系代词（从句缺主/宾/表）`who/whom/which/that/whose/as`；关系副词（不缺·作状语）`when/where/why`。
- **gaokao_focus**: whose 的从属关系；as（as 引导，常 the same…as / such…as）；介词+which/whom。
- **evidence_targets**: **先行词**、从句中**缺的成分位置**。
- **answer_logic**: 补关系词（关系代词/关系副词）。

### `…conjunction.noun-clause` 名词性从句
- **recognize**: 从句整体在主句作**成分**（主/宾/表/同位语），空前**无先行词**，空作引导词。
- **framework**: ① 判从句**缺什么成分**：缺主/宾/表 → 连接代词；不缺但有疑问义 → 连接副词；
  不缺且无疑问义 → 单纯连词。② 据句意选词。
- **引导词**：连接代词（缺成分）`what/who/whom/which/whose`；连接副词（不缺）`how/why/when/where`；
  单纯连词（不缺）`that / whether·if / as if / because`。
- **gaokao_focus**: what（缺成分）vs that（不缺）；whether vs if 的位置限制。
- **evidence_targets**: 从句所占的**主句成分位置**（主/宾/表）、从句中缺的成分。
- **answer_logic**: 补引导词。

### `…conjunction.adverbial-clause` 状语从句
- **recognize**: **主、从两句都完整**（都不缺成分），从句作状语修饰主句，空作从属连词。
- **framework**: 看主从句**逻辑关系**选从属连词——时间 `when/while/as/until·till/before/after`、
  条件 `if/unless`、原因 `because/as/since`、让步 `although·though`、对比 `while`、目的/结果等。
- **gaokao_focus**: `as` 多义（当/因为/随着/正如）、`while` 对比、until/till、连词 vs 介词混淆。
- **evidence_targets**: 主、从两个**完整句**、它们之间的**逻辑关系**。
- **answer_logic**: 补从属连词。

---

## 字段 shape — PO 已确认 2026-05-31

7 字段够用，「谓语动词」framework 措辞 OK。recognize 已按 PO 修正（提示词词性总闸 + N+1）。
（「易错点」字段：PO 暂未要，按需后加。）
