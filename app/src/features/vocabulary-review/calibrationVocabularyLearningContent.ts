import type {
  VocabularyLearningContent,
  VocabularyVisualKey,
} from '../../domain/vocabulary'

export const calibrationVocabularyLearningContent: Record<
  VocabularyVisualKey,
  VocabularyLearningContent
> = {
  article: {
    pronunciationGuide: {
      mode: 'forms',
      parts: [
        { spelling: 'a', phonetic: '/eɪ, ə/' },
        { spelling: 'an', phonetic: '/æn, ən/' },
      ],
    },
    example: {
      english: 'She ate an apple after school.',
      chinese: '她放学后吃了一个苹果。',
      highlight: 'an apple',
    },
  },
  about: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'a', phonetic: '/ə/' },
        { spelling: 'bout', phonetic: '/ˈbaʊt/' },
      ],
    },
    example: {
      english: 'We talked about our weekend plans.',
      chinese: '我们谈了周末的计划。',
      highlight: 'talked about',
    },
  },
  accept: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'ac', phonetic: '/ək/' },
        { spelling: 'cept', phonetic: '/ˈsept/' },
      ],
    },
    example: {
      english: 'Please accept this small gift.',
      chinese: '请收下这份小礼物。',
      highlight: 'accept this small gift',
    },
  },
  achieve: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'a', phonetic: '/ə/' },
        { spelling: 'chieve', phonetic: '/ˈtʃiːv/' },
      ],
    },
    example: {
      english: 'You can achieve your goal step by step.',
      chinese: '你可以一步一步实现目标。',
      highlight: 'achieve your goal',
    },
  },
  across: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'a', phonetic: '/ə/' },
        { spelling: 'cross', phonetic: '/ˈkrɒs/' },
      ],
    },
    example: {
      english: 'We walked across the road at the pedestrian crossing.',
      chinese: '我们从人行横道走过了马路。',
      highlight: 'across the road',
    },
  },
  active: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'ac', phonetic: '/ˈæk/' },
        { spelling: 'tive', phonetic: '/tɪv/' },
      ],
    },
    example: {
      english: 'Running keeps me active and healthy.',
      chinese: '跑步让我保持活跃和健康。',
      highlight: 'keeps me active',
    },
  },
  advice: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'ad', phonetic: '/əd/' },
        { spelling: 'vice', phonetic: '/ˈvaɪs/' },
      ],
    },
    example: {
      english: 'My teacher gave me useful advice.',
      chinese: '老师给了我有用的建议。',
      highlight: 'gave me useful advice',
    },
  },
  afford: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'af', phonetic: '/ə/' },
        { spelling: 'ford', phonetic: '/ˈfɔːd/' },
      ],
    },
    example: {
      english: 'We cannot afford such an expensive bike.',
      chinese: '我们买不起这么贵的自行车。',
      highlight: 'afford',
    },
  },
  afraid: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'a', phonetic: '/ə/' },
        { spelling: 'fraid', phonetic: '/ˈfreɪd/' },
      ],
    },
    example: {
      english: 'The child is afraid of the dark.',
      chinese: '这个孩子怕黑。',
      highlight: 'afraid of the dark',
    },
  },
  against: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'a', phonetic: '/ə/' },
        { spelling: 'gainst', phonetic: '/ˈɡenst/' },
      ],
    },
    example: {
      english: 'Our team played against Class Two.',
      chinese: '我们队和二班进行了比赛。',
      highlight: 'played against',
    },
  },
  agree: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'a', phonetic: '/ə/' },
        { spelling: 'gree', phonetic: '/ˈɡriː/' },
      ],
    },
    example: {
      english: 'I agree with your idea.',
      chinese: '我赞同你的想法。',
      highlight: 'agree with',
    },
  },
  all: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [{ spelling: 'all', phonetic: '/ɔːl/' }],
    },
    example: {
      english: 'All the students are ready.',
      chinese: '所有学生都准备好了。',
      highlight: 'All the students',
    },
  },
  allow: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'al', phonetic: '/ə/' },
        { spelling: 'low', phonetic: '/ˈlaʊ/' },
      ],
    },
    example: {
      english: 'Our teacher allows us to ask questions.',
      chinese: '老师允许我们提问。',
      highlight: 'allows us to ask questions',
    },
  },
  alone: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'a', phonetic: '/ə/' },
        { spelling: 'lone', phonetic: '/ˈləʊn/' },
      ],
    },
    example: {
      english: 'The boy sat alone in the room.',
      chinese: '那个男孩独自坐在房间里。',
      highlight: 'sat alone',
    },
  },
  along: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'a', phonetic: '/ə/' },
        { spelling: 'long', phonetic: '/ˈlɒŋ/' },
      ],
    },
    example: {
      english: 'We walked along the river after dinner.',
      chinese: '晚饭后，我们沿着河边散步。',
      highlight: 'along the river',
    },
  },
  angry: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'an', phonetic: '/ˈæŋ/' },
        { spelling: 'gry', phonetic: '/ɡri/' },
      ],
    },
    example: {
      english: 'My mother was angry with me.',
      chinese: '妈妈生我的气。',
      highlight: 'angry with',
    },
  },
  another: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'a', phonetic: '/ə/' },
        { spelling: 'noth', phonetic: '/ˈnʌð/' },
        { spelling: 'er', phonetic: '/ə(r)/' },
      ],
    },
    example: {
      english: 'Would you like another cup of tea?',
      chinese: '你想再来一杯茶吗？',
      highlight: 'another cup of tea',
    },
  },
  answer: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'an', phonetic: '/ˈɑːn/' },
        { spelling: 'swer', phonetic: '/sə(r)/' },
      ],
    },
    example: {
      english: 'Please answer my question.',
      chinese: '请回答我的问题。',
      highlight: 'answer my question',
    },
  },
  appear: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'ap', phonetic: '/ə/' },
        { spelling: 'pear', phonetic: '/ˈpɪə(r)/' },
      ],
    },
    example: {
      english: 'A rainbow appeared after the rain.',
      chinese: '雨后出现了一道彩虹。',
      highlight: 'appeared after the rain',
    },
  },
  around: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'a', phonetic: '/ə/' },
        { spelling: 'round', phonetic: '/ˈraʊnd/' },
      ],
    },
    example: {
      english: 'The children sat around the table.',
      chinese: '孩子们围坐在桌旁。',
      highlight: 'around the table',
    },
  },
  arrive: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'ar', phonetic: '/ə/' },
        { spelling: 'rive', phonetic: '/ˈraɪv/' },
      ],
    },
    example: {
      english: 'We arrived at school on time.',
      chinese: '我们准时到校。',
      highlight: 'arrived at school',
    },
  },
  as: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [{ spelling: 'as', phonetic: '/æz, əz/' }],
    },
    example: {
      english: 'She works as an English teacher.',
      chinese: '她是一名英语老师。',
      highlight: 'works as',
    },
  },
  ask: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [{ spelling: 'ask', phonetic: '/ɑːsk, æsk/' }],
    },
    example: {
      english: 'May I ask you a question?',
      chinese: '我可以问你一个问题吗？',
      highlight: 'ask you a question',
    },
  },
  at: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [{ spelling: 'at', phonetic: '/æt/' }],
    },
    example: {
      english: 'We meet at the school gate at seven.',
      chinese: '我们七点在校门口见。',
      highlight: 'at the school gate',
    },
  },
  attend: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'at', phonetic: '/ə/' },
        { spelling: 'tend', phonetic: '/ˈtend/' },
      ],
    },
    example: {
      english: 'Many students attended the school meeting.',
      chinese: '许多学生参加了校会。',
      highlight: 'attended the school meeting',
    },
  },
  attention: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'at', phonetic: '/ə/' },
        { spelling: 'ten', phonetic: '/ˈten/' },
        { spelling: 'tion', phonetic: '/ʃn/' },
      ],
    },
    example: {
      english: 'Please pay attention to the road.',
      chinese: '请注意路况。',
      highlight: 'pay attention to',
    },
  },
  avoid: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'a', phonetic: '/ə/' },
        { spelling: 'void', phonetic: '/ˈvɔɪd/' },
      ],
    },
    example: {
      english: 'He slowed down to avoid the dog.',
      chinese: '他放慢速度，避开那只狗。',
      highlight: 'avoid the dog',
    },
  },
  away: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [
        { spelling: 'a', phonetic: '/ə/' },
        { spelling: 'way', phonetic: '/ˈweɪ/' },
      ],
    },
    example: {
      english: 'Keep away from the fire.',
      chinese: '请远离火源。',
      highlight: 'Keep away from',
    },
  },
  back: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [{ spelling: 'back', phonetic: '/bæk/' }],
    },
    example: {
      english: 'Please come back before dark.',
      chinese: '请在天黑前回来。',
      highlight: 'come back',
    },
  },
  bad: {
    pronunciationGuide: {
      mode: 'syllables',
      parts: [{ spelling: 'bad', phonetic: '/bæd/' }],
    },
    example: {
      english: 'Too much sugar is bad for your teeth.',
      chinese: '吃太多糖对牙齿不好。',
      highlight: 'is bad for',
    },
  },
}
