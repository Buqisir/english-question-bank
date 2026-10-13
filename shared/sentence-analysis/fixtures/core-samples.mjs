const MAIN = 'The committee has postponed the decision which was expected last week, citing concerns that the proposal, if implemented hastily, could undermine public trust.'

export const mainSample = {
  id: 'core-main',
  sentenceText: MAIN,
  translationZh: '委员会推迟了原定于上周做出的决定，理由是担心该提案如果仓促实施，可能会损害公众信任。',
  roots: ['c0'],
  units: [
    { id: 'c0', quote: MAIN, form: 'clause' },
    { id: 'subj', quote: 'The committee', role: 'subject', form: 'phrase', layer: 'c0', parent: 'c0', zh: ['委员会'] },
    { id: 'pred', quote: 'has postponed', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0', zh: ['推迟了'] },
    { id: 'obj', quote: 'the decision which was expected last week', role: 'object', form: 'phrase', layer: 'c0', parent: 'c0', zh: ['原定于上周做出的决定'] },
    { id: 'decision', quote: 'decision', role: 'head', form: 'word', layer: 'c0', parent: 'obj', zh: ['决定'] },
    { id: 'c1', quote: 'which was expected last week', role: 'attributive', form: 'clause', layer: 'c0', parent: 'obj', zh: ['原定于上周做出的'] },
    { id: 'which', quote: 'which', role: 'subject', form: 'word', layer: 'c1', parent: 'c1', connector: 'relative-pronoun' },
    { id: 'wasexp', quote: 'was expected', role: 'predicate', form: 'verb-group', layer: 'c1', parent: 'c1', obstacles: ['passive'] },
    { id: 'lastweek', quote: 'last week', role: 'adverbial', form: 'phrase', layer: 'c1', parent: 'c1', sense: 'time', zh: ['上周'] },
    { id: 'n1', quote: 'citing concerns … public trust', role: 'adverbial', form: 'present-participle', layer: 'c0', parent: 'c0', sense: 'cause', note: '说明推迟的理由', zh: ['理由是担心该提案如果仓促实施，可能会损害公众信任'] },
    { id: 'citing', quote: 'citing', role: 'nonfinite-verb', form: 'word', layer: 'n1', parent: 'n1' },
    { id: 'concerns', quote: 'concerns', role: 'object', form: 'word', layer: 'n1', parent: 'n1', zh: ['担心'] },
    { id: 'c2', quote: 'that the proposal … public trust', role: 'appositive', form: 'clause', layer: 'n1', parent: 'n1', zh: ['该提案如果仓促实施，可能会损害公众信任'] },
    { id: 'that', quote: 'that', role: null, form: 'word', layer: 'c2', parent: 'c2', connector: 'subordinator' },
    { id: 'proposal', quote: 'the proposal', role: 'subject', form: 'phrase', layer: 'c2', parent: 'c2', note: '它的谓语在插入语后面：could undermine', zh: ['该提案'] },
    { id: 'c3', quote: 'if implemented hastily', role: 'adverbial', form: 'clause', layer: 'c2', parent: 'c2', sense: 'condition', obstacles: ['ellipsis', 'parenthesis'], zh: ['如果仓促实施'] },
    { id: 'if', quote: 'if', role: null, form: 'word', layer: 'c3', parent: 'c3', connector: 'subordinator' },
    { id: 'implemented', quote: 'implemented', role: 'predicate', form: 'past-participle', layer: 'c3', parent: 'c3', obstacles: ['ellipsis', 'passive'] },
    { id: 'hastily', quote: 'hastily', role: 'adverbial', form: 'word', layer: 'c3', parent: 'c3', sense: 'manner', zh: ['仓促'] },
    { id: 'could', quote: 'could undermine', role: 'predicate', form: 'verb-group', layer: 'c2', parent: 'c2', zh: ['可能会损害'] },
    { id: 'trust', quote: 'public trust', role: 'object', form: 'phrase', layer: 'c2', parent: 'c2', zh: ['公众信任'] },
  ],
  relations: [
    { id: 'r1', kind: 'subject-predicate', from: 'subj', to: ['pred'] },
    { id: 'r2', kind: 'subject-predicate', from: 'which', to: ['wasexp'] },
    { id: 'r3', kind: 'refers-to', from: 'which', to: ['decision'] },
    { id: 'r4', kind: 'modifies', from: 'c1', to: ['decision'] },
    { id: 'r5', kind: 'modifies', from: 'n1', to: ['pred'], note: '说明推迟的理由' },
    { id: 'r6', kind: 'logical-subject', from: 'n1', to: ['subj'] },
    { id: 'r7', kind: 'modifies', from: 'c2', to: ['concerns'] },
    { id: 'r8', kind: 'subject-predicate', from: 'proposal', to: ['could'] },
    { id: 'r9', kind: 'modifies', from: 'c3', to: ['could'] },
    { id: 'r10', kind: 'logical-subject', from: 'implemented', to: ['proposal'] },
  ],
  restores: [
    { id: 's1', unit: 'c3', kind: 'ellipsis', text: 'if [the proposal is] implemented hastily' },
  ],
}

function sample(id, sentenceText, units, relations = [], extra = {}) {
  return { id, sentenceText, roots: ['c0'], units: [{ id: 'c0', quote: sentenceText, form: 'clause' }, ...units], relations, ...extra }
}

export const boundarySamples = [
  sample('gerund-subject', 'Reading every day improves fluency.', [
    { id: 'ger', quote: 'Reading every day', role: 'subject', form: 'gerund', layer: 'c0', parent: 'c0' },
    { id: 'reading', quote: 'Reading', role: 'nonfinite-verb', form: 'word', layer: 'ger', parent: 'ger' },
    { id: 'pred', quote: 'improves', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'obj', quote: 'fluency', role: 'object', form: 'word', layer: 'c0', parent: 'c0' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'ger', to: ['pred'] },
  ]),
  sample('gerund-object', 'She enjoys reading novels.', [
    { id: 'subj', quote: 'She', role: 'subject', form: 'word', layer: 'c0', parent: 'c0' },
    { id: 'pred', quote: 'enjoys', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'ger', quote: 'reading novels', role: 'object', form: 'gerund', layer: 'c0', parent: 'c0' },
    { id: 'reading', quote: 'reading', role: 'nonfinite-verb', form: 'word', layer: 'ger', parent: 'ger' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'subj', to: ['pred'] },
  ]),
  sample('participle-attributive', 'The proposal discussed yesterday was rejected.', [
    { id: 'subj', quote: 'The proposal discussed yesterday', role: 'subject', form: 'phrase', layer: 'c0', parent: 'c0' },
    { id: 'proposal', quote: 'proposal', role: 'head', form: 'word', layer: 'c0', parent: 'subj' },
    { id: 'part', quote: 'discussed yesterday', role: 'attributive', form: 'past-participle', layer: 'c0', parent: 'subj' },
    { id: 'yesterday', quote: 'yesterday', role: 'adverbial', form: 'word', layer: 'part', parent: 'part', sense: 'time' },
    { id: 'pred', quote: 'was rejected', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0', obstacles: ['passive'] },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'subj', to: ['pred'] },
    { id: 'r2', kind: 'modifies', from: 'part', to: ['proposal'] },
  ]),
  sample('infinitive-purpose', 'She paused to check the figures.', [
    { id: 'subj', quote: 'She', role: 'subject', form: 'word', layer: 'c0', parent: 'c0' },
    { id: 'pred', quote: 'paused', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'inf', quote: 'to check the figures', role: 'adverbial', form: 'infinitive', layer: 'c0', parent: 'c0', sense: 'purpose' },
    { id: 'check', quote: 'check', role: 'nonfinite-verb', form: 'word', layer: 'inf', parent: 'inf' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'subj', to: ['pred'] },
    { id: 'r2', kind: 'modifies', from: 'inf', to: ['pred'] },
  ]),
  sample('infinitive-predicative', 'Her goal is to study medicine.', [
    { id: 'subj', quote: 'Her goal', role: 'subject', form: 'phrase', layer: 'c0', parent: 'c0' },
    { id: 'pred', quote: 'is', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'inf', quote: 'to study medicine', role: 'predicative', form: 'infinitive', layer: 'c0', parent: 'c0' },
    { id: 'study', quote: 'study', role: 'nonfinite-verb', form: 'word', layer: 'inf', parent: 'inf' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'subj', to: ['pred'] },
  ]),
  sample('object-complement', 'We heard him singing in the hall.', [
    { id: 'subj', quote: 'We', role: 'subject', form: 'word', layer: 'c0', parent: 'c0' },
    { id: 'pred', quote: 'heard', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'him', quote: 'him', role: 'object', form: 'word', layer: 'c0', parent: 'c0' },
    { id: 'part', quote: 'singing in the hall', role: 'object-complement', form: 'present-participle', layer: 'c0', parent: 'c0' },
    { id: 'singing', quote: 'singing', role: 'nonfinite-verb', form: 'word', layer: 'part', parent: 'part' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'subj', to: ['pred'] },
    { id: 'r2', kind: 'complements', from: 'part', to: ['him'] },
    { id: 'r3', kind: 'logical-subject', from: 'part', to: ['him'] },
  ]),
  sample('perfect-progressive', 'She has been working all morning.', [
    { id: 'subj', quote: 'She', role: 'subject', form: 'word', layer: 'c0', parent: 'c0' },
    { id: 'pred', quote: 'has been working', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'morning', quote: 'all morning', role: 'adverbial', form: 'phrase', layer: 'c0', parent: 'c0', sense: 'time' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'subj', to: ['pred'] },
  ]),
  sample('passive-verb-group', 'The report was discussed yesterday.', [
    { id: 'subj', quote: 'The report', role: 'subject', form: 'phrase', layer: 'c0', parent: 'c0' },
    { id: 'pred', quote: 'was discussed', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0', obstacles: ['passive'] },
    { id: 'yesterday', quote: 'yesterday', role: 'adverbial', form: 'word', layer: 'c0', parent: 'c0', sense: 'time' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'subj', to: ['pred'] },
  ]),
  sample('relative-layers', 'The teacher who praised the student smiled.', [
    { id: 'teacher', quote: 'teacher', role: 'subject', form: 'word', layer: 'c0', parent: 'c0' },
    { id: 'c1', quote: 'who praised the student', role: 'attributive', form: 'clause', layer: 'c0', parent: 'c0' },
    { id: 'who', quote: 'who', role: 'subject', form: 'word', layer: 'c1', parent: 'c1', connector: 'relative-pronoun' },
    { id: 'praised', quote: 'praised', role: 'predicate', form: 'verb-group', layer: 'c1', parent: 'c1' },
    { id: 'student', quote: 'the student', role: 'object', form: 'phrase', layer: 'c1', parent: 'c1' },
    { id: 'smiled', quote: 'smiled', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'teacher', to: ['smiled'] },
    { id: 'r2', kind: 'subject-predicate', from: 'who', to: ['praised'] },
    { id: 'r3', kind: 'refers-to', from: 'who', to: ['teacher'] },
    { id: 'r4', kind: 'modifies', from: 'c1', to: ['teacher'] },
  ]),
  sample('split-predicate', 'Only then did she turn the offer down.', [
    { id: 'only', quote: 'Only then', role: 'adverbial', form: 'phrase', layer: 'c0', parent: 'c0', sense: 'time', obstacles: ['fronting'] },
    { id: 'pred', quote: ['did', 'turn', 'down'], role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0', obstacles: ['partial-inversion', 'split'] },
    { id: 'she', quote: 'she', role: 'subject', form: 'word', layer: 'c0', parent: 'c0' },
    { id: 'offer', quote: 'the offer', role: 'object', form: 'phrase', layer: 'c0', parent: 'c0' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'she', to: ['pred'] },
  ], {
    restores: [{ id: 's1', unit: 'pred', kind: 'normal-order', text: 'she did turn the offer down only then' }],
  }),
  sample('cleft', 'It was in 1998 that she moved to London.', [
    { id: 'frame', quote: ['It was', 'that'], role: 'cleft-frame', form: 'phrase', layer: 'c0', parent: 'c0' },
    { id: 'when', quote: 'in 1998', role: 'adverbial', form: 'phrase', layer: 'c0', parent: 'c0', sense: 'time', marks: ['emphasized'], obstacles: ['cleft'] },
    { id: 'she', quote: 'she', role: 'subject', form: 'word', layer: 'c0', parent: 'c0' },
    { id: 'moved', quote: 'moved', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'where', quote: 'to London', role: 'adverbial', form: 'phrase', layer: 'c0', parent: 'c0', sense: 'place' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'she', to: ['moved'] },
  ], {
    restores: [{ id: 's1', unit: 'when', kind: 'normal-order', text: 'she moved to London in 1998' }],
  }),
  sample('coordinated-predicates', 'She opened the letter and read it.', [
    { id: 'she', quote: 'She', role: 'subject', form: 'word', layer: 'c0', parent: 'c0' },
    { id: 'opened', quote: 'opened', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'letter', quote: 'the letter', role: 'object', form: 'phrase', layer: 'c0', parent: 'c0' },
    { id: 'and', quote: 'and', role: null, form: 'word', layer: 'c0', parent: 'c0', connector: 'coordinator' },
    { id: 'read', quote: 'read', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'it', quote: 'it', role: 'object', form: 'word', layer: 'c0', parent: 'c0' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'she', to: ['opened', 'read'] },
  ]),
  sample('uncertain-modifier', 'I saw the man with the telescope.', [
    { id: 'subj', quote: 'I', role: 'subject', form: 'word', layer: 'c0', parent: 'c0' },
    { id: 'pred', quote: 'saw', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'man', quote: 'the man', role: 'object', form: 'phrase', layer: 'c0', parent: 'c0' },
    { id: 'pp', quote: 'with the telescope', role: 'adverbial', form: 'prepositional', layer: 'c0', parent: 'c0' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'subj', to: ['pred'] },
    { id: 'r2', kind: 'modifies', from: 'pp', to: [], certainty: 'uncertain' },
  ]),
  sample('object-clause', 'I believe that he will come.', [
    { id: 'subj', quote: 'I', role: 'subject', form: 'word', layer: 'c0', parent: 'c0' },
    { id: 'pred', quote: 'believe', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'c1', quote: 'that he will come', role: 'object', form: 'clause', layer: 'c0', parent: 'c0' },
    { id: 'that', quote: 'that', role: null, form: 'word', layer: 'c1', parent: 'c1', connector: 'subordinator' },
    { id: 'he', quote: 'he', role: 'subject', form: 'word', layer: 'c1', parent: 'c1' },
    { id: 'come', quote: 'will come', role: 'predicate', form: 'verb-group', layer: 'c1', parent: 'c1' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'subj', to: ['pred'] },
    { id: 'r2', kind: 'subject-predicate', from: 'he', to: ['come'] },
  ]),
  sample('subject-clause', 'What he said surprised everyone.', [
    { id: 'c1', quote: 'What he said', role: 'subject', form: 'clause', layer: 'c0', parent: 'c0' },
    { id: 'what', quote: 'What', role: 'object', form: 'word', layer: 'c1', parent: 'c1', connector: 'relative-pronoun' },
    { id: 'he', quote: 'he', role: 'subject', form: 'word', layer: 'c1', parent: 'c1' },
    { id: 'said', quote: 'said', role: 'predicate', form: 'verb-group', layer: 'c1', parent: 'c1' },
    { id: 'pred', quote: 'surprised', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'everyone', quote: 'everyone', role: 'object', form: 'word', layer: 'c0', parent: 'c0' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'c1', to: ['pred'] },
    { id: 'r2', kind: 'subject-predicate', from: 'he', to: ['said'] },
  ]),
  sample('dummy-it', 'It is important to read every day.', [
    { id: 'it', quote: 'It', role: 'subject', form: 'word', layer: 'c0', parent: 'c0', obstacles: ['dummy-it'] },
    { id: 'pred', quote: 'is', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'important', quote: 'important', role: 'predicative', form: 'word', layer: 'c0', parent: 'c0' },
    { id: 'inf', quote: 'to read every day', role: 'subject', form: 'infinitive', layer: 'c0', parent: 'c0', obstacles: ['postponed-subject'] },
    { id: 'read', quote: 'read', role: 'nonfinite-verb', form: 'word', layer: 'inf', parent: 'inf' },
    { id: 'day', quote: 'every day', role: 'adverbial', form: 'phrase', layer: 'inf', parent: 'inf', sense: 'time' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'it', to: ['pred'] },
  ]),
  sample('imperative', 'Read the passage carefully before you answer.', [
    { id: 'pred', quote: 'Read', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0', note: '省略的主语是 you' },
    { id: 'passage', quote: 'the passage', role: 'object', form: 'phrase', layer: 'c0', parent: 'c0' },
    { id: 'carefully', quote: 'carefully', role: 'adverbial', form: 'word', layer: 'c0', parent: 'c0', sense: 'manner' },
    { id: 'c1', quote: 'before you answer', role: 'adverbial', form: 'clause', layer: 'c0', parent: 'c0', sense: 'time' },
    { id: 'before', quote: 'before', role: null, form: 'word', layer: 'c1', parent: 'c1', connector: 'subordinator' },
    { id: 'you', quote: 'you', role: 'subject', form: 'word', layer: 'c1', parent: 'c1' },
    { id: 'answer', quote: 'answer', role: 'predicate', form: 'verb-group', layer: 'c1', parent: 'c1' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'you', to: ['answer'] },
    { id: 'r2', kind: 'modifies', from: 'c1', to: ['pred'] },
  ]),
  sample('repeated-books', 'The book that I bought is better than the book that you lent me.', [
    { id: 'subj', quote: 'The book that I bought', role: 'subject', form: 'phrase', layer: 'c0', parent: 'c0' },
    { id: 'book1', quote: 'book', occurrence: 1, role: 'head', form: 'word', layer: 'c0', parent: 'subj' },
    { id: 'c1', quote: 'that I bought', role: 'attributive', form: 'clause', layer: 'c0', parent: 'subj' },
    { id: 'that1', quote: 'that', occurrence: 1, role: 'object', form: 'word', layer: 'c1', parent: 'c1', connector: 'relative-pronoun' },
    { id: 'i', quote: 'I', role: 'subject', form: 'word', layer: 'c1', parent: 'c1' },
    { id: 'bought', quote: 'bought', role: 'predicate', form: 'verb-group', layer: 'c1', parent: 'c1' },
    { id: 'pred', quote: 'is', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'comp', quote: 'better than the book that you lent me', role: 'predicative', form: 'phrase', layer: 'c0', parent: 'c0' },
    { id: 'book2', quote: 'book', occurrence: 2, role: 'head', form: 'word', layer: 'c0', parent: 'comp' },
    { id: 'c2', quote: 'that you lent me', role: 'attributive', form: 'clause', layer: 'c0', parent: 'comp' },
    { id: 'that2', quote: 'that', occurrence: 2, role: 'object', form: 'word', layer: 'c2', parent: 'c2', connector: 'relative-pronoun' },
    { id: 'you', quote: 'you', role: 'subject', form: 'word', layer: 'c2', parent: 'c2' },
    { id: 'lent', quote: 'lent', role: 'predicate', form: 'verb-group', layer: 'c2', parent: 'c2' },
    { id: 'me', quote: 'me', role: 'object', form: 'word', layer: 'c2', parent: 'c2' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'subj', to: ['pred'] },
    { id: 'r2', kind: 'subject-predicate', from: 'i', to: ['bought'] },
    { id: 'r3', kind: 'subject-predicate', from: 'you', to: ['lent'] },
    { id: 'r4', kind: 'modifies', from: 'c1', to: ['book1'] },
    { id: 'r5', kind: 'modifies', from: 'c2', to: ['book2'] },
    { id: 'r6', kind: 'refers-to', from: 'that1', to: ['book1'] },
    { id: 'r7', kind: 'refers-to', from: 'that2', to: ['book2'] },
  ]),
  sample('unicode-appositive', 'The café’s owner—a former teacher—smiled at the children’s drawings.', [
    { id: 'subj', quote: 'The café’s owner', role: 'subject', form: 'phrase', layer: 'c0', parent: 'c0' },
    { id: 'app', quote: 'a former teacher', role: 'appositive', form: 'phrase', layer: 'c0', parent: 'c0', obstacles: ['parenthesis'] },
    { id: 'pred', quote: 'smiled', role: 'predicate', form: 'verb-group', layer: 'c0', parent: 'c0' },
    { id: 'drawings', quote: 'the children’s drawings', role: 'object', form: 'phrase', layer: 'c0', parent: 'c0' },
  ], [
    { id: 'r1', kind: 'subject-predicate', from: 'subj', to: ['pred'] },
    { id: 'r2', kind: 'modifies', from: 'app', to: ['subj'] },
  ]),
]

export const coreFixtures = [mainSample, ...boundarySamples]
