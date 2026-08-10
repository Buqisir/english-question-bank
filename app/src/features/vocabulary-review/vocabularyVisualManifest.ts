import type { VocabularyVisualKey } from '../../domain/vocabulary'

const ASSET_BASE = '/vocabulary-assets/wanwei-round-one-v1'

export type VocabularyVisualAsset = {
  src: string
  alt: string
  caption: string
  koboyoSlug: string
  width: number
  height: number
}

function visualAsset(
  visualKey: VocabularyVisualKey,
  koboyoSlug: string,
  width: number,
  height: number,
  alt: string,
  caption: string,
): VocabularyVisualAsset {
  return {
    src: `${ASSET_BASE}/${visualKey}--${koboyoSlug}.svg`,
    alt,
    caption,
    koboyoSlug,
    width,
    height,
  }
}

export const vocabularyVisualManifest: Record<VocabularyVisualKey, VocabularyVisualAsset> = {
  article: visualAsset('article', 'apple', 161, 179, '一只苹果，表示单数可数名词前的“一个”', '一只苹果：一个具体事物'),
  about: visualAsset('about', 'group-circle-discussing', 265, 174, '几个人围坐讨论同一个话题，表示“关于”', '围绕一个话题讨论'),
  accept: visualAsset('accept', 'person-accepting-handover', 300, 227, '一个人伸手接过对方递来的物品，表示“接受”', '伸手接过：接受'),
  achieve: visualAsset('achieve', 'person-reaching-summit-flag', 174, 200, '一个人登上山顶并举起旗帜，表示达到目标', '登顶举旗：达到目标'),
  across: visualAsset('across', 'crossing-road', 240, 210, '一个人穿过道路，从一边走到另一边', '穿过道路到另一边'),
  active: visualAsset('active', 'runner-sprinting', 205, 225, '一名跑步者正在冲刺，表示积极活跃', '冲刺奔跑：积极活跃'),
  advice: visualAsset('advice', 'coaching', 246, 181, '两个人面对面交流，一人给另一人指导和建议', '面对面给出建议'),
  afford: visualAsset('afford', 'person-holding-huge-price', 211, 216, '一个人抱着巨大价签，思考是否负担得起', '面对价签：能否负担'),
  afraid: visualAsset('afraid', 'scared', 163, 250, '一个人缩紧身体，露出害怕的表情', '缩紧身体：感到害怕'),
  against: visualAsset('against', 'two-people-pulling-opposite', 262, 168, '两个人向相反方向拉绳，表示对抗或反对', '反向拉绳：彼此对抗'),
  agree: visualAsset('agree', 'team-agreeing-way-working', 247, 162, '团队成员共同确认一种做法，表示同意', '共同确认：表示同意'),
  all: visualAsset('all', 'group-people-walking-together', 265, 178, '一群人全部一起向前走，表示全体', '一群人：全部成员'),
  allow: visualAsset('allow', 'person-opening-gate', 214, 190, '一个人打开大门让人通过，表示允许', '打开大门：允许通过'),
  alone: visualAsset('alone', 'person-alone-room', 196, 191, '一个人独自待在房间里，表示单独', '独自在房间里'),
  along: visualAsset('along', 'person-walking-through-roadmap', 247, 201, '一个人沿着地图上的路线向前走', '沿着路线前进'),
  angry: visualAsset('angry', 'angry-person-arms-folded', 156, 226, '一个人抱着手臂，露出生气的表情', '抱臂皱眉：感到生气'),
  another: visualAsset('another', 'person-helping-another-up', 211, 215, '一个人伸手扶起另一个人，表示“另一个”', '一个人帮助另一个人'),
  answer: visualAsset('answer', 'person-answering-question', 207, 220, '一个人正在回答面前提出的问题', '回应问题：给出答案'),
  appear: visualAsset('appear', 'sun-behind-cloud', 173, 136, '太阳从云后显露出来，表示出现', '太阳从云后出现'),
  around: visualAsset('around', 'four-people-sitting-around', 265, 171, '四个人围坐在桌子周围', '围坐在桌子周围'),
  arrive: visualAsset('arrive', 'person-arriving-classroom', 238, 212, '一个人走到教室门口，表示到达', '走到教室：到达目的地'),
  as: visualAsset('as', 'teacher-blackboard', 268, 214, '一个人作为老师站在黑板前讲课', '作为老师站在黑板前'),
  ask: visualAsset('ask', 'person-asking-question', 185, 229, '一个人举手提出问题或请求', '举手提出问题'),
  at: visualAsset('at', 'map-location-pin', 112, 166, '地图上的位置标记，表示在某个地点', '位置标记：在某处'),
  attend: visualAsset('attend', 'audience-four-clapping', 257, 136, '四名观众到场观看活动并鼓掌，表示参加', '观众到场参加活动'),
  attention: visualAsset('attention', 'focused-person-desk', 238, 223, '一个人坐在桌前专心工作，表示集中注意力', '坐在桌前专心投入'),
  avoid: visualAsset('avoid', 'person-redirecting-around-obstacle', 216, 237, '一个人改变路线绕开障碍，表示避免', '改变路线绕开障碍'),
  away: visualAsset('away', 'person-walking-away-seen', 105, 263, '一个人背对画面逐渐走远，表示离开', '背对画面逐渐走远'),
  back: visualAsset('back', 'person-turning-look-back', 100, 241, '一个人转身向后看，表示回头或向后', '转身回头向后看'),
  bad: visualAsset('bad', 'disappointed-person-holding-document', 207, 221, '一个人看着糟糕结果的文件，露出失望神情', '看到糟糕结果而失望'),
}
