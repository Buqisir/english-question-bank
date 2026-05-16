/**
 * Hardcoded fixture for the Reading Analysis V0 demo.
 *
 * Real data integration belongs in a later cut. For PoC we just need:
 *   - one short passage with sentence-level ids
 *   - 1+ evidence sentence and 1+ trap sentence
 *   - one question whose stem links to evidence, whose correct option also
 *     points to evidence, and whose wrong options point to traps
 */

import type { ReadingAnalysisFixture } from './readingAnalysisTypes.ts'

export const READING_ANALYSIS_FIXTURE: ReadingAnalysisFixture = {
  passage: {
    id: 'passage-1',
    title: 'When a Phone Box Becomes a Library',
    paragraphs: [
      {
        id: 'p1',
        sentences: [
          {
            id: 'p1-s1',
            text:
              'When the village pub in Marton-cum-Grafton closed for the second winter in a row, residents started looking for somewhere — anywhere — that still felt shared.',
          },
          {
            id: 'p1-s2',
            text:
              'The red phone box on the green had been standing unused for years, its handset long disconnected, its glass clouded by lichen.',
          },
          {
            id: 'p1-s3',
            text:
              'A retired teacher, Margaret Hill, suggested that the village buy it from the phone company for one pound and turn it into a place to swap books.',
          },
        ],
      },
      {
        id: 'p2',
        sentences: [
          {
            id: 'p2-s1',
            text:
              'In April 2019 the parish council finalized the purchase, and within three weeks volunteers had stripped the rust, repainted the frame and installed five wooden shelves.',
          },
          {
            id: 'p2-s2',
            text:
              'On the opening Saturday more than two hundred books arrived, donated by neighbours who had carried them out of attics and garages without being asked.',
          },
          {
            id: 'p2-s3',
            text:
              'The library has no librarian, no due dates and no fines: residents take what they want and replace it whenever they can.',
          },
        ],
      },
      {
        id: 'p3',
        sentences: [
          {
            id: 'p3-s1',
            text:
              'A small notebook hangs inside the door, in which children leave handwritten reviews — a few words about why a book mattered to them.',
          },
          {
            id: 'p3-s2',
            text:
              'Tourists driving past sometimes mistake the box for a quirky photo opportunity and never realize it is the village\'s most active reading room.',
          },
          {
            id: 'p3-s3',
            text:
              'Margaret Hill says the books are not really the point: the point is that the village now has a place where it remembers it can still do something together.',
          },
        ],
      },
    ],
  },
  annotations: [
    {
      id: 'ann-evidence-1',
      kind: 'evidence',
      target: {
        id: 'anchor-evidence-1',
        paragraphIndex: 2,
        sentenceId: 'p3-s3',
        start: 0,
        end: 0,
        quote:
          'the village now has a place where it remembers it can still do something together',
      },
    },
    {
      id: 'ann-evidence-2',
      kind: 'evidence',
      target: {
        id: 'anchor-evidence-2',
        paragraphIndex: 1,
        sentenceId: 'p2-s3',
        start: 0,
        end: 0,
        quote:
          'no librarian, no due dates and no fines: residents take what they want and replace it whenever they can',
      },
    },
    {
      id: 'ann-trap-1',
      kind: 'trap',
      target: {
        id: 'anchor-trap-1',
        paragraphIndex: 2,
        sentenceId: 'p3-s2',
        start: 0,
        end: 0,
        quote:
          'Tourists driving past sometimes mistake the box for a quirky photo opportunity',
      },
    },
    {
      id: 'ann-trap-2',
      kind: 'trap',
      target: {
        id: 'anchor-trap-2',
        paragraphIndex: 0,
        sentenceId: 'p1-s2',
        start: 0,
        end: 0,
        quote: 'its handset long disconnected, its glass clouded by lichen',
      },
    },
  ],
  question: {
    id: 'q-1',
    stem: 'What does the writer suggest the converted phone box mainly represents to the village?',
    options: [
      {
        key: 'A',
        text: 'A nostalgic landmark for visiting tourists.',
        correct: false,
        rationale: '原文说游客只是顺路拍照，并不知道这是村里的阅览室 — 是 trap。',
      },
      {
        key: 'B',
        text: 'Proof that the old phone network can be repaired.',
        correct: false,
        rationale: '电话亭电话已断、玻璃长地衣，文中只是描写它废弃前的样子，没有"修复电话网"的意思。',
      },
      {
        key: 'C',
        text: 'A reminder that the village can still act together.',
        correct: true,
        rationale: '末段 Margaret 直接点题：书不是重点，重点是村子还记得自己可以一起做事。',
      },
      {
        key: 'D',
        text: 'A self-service shop competing with the closed pub.',
        correct: false,
        rationale: '原文没有把电话亭和酒吧并列做对比，更没有"竞争"的语义。',
      },
    ],
    explanation:
      '主旨题：定位 P3 末句的 Margaret Hill 引语 — "the point is that the village now has a place where it remembers it can still do something together"。',
  },
  links: [
    // Stem and the correct option both point to the main evidence.
    {
      id: 'link-stem-evidence',
      from: { questionId: 'q-1' },
      toAnnotationId: 'ann-evidence-1',
      kind: 'support',
    },
    {
      id: 'link-c-evidence',
      from: { questionId: 'q-1', optionKey: 'C' },
      toAnnotationId: 'ann-evidence-1',
      kind: 'support',
    },
    // Wrong options each map to a trap span.
    {
      id: 'link-a-trap',
      from: { questionId: 'q-1', optionKey: 'A' },
      toAnnotationId: 'ann-trap-1',
      kind: 'trap',
    },
    {
      id: 'link-b-trap',
      from: { questionId: 'q-1', optionKey: 'B' },
      toAnnotationId: 'ann-trap-2',
      kind: 'trap',
    },
    {
      id: 'link-d-trap',
      from: { questionId: 'q-1', optionKey: 'D' },
      toAnnotationId: 'ann-trap-1',
      kind: 'trap',
    },
  ],
}
