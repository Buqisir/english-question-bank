/**
 * Grammar-fill facet labels. Personal teaching frameworks are retired.
 * Keys and labels retain the 24-facet classification; the registry
 * name remains compatible with existing consumers and drift checks.
 */
export const FACET_FRAMEWORKS: Record<string, { labelZh: string }> = {
  'grammar-fill.given.verb.finite': { labelZh: '谓语动词' },
  'grammar-fill.given.verb.non-finite': { labelZh: '非谓语动词' },
  'grammar-fill.given.noun.number': { labelZh: '名词的数' },
  'grammar-fill.given.noun.genitive': { labelZh: '名词的格' },
  'grammar-fill.given.adjective.comparison': { labelZh: '形容词比较等级' },
  'grammar-fill.given.conversion.noun-to-noun': { labelZh: '词形转换（名词→名词）' },
  'grammar-fill.given.conversion.noun-to-adjective': { labelZh: '词形转换（名词→形容词）' },
  'grammar-fill.given.conversion.noun-to-verb': { labelZh: '词形转换（名词→动词）' },
  'grammar-fill.given.conversion.adjective-to-adverb': { labelZh: '词形转换（形容词→副词）' },
  'grammar-fill.given.conversion.adjective-to-noun': { labelZh: '词形转换（形容词→名词）' },
  'grammar-fill.given.conversion.adjective-to-adjective': { labelZh: '词形转换（形容词→形容词）' },
  'grammar-fill.given.conversion.verb-to-adjective': { labelZh: '词形转换（动词→形容词）' },
  'grammar-fill.given.conversion.verb-to-noun': { labelZh: '词形转换（动词→名词）' },
  'grammar-fill.given.conversion.verb-to-adverb': { labelZh: '词形转换（动词→副词）' },
  'grammar-fill.given.pronoun': { labelZh: '代词（给定）' },
  'grammar-fill.given.numeral': { labelZh: '数词' },
  'grammar-fill.no-hint.preposition': { labelZh: '介词' },
  'grammar-fill.no-hint.article': { labelZh: '冠词' },
  'grammar-fill.no-hint.pronoun': { labelZh: '代词（无提示词）' },
  'grammar-fill.no-hint.conjunction.coordinating': { labelZh: '并列连词' },
  'grammar-fill.no-hint.conjunction.relative-clause': { labelZh: '定语从句' },
  'grammar-fill.no-hint.conjunction.noun-clause': { labelZh: '名词性从句' },
  'grammar-fill.no-hint.conjunction.adverbial-clause': { labelZh: '状语从句' },
  'grammar-fill.no-hint.conjunction.cleft': { labelZh: '强调句连接标记' },
}
