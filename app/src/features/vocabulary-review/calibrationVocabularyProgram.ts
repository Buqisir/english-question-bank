import type {
  VocabularyEntry,
  VocabularyProgram,
  VocabularyVisualKey,
} from '../../domain/vocabulary'
import { calibrationVocabularyLearningContent } from './calibrationVocabularyLearningContent'

const SOURCE_TITLE = '万唯系列中考词汇一轮梳理'
const SOURCE_EDITION = '第8版（2025年5月印刷）'

type CalibrationEntryInput = {
  headword: string
  phonetic: string
  partOfSpeech: string
  sourceMeanings: string[]
  teachingSense: string
  examFrequency: number
  primaryStageReview?: boolean
  visualKey: VocabularyVisualKey
  group: number
  indexInGroup: number
  printedPage: number
}

function makeEntry(input: CalibrationEntryInput, globalOrder: number): VocabularyEntry {
  return {
    id: `wanwei-core-${String(globalOrder).padStart(4, '0')}-${input.headword.replace(/[^a-z]/gi, '-')}`,
    headword: input.headword,
    phonetic: input.phonetic,
    partOfSpeech: input.partOfSpeech,
    sourceMeanings: input.sourceMeanings,
    teachingSense: input.teachingSense,
    examFrequency: input.examFrequency,
    primaryStageReview: input.primaryStageReview ?? false,
    visualKey: input.visualKey,
    learning: calibrationVocabularyLearningContent[input.visualKey],
    source: {
      title: SOURCE_TITLE,
      edition: SOURCE_EDITION,
      stage: 'core',
      week: 1,
      group: input.group,
      sourceLabel: `Day ${input.group}`,
      indexInGroup: input.indexInGroup,
      globalOrder,
      printedPage: input.printedPage,
      verification: 'page-checked',
    },
  }
}

const calibrationInputs: CalibrationEntryInput[] = [
  { headword: 'a / an', phonetic: '/eɪ, ə; æn, ən/', partOfSpeech: 'art.', sourceMeanings: ['用于单数可数名词前，表示未曾提到的一个人或事物', '任何一个；每一'], teachingSense: '一个；任何一个', examFrequency: 167, primaryStageReview: true, visualKey: 'article', group: 1, indexInGroup: 1, printedPage: 1 },
  { headword: 'about', phonetic: '/əˈbaʊt/', partOfSpeech: 'prep. & adv.', sourceMeanings: ['关于；对于', '大约；左右', '周围；各处'], teachingSense: '关于；大约', examFrequency: 21, primaryStageReview: true, visualKey: 'about', group: 1, indexInGroup: 2, printedPage: 1 },
  { headword: 'accept', phonetic: '/əkˈsept/', partOfSpeech: 'v.', sourceMeanings: ['接受（建议、邀请等）', '相信；承认', '收受'], teachingSense: '接受', examFrequency: 12, visualKey: 'accept', group: 1, indexInGroup: 3, printedPage: 2 },
  { headword: 'achieve', phonetic: '/əˈtʃiːv/', partOfSpeech: 'v.', sourceMeanings: ['达到（目标、地位、标准）', '完成；成功', '实现；获得'], teachingSense: '达到；实现', examFrequency: 11, visualKey: 'achieve', group: 1, indexInGroup: 4, printedPage: 2 },
  { headword: 'across', phonetic: '/əˈkrɒs/', partOfSpeech: 'prep. & adv.', sourceMeanings: ['横过；穿过', '在……对面', '遍及'], teachingSense: '横过；在……对面', examFrequency: 9, visualKey: 'across', group: 1, indexInGroup: 5, printedPage: 2 },
  { headword: 'active', phonetic: '/ˈæktɪv/', partOfSpeech: 'adj.', sourceMeanings: ['积极的', '活跃的', '主动的'], teachingSense: '积极的；活跃的', examFrequency: 9, primaryStageReview: true, visualKey: 'active', group: 1, indexInGroup: 6, printedPage: 3 },
  { headword: 'advice', phonetic: '/ədˈvaɪs/', partOfSpeech: 'n. [U]', sourceMeanings: ['劝告', '忠告', '建议；意见'], teachingSense: '建议；忠告', examFrequency: 16, visualKey: 'advice', group: 1, indexInGroup: 7, printedPage: 4 },
  { headword: 'afford', phonetic: '/əˈfɔːd/', partOfSpeech: 'v.', sourceMeanings: ['承担得起（后果）', '买得起', '有时间做'], teachingSense: '买得起；承担得起', examFrequency: 7, visualKey: 'afford', group: 1, indexInGroup: 8, printedPage: 4 },
  { headword: 'afraid', phonetic: '/əˈfreɪd/', partOfSpeech: 'adj.', sourceMeanings: ['害怕的；畏惧的', '担心的'], teachingSense: '害怕的；担心的', examFrequency: 7, primaryStageReview: true, visualKey: 'afraid', group: 1, indexInGroup: 9, printedPage: 4 },

  { headword: 'against', phonetic: '/əˈɡenst/', partOfSpeech: 'prep.', sourceMeanings: ['倚；碰；紧靠', '对抗；反对', '违反', '与……相比'], teachingSense: '反对；对抗；违反', examFrequency: 6, visualKey: 'against', group: 2, indexInGroup: 1, printedPage: 5 },
  { headword: 'agree', phonetic: '/əˈɡriː/', partOfSpeech: 'v.', sourceMeanings: ['同意', '赞成', '应允'], teachingSense: '同意；赞成', examFrequency: 26, visualKey: 'agree', group: 2, indexInGroup: 2, printedPage: 5 },
  { headword: 'all', phonetic: '/ɔːl/', partOfSpeech: 'pron. & adj.', sourceMeanings: ['全体；一切；全部', '所有的；全部的'], teachingSense: '全部；所有的', examFrequency: 12, primaryStageReview: true, visualKey: 'all', group: 2, indexInGroup: 3, printedPage: 6 },
  { headword: 'allow', phonetic: '/əˈlaʊ/', partOfSpeech: 'v.', sourceMeanings: ['允许；准许', '允许进入或通过', '认可'], teachingSense: '允许；准许', examFrequency: 12, visualKey: 'allow', group: 2, indexInGroup: 4, printedPage: 6 },
  { headword: 'alone', phonetic: '/əˈləʊn/', partOfSpeech: 'adv. & adj.', sourceMeanings: ['独自地；单独地', '孤单的；独自的'], teachingSense: '独自；单独', examFrequency: 11, primaryStageReview: true, visualKey: 'alone', group: 2, indexInGroup: 5, printedPage: 6 },
  { headword: 'along', phonetic: '/əˈlɒŋ/', partOfSpeech: 'prep. & adv.', sourceMeanings: ['沿着；顺着', '一道；一起'], teachingSense: '沿着；一起', examFrequency: 7, visualKey: 'along', group: 2, indexInGroup: 6, printedPage: 7 },
  { headword: 'angry', phonetic: '/ˈæŋɡri/', partOfSpeech: 'adj.', sourceMeanings: ['发怒的', '愤怒的；生气的'], teachingSense: '生气的；愤怒的', examFrequency: 13, primaryStageReview: true, visualKey: 'angry', group: 2, indexInGroup: 7, printedPage: 7 },
  { headword: 'another', phonetic: '/əˈnʌðə(r)/', partOfSpeech: 'det. & pron.', sourceMeanings: ['另一个人或事物', '又一个；再一个', '别的；不同的'], teachingSense: '另一个；又一个', examFrequency: 19, visualKey: 'another', group: 2, indexInGroup: 8, printedPage: 7 },
  { headword: 'answer', phonetic: '/ˈɑːnsə(r)/', partOfSpeech: 'n. & v.', sourceMeanings: ['答案；答复', '回答；答复'], teachingSense: '回答；答案', examFrequency: 10, primaryStageReview: true, visualKey: 'answer', group: 2, indexInGroup: 9, printedPage: 8 },

  { headword: 'appear', phonetic: '/əˈpɪə(r)/', partOfSpeech: 'v.', sourceMeanings: ['出现；呈现；显露', '显得；看来；似乎', '来到'], teachingSense: '出现；似乎', examFrequency: 6, visualKey: 'appear', group: 3, indexInGroup: 1, printedPage: 9 },
  { headword: 'around', phonetic: '/əˈraʊnd/', partOfSpeech: 'adv. & prep.', sourceMeanings: ['到处；向各处', '周围；围绕', '大约'], teachingSense: '周围；大约', examFrequency: 5, visualKey: 'around', group: 3, indexInGroup: 2, printedPage: 9 },
  { headword: 'arrive', phonetic: '/əˈraɪv/', partOfSpeech: 'v.', sourceMeanings: ['到达；抵达'], teachingSense: '到达；抵达', examFrequency: 8, visualKey: 'arrive', group: 3, indexInGroup: 3, printedPage: 10 },
  { headword: 'as', phonetic: '/æz, əz/', partOfSpeech: 'conj. prep. & adv.', sourceMeanings: ['当……时；如同', '因为；由于', '作为', '像……一样'], teachingSense: '作为；像……一样；当……时', examFrequency: 43, primaryStageReview: true, visualKey: 'as', group: 3, indexInGroup: 4, printedPage: 10 },
  { headword: 'ask', phonetic: '/ɑːsk, æsk/', partOfSpeech: 'v.', sourceMeanings: ['问；询问', '请求；要求', '邀请'], teachingSense: '询问；请求；要求', examFrequency: 20, primaryStageReview: true, visualKey: 'ask', group: 3, indexInGroup: 5, printedPage: 11 },
  { headword: 'at', phonetic: '/æt/', partOfSpeech: 'prep.', sourceMeanings: ['向；朝', '在某处', '在某时间或时刻'], teachingSense: '在（地点或时间）', examFrequency: 61, primaryStageReview: true, visualKey: 'at', group: 3, indexInGroup: 6, printedPage: 11 },
  { headword: 'attend', phonetic: '/əˈtend/', partOfSpeech: 'v.', sourceMeanings: ['参加（事件或活动）', '出席', '上学'], teachingSense: '参加；出席', examFrequency: 9, visualKey: 'attend', group: 3, indexInGroup: 7, printedPage: 11 },
  { headword: 'attention', phonetic: '/əˈtenʃn/', partOfSpeech: 'n. [U]', sourceMeanings: ['注意力', '关注；专心；留心'], teachingSense: '注意；注意力', examFrequency: 8, visualKey: 'attention', group: 3, indexInGroup: 8, printedPage: 11 },
  { headword: 'avoid', phonetic: '/əˈvɔɪd/', partOfSpeech: 'v.', sourceMeanings: ['避免；回避', '避开；躲避', '防止'], teachingSense: '避免；躲避', examFrequency: 12, visualKey: 'avoid', group: 3, indexInGroup: 9, printedPage: 12 },
  { headword: 'away', phonetic: '/əˈweɪ/', partOfSpeech: 'adv.', sourceMeanings: ['离开；远离', '在别处', '朝另一个方向'], teachingSense: '离开；远离', examFrequency: 16, primaryStageReview: true, visualKey: 'away', group: 3, indexInGroup: 10, printedPage: 12 },

  { headword: 'back', phonetic: '/bæk/', partOfSpeech: 'adv. & n.', sourceMeanings: ['回来；回原处', '向后；往后', '后面；背面；背部'], teachingSense: '回来；向后；背部', examFrequency: 19, primaryStageReview: true, visualKey: 'back', group: 4, indexInGroup: 1, printedPage: 13 },
  { headword: 'bad', phonetic: '/bæd/', partOfSpeech: 'adj.', sourceMeanings: ['不好的；坏的', '糟糕的', '令人不愉快的'], teachingSense: '不好的；糟糕的', examFrequency: 15, primaryStageReview: true, visualKey: 'bad', group: 4, indexInGroup: 2, printedPage: 13 },
]

const entries = calibrationInputs.map((input, index) => makeEntry(input, index + 1))

export const calibrationVocabularyProgram: VocabularyProgram = {
  id: 'wanwei-zhongkao-round-one-calibration',
  version: '2026-08-07-v1',
  title: '中考词汇一轮',
  subtitle: '30词校准样本',
  sourceTitle: SOURCE_TITLE,
  sourceEdition: '第8版',
  totalPlannedEntries: 1600,
  calibrationSize: entries.length,
  groups: [
    { id: 'week-1-group-1', week: 1, group: 1, sourceLabel: 'Day 1', startOrder: 1, endOrder: 9 },
    { id: 'week-1-group-2', week: 1, group: 2, sourceLabel: 'Day 2', startOrder: 10, endOrder: 18 },
    { id: 'week-1-group-3', week: 1, group: 3, sourceLabel: 'Day 3', startOrder: 19, endOrder: 28 },
    { id: 'week-1-group-4', week: 1, group: 4, sourceLabel: 'Day 4', startOrder: 29, endOrder: 30 },
  ],
  entries,
}
