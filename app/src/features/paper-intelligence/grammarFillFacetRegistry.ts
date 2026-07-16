/**
 * Grammar-Fill Facet Framework Registry (I14 GATE-2).
 *
 * Static client-side registry transcribed verbatim from the KB:
 *   docs/cuts/I13-grammar-fill-analysis/grammar-fill-facets-v1.md
 *
 * PO teaching IP — fidelity is load-bearing. Do NOT paraphrase.
 *
 * D1 (grammar-facets-v2, 2026-07-15 owner-locked semantics —
 * docs/cuts/similar-questions/program.md §语法填空考点粒度终稿 /
 * §词形转换重铸): old `given.noun` / `given.adjective` /
 * `given.derivation.*` (17-leaf v1) retired — split into `given.noun.number`
 * / `given.noun.genitive` / `given.adjective.comparison` (三个新独立考点，
 * 词性不变不算转换) + `given.conversion.<src>-to-<dst>` 词形转换八向矩阵.
 * The split entries below reuse the original v1 prose verbatim where it maps
 * 1:1 (fidelity preserved), only reorganized under the new key names.
 *
 * Drift guard: the 22 keys here MUST exactly equal the server-side
 *   server/paper-import-ai/grammar-fill-facets-v2.json keys.
 *   The verifier (verify-i14-grammar-fill-analysis-surface.mjs /
 *   verify-grammar-facets-v2.mjs) asserts this.
 *
 * Only `grammar-fill.given.verb.non-finite` uses `table` (the 形变表).
 */

export type FrameworkTable = {
  caption: string
  columns: string[]
  rows: string[][]
}

export type FrameworkBody = {
  steps: string[]
  table?: FrameworkTable
  notes?: string[]
}

export type FacetFrameworkEntry = {
  labelZh: string
  framework: FrameworkBody
}

export const FACET_FRAMEWORKS: Record<string, FacetFrameworkEntry> = {
  'grammar-fill.given.verb.finite': {
    labelZh: '谓语动词',
    framework: {
      steps: [
        '一找：确定主语的「数」和谓语（主谓一致）。',
        '二判语态：主语与该动作是主动还是被动。',
        '三判时态：落实这个动作到底发生在什么时候。时间标志词 → 锁定一般现在 / 一般过去。#一般现在时：相对不变的客观描述（节日描述 / 人·物的性质功能 / 道理真理）。#一般过去时：发生在过去的动作或状态。',
      ],
      notes: [
        '高考考向：主谓一致 + 时态语态的综合；客观描述/真理用一般现在时是高频陷阱。',
        '答案逻辑：base 动词 → 按「数 × 语态 × 时态」变位。',
      ],
    },
  },

  'grammar-fill.given.verb.non-finite': {
    labelZh: '非谓语动词',
    framework: {
      steps: [
        '第一步｜判位置 → 定成分（在句中什么位置，作什么成分）。定成分有两个作用：① 为第 2 步判主被动提供逻辑主语；② 决定第 3 步走「快路」还是「慢路」。',
        '第二步｜选逻辑主语 → 判主被动。',
        '第三步｜按形变表锁定形式 — 算法按成分分两路：快路｜作主语 / 宾语 / 表语 / 宾补：由固定搭配或具体辨析情形直接锁定形变表的某一行（例：want → want to do 锁「不定式」行；介词后 / enjoy 类 → 锁「doing」行）。锁行后只需判主被动即得答案。慢路｜作定语 / 状语：走表格（自上而下）——先测「不定式作定语/状语」条件是否满足；满足 → 锁「不定式」行（to do / to be done）→ 判主被动 → 答案；不满足 → 删掉不定式行 → 判主被动（在 doing 系 / done 系间选）→ 再判进行/完成 → 答案。即：快路只判一个主被动；慢路先淘汰不定式行，再主被动，（完成/进行）。',
      ],
      table: {
        caption: '形变表（成分 × 主/被动）',
        columns: ['含义', '主动', '被动'],
        rows: [
          ['同时进行（伴随状语）/ 进行 / 正在进行', 'doing', 'being done'],
          ['完成', '（无）', 'done（也可只表状态）'],
          ['不定式作定语 / 状语', 'to do', 'to be done'],
        ],
      },
      notes: [
        '7 种成分（位置判定）：作主语——非谓语整体动作（事情）在谓语动词/系动词之前；作表语——在系动词之后 / 形容词做表语；作宾语——在谓语动词或介词之后（介词后接动名词；记常见接动名词的谓语动词，及含介词 to）；作定语（有修饰性）——单词作前置定语紧贴被修饰名词之前〔#高考考向：现在分词/过去分词作前置定语〕；短语作后置定语紧跟被修饰名词之后；作状语——与主句隔开，常用逗号隔开（修饰动作）；作宾补——谓语动词+宾语+宾补 / with 复合结构；作主补（从宾补的被动视角）。',
        '#不定式作定语：① 序数词/最高级/the only·the very·the last 之后或其修饰的名词之后；② 抽象名词之后（解释该抽象名词内容）；③ 表将来动作。',
        '#不定式作状语：① 表「为了」作目的状语；② adj 后作状语；③ only to 表意料之外的结果。',
        '只表状态的 done：be dressed in / be absorbed in。',
        '高考考向：现在分词 vs 过去分词作前置定语；作状语的主被动（逻辑主语）。',
      ],
    },
  },

  'grammar-fill.given.noun.number': {
    labelZh: '名词的数',
    framework: {
      steps: [
        '由限定词（a/the/数词/this·these）、of 结构、谓语单复数（主谓一致回指）、可数/不可数线索确定单复数。',
      ],
      notes: [
        '高考考向：单复数由限定词/谓语/语境决定；不可数名词不加复数。',
        '注：提示词是名词但空需别的词性/别的名词派生 → 走 given.conversion.noun-to-*。',
      ],
    },
  },

  'grammar-fill.given.noun.genitive': {
    labelZh: '名词的格',
    framework: {
      steps: [
        '由语境判定是否需要所有格（\'s）——通常是"谁的/属于谁"的所属关系。',
      ],
      notes: [
        '高考考向：所有格与 of 短语属格的取舍；语境判所属而非泛泛描述。',
      ],
    },
  },

  'grammar-fill.given.adjective.comparison': {
    labelZh: '形容词比较等级',
    framework: {
      steps: [
        '比较级 / 最高级：① 识别明显提示词 than / far / even / the+最高级；② 结合句意考虑暗含比较（无明显 than 也可能需要比较级）。',
        '不规则比较级/最高级需单独记忆（good→better→best、bad→worse→worst、far→further/farther…）。',
      ],
      notes: [
        '高考考向：暗含比较（无明显 than 也要比较级）。',
        '答案逻辑：给定形容词 → {比较级 | 最高级}，由比较标志 + 句意决定；词性不变，不是词形转换。',
      ],
    },
  },

  'grammar-fill.given.conversion.noun-to-noun': {
    labelZh: '词形转换（名词→名词）',
    framework: {
      steps: [
        '第一步｜由空的句法位置/搭配判定目标含义：仍是名词，但需要一个由提示词派生出的不同名词（同词性，不同的词）。',
        '第二步｜把提示词（名词）派生为目标名词的正确形式（常见：职业/身份后缀 -er/-or，如 photograph→photographer）。',
      ],
      notes: [
        '高考考向：职业/身份名词化（-er/-or）等同词性派生，与"变复数/变所有格"（数/格，词形不变）区分。',
        '识别信号：空仍是名词，但不是提示词本身的单复数/所有格变化，而是另一个派生词。',
      ],
    },
  },

  'grammar-fill.given.conversion.noun-to-adjective': {
    labelZh: '词形转换（名词→形容词）',
    framework: {
      steps: [
        '第一步｜由空的句法位置/搭配判定目标词性：缺定语/表语 → 形容词。',
        '第二步｜把提示词（名词）派生为形容词的正确形式（注意常见词族，如 health→healthy）。',
      ],
      notes: [
        '高考考向：名↔形常见词族；名词→形容词派生。',
        '识别信号：空需要的词性 ≠ 提示词词性（名词），且目标词性为形容词。',
      ],
    },
  },

  'grammar-fill.given.conversion.noun-to-verb': {
    labelZh: '词形转换（名词→动词）',
    framework: {
      steps: [
        '第一步｜由空的句法位置判定目标词性：空在谓语/非谓语动词位置 → 动词。',
        '第二步｜把提示词（名词）派生/转用为动词的正确形式，再按谓语/非谓语规则变形。',
      ],
      notes: [
        '高考真题库中此方向罕见（预留位）——如实标注，池子小属正常，不强行凑例。',
        '识别信号：空需要的词性 ≠ 提示词词性（名词），且目标词性为动词。',
      ],
    },
  },

  'grammar-fill.given.conversion.adjective-to-adverb': {
    labelZh: '词形转换（形容词→副词）',
    framework: {
      steps: [
        '若空在修饰形容词/副词/动词/整句 → 变副词。这是给定形容词最常见的转换方向。',
      ],
      notes: [
        '高考考向：变副词的修饰对象判定（修饰动词/形容词/副词/整句）。',
        '答案逻辑：给定形容词 → 副词（通常 -ly），由句法（修饰对象）决定。',
      ],
    },
  },

  'grammar-fill.given.conversion.adjective-to-noun': {
    labelZh: '词形转换（形容词→名词）',
    framework: {
      steps: [
        '第一步｜由空的句法位置/搭配判定目标词性：介词后 / 缺主宾 / 限定词后 → 名词。',
        '第二步｜把提示词（形容词）派生为名词的正确形式（常见后缀 -ity/-ty：curious→curiosity、accurate→accuracy；-ness：happy→happiness、rich→richness；-ce/-cy：confident→confidence、absent→absence；-ment）。',
      ],
      notes: [
        '高考考向：介词 + 抽象名词搭配（with curiosity / in surprise / with pride / in silence）；形容词名化后缀。',
        '识别信号：空需要的词性 ≠ 提示词词性（形容词），且目标词性为名词。',
      ],
    },
  },

  'grammar-fill.given.conversion.verb-to-adjective': {
    labelZh: '词形转换（动词→形容词）',
    framework: {
      steps: [
        '第一步｜由空的句法位置/搭配判定目标词性：缺定语/表语 → 形容词。',
        '第二步｜把提示词（动词）派生为非分词形容词的正确形式（真形容词后缀 -able/-ous/-ful/-ive 或 a- 前缀：remark→remarkable / harm→harmful / sleep→asleep）。',
      ],
      notes: [
        '收窄（PO 2026-06-19，句法功能优先）：仅取非分词形容词派生；情感/状态分词（excited/educated/closed/astonished）作表语/定语/宾补/主补一律归 grammar-fill.given.verb.non-finite + role，不入此叶。',
        '识别信号：空需要的词性 ≠ 提示词词性（动词），且目标词性为非分词形容词（-able/-ous/-ful/-ive、a-）。',
      ],
    },
  },

  'grammar-fill.given.conversion.verb-to-noun': {
    labelZh: '词形转换（动词→名词）',
    framework: {
      steps: [
        '第一步｜由空的句法位置/搭配判定目标词性：缺主宾 → 名词。',
        '第二步｜把提示词（动词）派生为名词的正确形式（如 decide→decision）。',
      ],
      notes: [
        '高考考向：动→名派生；常见动名词形式（-tion/-sion/-ment/-ing）。',
        '识别信号：空需要的词性 ≠ 提示词词性（动词），且目标词性为名词。',
      ],
    },
  },

  'grammar-fill.given.conversion.verb-to-adverb': {
    labelZh: '词形转换（动词→副词）',
    framework: {
      steps: [
        '第一步｜由空的句法位置判定目标词性：修饰动词/形容词/副词/整句 → 副词。',
        '第二步｜把提示词（动词）派生为副词的正确形式（通常先派生形容词再加 -ly）。',
      ],
      notes: [
        '高考真题库中此方向罕见（预留位）——如实标注，池子小属正常，不强行凑例。',
        '识别信号：空需要的词性 ≠ 提示词词性（动词），且目标词性为副词。',
      ],
    },
  },

  'grammar-fill.given.pronoun': {
    labelZh: '代词（给定）',
    framework: {
      steps: [
        '由句法位置定形式——主格/宾格：主语 → 主格；宾语/介词后 → 宾格。',
        '形容词性物主代词（+名词）vs 名词性物主代词（独立使用）。',
        '反身代词：宾语与主语同指。',
      ],
      notes: [
        '高考考向：反身代词（同指）；物主代词形容词性 vs 名词性。',
        '证据：指代的先行词、句法位置（主/宾/介词后）、其后是否接名词。',
      ],
    },
  },

  'grammar-fill.given.numeral': {
    labelZh: '数词',
    framework: {
      steps: [
        '识别序数标志：the+序数、日期、排序语境。',
        '基数词变序数词（如 one→first、two→second、three→third…）。',
      ],
      notes: [
        '高考考向：基数 → 序数。',
        '证据：the / 排序或日期语境。',
      ],
    },
  },

  'grammar-fill.no-hint.preposition': {
    labelZh: '介词',
    framework: {
      steps: [
        '第一步｜先查常见固定搭配（动词/名词/形容词 + 介词搭配）。',
        '第二步｜若无命中搭配，根据介词本意（时间/地点/方式/方向…）判断。',
      ],
      notes: [
        '高考考向（#高考考向）：本意，或简单固定搭配中插入修饰成分（搭配被定语/状语隔开，迷惑性）。',
        '高考介词词频（高→低）：for(15) · to(8) · at(6) · by(6) · on(6) · in(6) · as(5) · from(4) · with(4) · of(3) · after(1) · behind(1) · into(1) · till(1) · until(1) · without(1)。',
        '答案逻辑：补一个介词，由固定搭配或本意定。',
      ],
    },
  },

  'grammar-fill.no-hint.article': {
    labelZh: '冠词',
    framework: {
      steps: [
        '一句话本质：特指 vs 泛指 = 可识别性。the = 特指 = 可识别（能锁定"是哪一个"）；a/an = 泛指 = 种类（一类中的一个，锁不定）。',
        'the 特指三类：① 复指特指（回指）：前文出现过的名词前（可同义不同词）；② 限定性特指：被 of 短语 / 后置定语限定的名词前——⚠️ 不是有 of 就 the（见操作测试）；③ 含意性特指：共享语境中双方都能识别的名词前。',
        '操作测试（"N of Y"型冠词空）：of 后面那个，是 N 的"主人"吗？（Y 拥有/具有 N 吗 / 能否改写成 Y\'s N）。是主人（拥有/属性）→ 特指 → the；不是主人，of 只说"哪一类/关于啥"（描述性属格）→ 泛指 → a。',
        '先查固定搭配 → 再 of 的拥有/种类测试 → 再回指/含意/新引入信号。a/an 按首音素（元音音素用 an：university→a、X-ray→an、hour→an）。',
      ],
      notes: [
        '诚实的边界：上面是主线规律 + 残余例外，不是铁律。残余靠固定搭配/语感兜底：the number of(数量) vs a number of(许多)、a piece of；part-whole: the top of the hill。',
        '高考考向：三类特指辨析；of 短语的"拥有 vs 种类"；a/an 首音素。',
        '学生陷阱：中文"北京的历史"(拥有)和"穿衣的方式"(种类)都用"的"，要拆开——拥有的"的"→the，种类的"的"→a。',
      ],
    },
  },

  'grammar-fill.no-hint.pronoun': {
    labelZh: '代词（无提示词）',
    framework: {
      steps: [
        '岔路一｜it——四种用法：① 指代前文那个本身（完全同一个、同一情况），不在比较结构里；② 形式主语：It + be + adj/n + to do / that 从句（真主语后置）；③ 形式宾语：V + it + 宾补 + to do / that 从句（find/make/think it hard to…）；④ 强调句（it-cleft）：It is/was + 被强调成分 + that/who + 其余。判据：去掉 It is/was … that 后，剩下的仍是完整句子（区别于形式主语：那个去掉后不完整）。',
        '岔路二｜that / those——替代词，标志是"比较结构"：替代"the + 名词（+ of Y）"，指同类、另一份。比较结构两种：① 比较级比较 larger/better… than that of…；② different 比较 different from that of…。that 替不可数/单数可数；those 替复数。',
        '岔路三｜one / ones——替代词：替代"同类中泛泛的一个"。one 替单数；ones 替复数。',
        '操作判：① 看到比较/对比结构（than / different from / similar to / the same as…）→ that(单·不可数)/those(复)；② 指前文同一个本身，或命中 it 特殊句式（形式主语/形式宾语/强调句）→ it；③ 指泛泛同类的可数一个/些 → one/ones。',
      ],
      notes: [
        '本质（接回冠词主线）：it = the same（同一个本身）；that/those ≈ "the one(s)"（同类·特定的那个）→ 特指（the 家族）；one/ones ≈ "a one(s)"（同类·泛泛一个）→ 泛指（a 家族）。',
        '高考考向：that/those vs one/ones（特指替代 vs 泛指替代）；it 强调句（It is/was…that…）；it 形式主宾 vs 真指代。',
        '注：they 基本不作无提示词答案，主考 it / that·those / one·ones。',
      ],
    },
  },

  'grammar-fill.no-hint.conjunction.coordinating': {
    labelZh: '并列连词',
    framework: {
      steps: [
        '识别：连接对等的词/短语/分句，无主从，不引出作成分的从句。',
        '按逻辑选——顺承并列 and、转折 but/yet、选择 or、因果 for/so。',
        '关联结构：both…and、either…or、neither…nor、not only…but (also)、not…but、whether…or。',
      ],
      notes: [
        '高考考向：关联词配对（neither/nor、either/or）、not only…but also、while 对比（弱逻辑）。',
        '证据：被连接的两个对等成分、逻辑关系信号。',
      ],
    },
  },

  'grammar-fill.no-hint.conjunction.relative-clause': {
    labelZh: '定语从句',
    framework: {
      steps: [
        '识别：空前有先行词（名词/代词），从句修饰它，空作引导词。',
        '第一步｜判从句缺什么成分：缺主/宾/表 → 关系代词；不缺（缺状语）→ 关系副词。',
        '第二步｜试代入 whose（前后名词有从属关系）。',
        '第三步｜据指代（人/物/时间/地点）选词：关系代词（缺主/宾/表）who/whom/which/that/whose/as；关系副词（不缺·作状语）when/where/why。',
      ],
      notes: [
        '高考考向：whose 的从属关系；as（as 引导，常 the same…as / such…as）；介词+which/whom。',
      ],
    },
  },

  'grammar-fill.no-hint.conjunction.noun-clause': {
    labelZh: '名词性从句',
    framework: {
      steps: [
        '识别：从句整体在主句作成分（主/宾/表/同位语），空前无先行词，空作引导词。',
        '第一步｜判从句缺什么成分：缺主/宾/表 → 连接代词；不缺但有疑问义 → 连接副词；不缺且无疑问义 → 单纯连词。',
        '第二步｜据句意选词：连接代词（缺成分）what/who/whom/which/whose；连接副词（不缺）how/why/when/where；单纯连词（不缺）that / whether·if / as if / because。',
      ],
      notes: [
        '高考考向：what（缺成分）vs that（不缺）；whether vs if 的位置限制。',
      ],
    },
  },

  'grammar-fill.no-hint.conjunction.adverbial-clause': {
    labelZh: '状语从句',
    framework: {
      steps: [
        '识别：主、从两句都完整（都不缺成分），从句作状语修饰主句，空作从属连词。',
        '看主从句逻辑关系选从属连词——时间 when/while/as/until·till/before/after、条件 if/unless、原因 because/as/since、让步 although·though、对比 while、目的/结果等。',
      ],
      notes: [
        '高考考向：as 多义（当/因为/随着/正如）、while 对比、until/till、连词 vs 介词混淆。',
        '证据：主、从两个完整句、它们之间的逻辑关系。',
      ],
    },
  },
}
