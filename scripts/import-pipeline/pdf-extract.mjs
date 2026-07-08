/**
 * pdf-extract.mjs <paperId>
 *
 * Builder for the "新课标 PDF 试题卷 + 独立答案 PDF" whitelist format
 * (nck1-paper-standard.md §2, format #2, 2026 起接入). Counterpart to
 * 01-split.mjs, which only handles the "答案版 DOCX with embedded 【答案】"
 * format. This script does NOT reuse lib.mjs's regex-based text splitter —
 * that splitter's heuristics (Format A/B section detection, 【答案】 marker
 * parsing) are shaped around the DOCX-answer-version convention. This
 * source is a genuine 试题卷 (student-facing layout: MC options listed
 * below the passage, no inline answer markers) + a SEPARATE 评分参考 PDF.
 * Reverse-engineering regex heuristics for a brand-new visual layout,
 * sight-unseen, is high rework-risk; hand-transcribing (agent reads the
 * PDF directly, per runbook) into the SAME candidate shape lib.mjs
 * produces, then feeding it through the shipped shape-gate builders below,
 * is mechanically safer because every field is validated by code that
 * already ships in server/paper-import-ai/**. (See runbook "PDF 提取" step
 * and the completion report's lib.mjs section for the full rationale.)
 *
 * Per-paper transcribed content lives in the CONTENT registry below,
 * keyed by paperId — same pattern as zj-inject-answers.mjs's KEYS table.
 * A future PDF-format paper adds its own CONTENT[paperId] entry; the
 * build/shape-gate/write logic below is reusable as-is.
 *
 * Usage: node scripts/import-pipeline/pdf-extract.mjs <paperId>
 * Output: papers/<paperId>/groups.json + analyze-<key>-combined.txt
 *         (identical shape to 01-split.mjs's output — validate-one.mjs
 *         and 02-publish.mjs consume it unmodified).
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildReadingAnalysisMessages } from './lib.mjs'
import { buildSevenChoicesAnalysisMessages } from '../../server/paper-import-ai/analyzeSevenChoices.mjs'
import { buildClozeAnalysisMessages } from '../../server/paper-import-ai/analyzeCloze.mjs'
import { buildGrammarFillAnalysisMessages } from '../../server/paper-import-ai/analyzeGrammarFill.mjs'
import { normalizePassageText } from '../../server/paper-import-ai/normalizePassageText.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pad = (n) => String(n).padStart(3, '0')
const norm = (s) => normalizePassageText(s)

// ============================================================
// CONTENT registry — hand-transcribed from source/paper.pdf (试题卷) +
// source/answers.pdf (评分参考). Agent-read verbatim; §2 语义保真 applies —
// literal source quirks (spelling variants, apparent typos) are preserved
// as printed, not "corrected". See completion report for the specific
// quirks found (Sonder Lim/Lüm Hotel; Reading D's duplicated source "34.").
// ============================================================

const CONTENT = {
  'paper-2026-i': {
    reading: [
      {
        letter: 'a',
        paragraphs: [
          "SoFi Stadium is the go-to destination in the heart of Los Angeles for sports fans. Its calendar is always packed with headline-grabbing events.",
          'Upcoming Football Events',
          '[表:fig-paper-2026-i-reading-a-table-1] Los Angeles Rams v Dallas Cowboys — Saturday, August 9 — 4:00 PM; Los Angeles Chargers v New Orleans Saints — Sunday, August 10 — 5:00 PM; Los Angeles Chargers v Los Angeles Rams — Saturday, August 16 — 4:00 PM; Los Angeles Rams v Houston Texans — Sunday, August 24 — 1:25 PM',
          'Nearby Hotels',
          "When attending an event at SoFi Stadium, you're just a short walk or ride from several comfortable and classy hotels. Right across the street, Sonder Lim Hotel offers spacious rooms and a rooftop pool. A mile away, the H Hotel Los Angeles, with its stylish design, is ideal for a nice stay between events. For those seeking both comfort and convenience, the Renaissance Los Angeles Airport Hotel is just a short drive away. If you're willing to drive a little further, the Ritz-Carlton Los Angeles promises luxurious rooms and extensive leisure facilities- perfect for turning a game day into a great weekend escape.",
          'Parking',
          "SoFi Stadium requires you to park strictly in your assigned zone, and guests must enter through the exact gate indicated on their color-coded digital parking pass. If you enter through the wrong access point, you'll be turned around and redirected-so plan ahead. Each parking zone consists of multiple lots, designed to efficiently manage traffic across the venue's network. Make sure to download your parking pass to your smartphone before arrival. Upon entering the correct zone, parking staff will guide you directly to a space. For those wishing to park near friends, all vehicles must have passes for the same zone and arrive together--spaces cannot be saved.",
        ],
        questions: [
          { stem: 'Which team will play the most games at the stadium this month?', options: { A: 'Washington Commanders.', B: 'Los Angeles Rams.', C: 'Los Angeles Chargers.', D: 'New Orleans Saints.' }, answerKey: 'B' },
          { stem: 'Which hotel is nearest to the stadium?', options: { A: 'Sonder Lüm Hotel.', B: 'The Ritz-Carlton Los Angeles.', C: 'The H Hotel Los Angeles.', D: 'The Renaissance LA Airport Hotel.' }, answerKey: 'A' },
          { stem: 'What do you need to do if you want to park at the stadium?', options: { A: 'Call the parking staff.', B: 'Prepay the parking fee.', C: 'Obtain a parking pass.', D: 'Choose a parking zone.' }, answerKey: 'C' },
        ],
      },
      {
        letter: 'b',
        paragraphs: [
          'Not long ago, my fifth-grade son Kevin asked me about the meaning of a word in a novel."Look it up," I responded. "But my screen time is off," he said. I looked pointedly at the bookshelf that held at least three dictionaries, and Kevin sighed （叹气） dramatically. "Can\'t you just use your phone?" he asked. Suddenly it occurred to me that he did not even know how to use a dictionary.',
          'I took down one of the dictionaries, and we read it together for a few minutes before I handed it to him. It took him a few tries to find the word in question. While going through the pages, he kept saying, wide-eyed: "How can there be this many words?" After a while, he looked at me and asked, "Do you know all these words, Mom?" I smiled. "I definitely do not know all these words,"I said. "But that\'s why this is one of my favorite books."',
          'I had my first dictionary as a gift for my 13th birthday. I decided that I wanted to learn as many words as I could and started marking every entry I looked up with a pencil to measure my progress. I continued to make these pencil marks for years, and when I went off to college, I packed that dictionary in my suitcase.',
          'Kevin wanted to see the dictionary. I felt a small pain in my chest. The dictionary was stolen at the end of my freshman year of college. "That\'s so sad," he said, "but you still know all those words, even without the book." I realized that this was true. I still made it through the next three years of college, even without the book. And it wasn\'t, ultimately, the dictionary that got me there-not really.',
          "Now I understand that although my son may be learning differently, he is still learning. It's not about the words themselves or how we learn them, but the wanting to know them, the curiosity and the appetite.",
        ],
        questions: [
          { stem: 'What does Kevin usually do to get the meaning of a word?', options: { A: 'Use electronic devices.', B: 'Consult a paper dictionary.', C: 'Guess from the context.', D: 'Turn to his English teacher.' }, answerKey: 'A' },
          { stem: 'How did Kevin feel while looking up the word in the dictionary?', options: { A: 'Annoyed.', B: 'Disappointed.', C: 'Encouraged.', D: 'Astonished.' }, answerKey: 'D' },
          { stem: "What can we learn about the author's first dictionary?", options: { A: 'It helped her through college.', B: 'It was given to Kevin as a gift.', C: 'It bore witness to her efforts.', D: 'It was a valuable limited edition.' }, answerKey: 'C' },
          { stem: 'What has the author come to realize about learning?', options: { A: 'It is never too late to start.', B: 'Motivation is what really matters.', C: 'Children need role models.', D: 'Dictionaries are still a useful tool.' }, answerKey: 'B' },
        ],
      },
      {
        letter: 'c',
        paragraphs: [
          'In line with longstanding initiatives to expand its green spaces, New York City is planting tens of thousands of trees each year. They provide shade, lower surface temperatures, absorb a surprising amount of airborne carbon, remove tiny pollutants, and provide wildlife habitat along with just plain beauty.',
          "Something could go wrong, though, according to a new study. Oaks and sweetgums, which currently account for a majority of the city's trees, produce huge amounts of a chemical substance called isoprene. Harmless by itself, isoprene interacts rapidly with polluting nitrogen oxides released by vehicles, buildings and industry to form ground-level ozone （臭氧）一a major factor in many breathing problems.",
          'The research, carried out by scientists at the Columbia Climate School and other institutions, found that if the city maintains past species patterns in new plantings, isoprene production in Manhattan in coming decades will go up by about 140%, and resulting summer ozone levels as much as 30%.',
          '"We\'re all for planting more trees. They bring so many good things," said study coauthor Róisín Commane. "But if we\'re not careful, we could make air quality worse."',
          'The Parks Department is not oblivious to the issue. A study carried out by some of its researchers several years ago concluded that city trees did release isoprene. "We didn\'t make a big deal of that," said Novem Auyeung, a Parks Department senior scientist. She said trees should not be viewed as the enemy. "We could plant any trees we want to, if we just rethink our car-centric lifestyle," she said.',
          '"We\'re not going to go cutting down any big old oaks," and neither will the department completely stop planting new ones, said Auyeung. "You have to think about what you would lose if you do that." Oaks are keystone species, she pointed out, providing food and habitat for native insects, birds and other animals.',
        ],
        questions: [
          { stem: 'What does the new study imply regarding oaks and sweetgums?', options: { A: 'They affect the growth of other trees.', B: 'They absorb less carbon than expected.', C: "They harm people's health indirectly.", D: 'They raise the local temperature slowly.' }, answerKey: 'C' },
          { stem: 'Which of the following may Commune suggest based on their study?', options: { A: 'Cutting down the isoprene-producing trees.', B: 'Suspending tree-planting for a few decades.', C: 'Changing the species of trees in new plantings.', D: 'Removing isoprene released by existing trees.' }, answerKey: 'C' },
          { stem: 'What does the underlined phrase "oblivious to" in paragraph 5 mean?', options: { A: 'Honest about', B: 'Unaware of', C: 'Related to', D: 'Optimistic about' }, answerKey: 'B' },
          { stem: 'What would Auyeung probably advocate?', options: { A: 'Reducing car use in daily life.', B: 'Providing animals with new habitats.', C: 'Controlling population growth.', D: 'Doing more research on the problem.' }, answerKey: 'A' },
        ],
      },
      {
        letter: 'd',
        paragraphs: [
          'A team of Cambridge psychologists conducted an experiment to compare the cognitive （认知的） effects of merely seeing art with actively judging how beautiful it is.',
          'In the study, 187 people were invited to visit Kettle\'s Yard gallery during an exhibition of handmade clay objects. Participants were randomly divided into two groups: the "beauty" group was asked to actively consider and then rate the beauty of each object they viewed, while the control group just matched a line drawing of the object with the artwork itself. All participants were then tested on how they process information, and whether it\'s in a more practical or abstract way.',
          'Across all participants, those in the beauty group scored almost 14% higher on average than the control group in abstract thinking. While they were told the study was about cognitive processes, participants were asked about interests, with around half saying they had an artistic hobby. Among those, the effect was greater: those with an artistic hobby in the beauty group scored over 25% higher on average for abstract thinking than those with an artistic hobby in the control group.',
          'Emotional states of participants were also measured by asking about their feelings while completing the gallery task. Across all participants, those in the beauty group reported an average of 23% higher levels of "transformative and self-transcendent feelings"-such as feeling moved, enlightened and inspired--than the control group. Importantly, however, the beauty group did not report feeling any happier than the control group, suggesting that it was the engagement with beauty that influenced abstract thinking, rather than any overall positivity from the experience.',
          '"We usually think in very concrete terms when doing something on a screen," said Simone Schnall, senior author of the study. "It\'s becoming much rarer to zone out and just let the mind wander, but that\'s when we think in ways that broaden our minds. Admiring the beauty of art may be the ideal way to initiate the abstract cognitive processes."',
        ],
        questions: [
          { stem: 'What was the beauty group asked to do with the clay objects?', options: { A: 'Draw their outlines.', B: 'Give each piece a rating.', C: 'Compare their prices.', D: 'Make a copy of each piece.' }, answerKey: 'B' },
          { stem: 'Which participants got the highest score on average in the test?', options: { A: 'Beauty group, with an artistic hobby.', B: 'Beauty group, without an artistic hobby.', C: 'Control group, with an artistic hobby.', D: 'Control group, without an artistic hobby.' }, answerKey: 'A' },
          // NOTE: source PDF prints "34." twice on this page (an apparent source
          // numbering typo — see completion report); standard §2 renumbers 21-35
          // sequentially regardless, so this question becomes 34 and the next 35.
          { stem: "Why were the participants' emotional states measured?", options: { A: 'To discover their attitudes towards art.', B: 'To identify their specific thinking patterns.', C: 'To examine the difficulty of the tasks.', D: 'To determine factors behind the test results.' }, answerKey: 'D' },
          { stem: 'What is the major finding of the study regarding the appreciation of art?', options: { A: 'It enhances emotional ties.', B: 'It needs critical thinking skills.', C: 'It creates positive feelings.', D: 'It encourages abstract thinking.' }, answerKey: 'D' },
        ],
      },
    ],

    seven: {
      paragraphs: [
        'Museums, once quiet places filled with history, are now full of digital excitement. By using machine learning and advanced algorithms （算法）,these institutions are creating personalized visitor journeys, protecting delicate collections, and revealing hidden stories. __36__',
        'AI transforms a standard museum trip into a personalized and interactive adventure. Smart recommendation engines analyze data such as exhibit popularity and visitors\' past behavior to suggest specific exhibits and events, making each visit unique and surprising. __37__ These digital assistants engage visitors in dynamic conversations and offer context-sensitive insights that deepen understanding and satisfy curiosity.',
        'Beyond visitor interaction, AI plays a crucial role in preserving priceless artworks. Since the exhibits in museums sustain natural decay （破损） over time, early detection is vital. AI can help identify the slightest signs of decay, such as cracks or discoloration, which are often invisible to the human eye. __38__ Moreover, by predicting future decay patterns, AI helps museums take preventive measures and improve preservation strategies.',
        "AI also significantly enhances the educational value of museums, particularly for children and families. __39__ For instance, interactive exhibits powered by AI can adjust their content and difficulty level based on the user's preferences and responses. This adaptability ensures that complex historical concepts become accessible and engaging for young minds.",
        "Looking ahead, the rapid advancement of AI promises both exciting possibilities and ethical （伦理的） challenges. Museums are working together with AI ethicists to develop fair algorithms. __40__ Strict policies should be established to protect visitors' information.",
      ],
      optionBank: [
        { label: 'A', text: 'This capability allows for timely restoration.' },
        { label: 'B', text: 'Visitor data collection also raises privacy issues.' },
        { label: 'C', text: 'In short, AI is redefining the museum in all respects.' },
        { label: 'D', text: 'It tailors learning experiences to different age groups and learning styles.' },
        { label: 'E', text: 'Museums are not only places to store artworks, but also spaces for learning.' },
        { label: 'F', text: 'Furthermore, AI-powered virtual guides are replacing traditional tour guides.' },
        { label: 'G', text: 'AI is changing this by using image recognition technology to analyze exhibits.' },
      ],
      answers: ['C', 'F', 'A', 'D', 'B'],
    },

    cloze: {
      paragraphs: [
        'I grew up in a little town in northeast Ohio. The __41__ of how little people knew about Ohio came quickly after I went to school in central Pennsylvania. Though I lived __42__ three and a half hours away, most of my classmates thought of Ohio as a whole different world. "Do you have to fly home? Do you live on a farm?" The __43__ were never-ending. I was a __44__ in their eyes.',
        "As I grow older, I'm more and more __45__ for my small town roots. Sure, my friends and I loved to __46__ about how bored we were in the middle of nowhere; __47__, as I finish up my junior year of college, I'm convinced that it took __48__ our small town to realize how much we actually love it and what exactly we loved about it.",
        "The pace of life is slow and people __49__ connecting to each other. You do more than just talk to your neighbors-in a lot of cases, they're truly an __50__ of your family. Much of this __51__ centers around being outside and knowing the ins and outs of the town; being present and mindful of your __52__ is a critical part of the culture.",
        'As I move through my college years, I __53__ the visits to my little hometown. I am grateful for the __54__ that I had growing up and know that wherever my next adventure takes me, I can __55__ my small town roots to lead me in the right direction.',
      ],
      questions: [
        { options: { A: 'fantasy', B: 'prejudice', C: 'realization', D: 'expectation' }, answerKey: 'C' },
        { options: { A: 'only', B: 'indeed', C: 'still', D: 'even' }, answerKey: 'A' },
        { options: { A: 'tests', B: 'questions', C: 'games', D: 'debates' }, answerKey: 'B' },
        { options: { A: 'success', B: 'victim', C: 'novelty', D: 'problem' }, answerKey: 'C' },
        { options: { A: 'thankful', B: 'hopeful', C: 'suitable', D: 'reliable' }, answerKey: 'A' },
        { options: { A: 'dream', B: 'lie', C: 'hear', D: 'complain' }, answerKey: 'D' },
        { options: { A: 'therefore', B: 'however', C: 'instead', D: 'otherwise' }, answerKey: 'B' },
        { options: { A: 'touring', B: 'changing', C: 'leaving', D: 'protecting' }, answerKey: 'C' },
        { options: { A: 'value', B: 'admit', C: 'fear', D: 'remember' }, answerKey: 'A' },
        { options: { A: 'advantage', B: 'example', C: 'honor', D: 'extension' }, answerKey: 'D' },
        { options: { A: 'lifestyle', B: 'landscape', C: 'procedure', D: 'personality' }, answerKey: 'A' },
        { options: { A: 'findings', B: 'surroundings', C: 'belongings', D: 'greetings' }, answerKey: 'B' },
        { options: { A: 'give up', B: 'put off', C: 'face up to', D: 'look forward to' }, answerKey: 'D' },
        { options: { A: 'confidence', B: 'reputation', C: 'experience', D: 'opportunity' }, answerKey: 'C' },
        { options: { A: 'inspire', B: 'trust', C: 'remind', D: 'challenge' }, answerKey: 'B' },
      ],
    },

    grammar: {
      paragraphs: [
        'Daji, or big open-air fairs, typically take place on specific dates of the lunar calendar, for example, on dates with five or seven as the last digit. It is also common for them __56__ (hold) during traditional Chinese holidays such as the Spring Festival and the Mid-Autumn Festival, as well as other local festivals. The exact dates and __57__ (frequent) of daji vary from region to region.',
        'Daji originated from the ancient folk custom of trading goods, which dates back to __58__ Han Dynasty. As transportation and communication __59__ (be) underdeveloped at that time, it was very difficult for households to obtain daily __60__ (necessity). As a solution, people gathered at specific locations on set days to trade their surplus （剩余的） items __61__ what they needed.',
        'In addition to being venues for buying and selling, daji are occasions for socializing and entertainment. People from near and far crowd into these markets on daji days. __62__ (draw) by the aroma （香味） of street food, they line up in front of stands __63__ are selling dumplings and hot noodle soup. While eating and enjoying street performances, they chat with each other and share stories of their daily lives. Before __64__ (head) home, they fill their shopping bags with fresh fruit and vegetables from local farmers, at prices significantly __65__ (cheap) than those found in supermarkets.',
      ],
      questions: [
        { prompt: 'hold', answerKey: 'to be held' },
        { prompt: 'frequent', answerKey: 'frequency' },
        { prompt: null, answerKey: 'the' },
        { prompt: 'be', answerKey: 'were' },
        { prompt: 'necessity', answerKey: 'necessities' },
        { prompt: null, answerKey: 'for' },
        { prompt: 'draw', answerKey: 'Drawn' },
        { prompt: null, answerKey: 'that/which' },
        { prompt: 'head', answerKey: 'heading' },
        { prompt: 'cheap', answerKey: 'cheaper' },
      ],
    },

    application: {
      paragraphs: [
        '你校英文报"Opinion"栏目正在征稿，请同学们对未来大学生活的学习(Study)、社交(Socialize)、睡眠(Sleep)这三件事按重要性进行排序，并阐述理由。请你写一篇短文向该栏目投稿。',
      ],
      applicationGiven: 'Ranking My College Life Essentials',
    },

    continuation: {
      paragraphs: [
        'Emily Sanders, a 25-year-old from Detroit, Michigan, set out on December 23rd with high hopes of reaching Toronto to meet her boyfriend for Christmas. Although she had heard warnings about an approaching snowstorm, she didn\'t give it much thought. She assumed that much like in Michigan, police would simply detour （使绕道） traffic around any closed sections of the highway. But that didn\'t happen. As the snow came down more and more heavily, Emily was directed off the highway. She drove on for a while and found herself on an unfamiliar road toward a Canadian town.',
        "The blinding whiteout made driving nearly impossible. At one point, Emily's car got stuck. After a struggle, she managed to free the vehicle and continued inching along the snow-covered road. As night fell, panic set in. While Emily was driving on a narrow stretch of road, her car slid into a ditch （沟）. She tried to call for help but found no signal on her phone. Seeing no hope of immediate rescue, Emily decided to spend the night in her car. She wrapped herself in a blanket, waiting for morning. To stay warm, she ran her engine for a few minutes every now and then. Eventually, she fell asleep.",
        'Emily awoke to a gentle knock on her car window. Standing outside were Daniel and his wife Rachel, who noticed the stranded （被困的） vehicle on their way home and stopped to see if they could help. When Emily rolled down the window, Rachel asked if she was okay and told her it was not safe to stay overnight in the car. With genuine warmth in her voice, Rachel said they could take Emily to a nearby cafe they knew. Grateful and relieved, Emily accepted the offer.',
        'In the cafe, the couple bought Emily a hot chocolate and listened patiently as she explained her desperate situation: she was about a hundred miles from her destination, her car was completely stuck, and her entire holiday plan could be ruined.',
      ],
      continuationStarters: [
        'Daniel and Rachel suggested that Emily continue her journey by train.',
        'Three days later, Emily returned to get her car.',
      ],
    },
  },
}

// ============================================================
// Generic builder — shared across any future PDF-format paper.
// ============================================================

function paperTail(paperId) {
  return paperId.replace(/^paper-/, '').replace(/[^a-z0-9]/gi, '-').toLowerCase()
}

function buildFromContent(paperId) {
  const data = CONTENT[paperId]
  if (!data) throw new Error(`pdf-extract.mjs: no CONTENT entry for ${paperId} — add one first.`)
  const tail = paperTail(paperId)

  const paper = { paperId, sourceFilename: '', sourceHash: 'pending', sourceAssetVersion: 1 }

  let readingStdNo = 21
  const readingGroups = data.reading.map((rg, i) => {
    const group = {
      groupId: `group-${tail}-reading-${rg.letter}`,
      title: `Reading ${rg.letter.toUpperCase()}`,
      order: i,
      paragraphs: rg.paragraphs.map((text, k) => ({
        id: `para-${tail}-reading-${rg.letter}-${k + 1}`,
        text: norm(text),
      })),
      questions: rg.questions.map((q) => {
        const no = readingStdNo++
        return {
          id: `q-${tail}-${pad(no)}`,
          questionNo: String(no),
          stem: norm(q.stem),
          options: Object.fromEntries(Object.entries(q.options).map(([label, text]) => [label, norm(text)])),
          answerKey: q.answerKey,
        }
      }),
    }
    return group
  })

  const sevenStart = readingStdNo // 36
  const seven = {
    groupId: `group-${tail}-seven-choices`,
    groupType: 'sevenChoices',
    title: '七选五',
    order: 4,
    paragraphs: data.seven.paragraphs.map((text, i) => ({
      id: `para-${tail}-seven-${i === 0 ? 'title' : `p${i}`}`,
      text: norm(text),
    })),
    optionBank: data.seven.optionBank.map((o) => ({ label: o.label, text: norm(o.text) })),
    questions: data.seven.answers.map((answerKey, i) => {
      const no = sevenStart + i
      return {
        id: `q-${tail}-${pad(no)}`,
        stem: String(no),
        answerKey,
        blankId: `blank-${tail}-${pad(no)}`,
      }
    }),
  }
  seven.blankIds = seven.questions.map((q) => q.blankId)

  const clozeStart = sevenStart + 5 // 41
  const cloze = {
    groupId: `group-${tail}-cloze`,
    groupType: 'cloze',
    title: '完形填空',
    order: 5,
    paragraphs: data.cloze.paragraphs.map((text, i) => ({
      id: `para-${tail}-cloze-${i === 0 ? 'title' : `p${i}`}`,
      text: norm(text),
    })),
    questions: data.cloze.questions.map((q, i) => {
      const no = clozeStart + i
      return {
        id: `q-${tail}-${pad(no)}`,
        stem: String(no),
        answerKey: q.answerKey,
        blankId: `blank-${tail}-${pad(no)}`,
        options: Object.fromEntries(Object.entries(q.options).map(([label, text]) => [label, norm(text)])),
      }
    }),
  }
  cloze.blankIds = cloze.questions.map((q) => q.blankId)

  const grammarStart = clozeStart + cloze.questions.length // 56
  const grammar = {
    groupId: `group-${tail}-grammar-fill`,
    groupType: 'grammarFill',
    title: '语法填空',
    order: 6,
    paragraphs: data.grammar.paragraphs.map((text, i) => ({
      id: `para-${tail}-grammar-fill-${i === 0 ? 'title' : `p${i}`}`,
      text: norm(text),
    })),
    questions: data.grammar.questions.map((q, i) => {
      const no = grammarStart + i
      return {
        id: `q-${tail}-${pad(no)}`,
        stem: String(no),
        answerKey: q.answerKey,
        blankId: `blank-${tail}-${pad(no)}`,
        prompt: q.prompt || null,
      }
    }),
  }
  grammar.blankIds = grammar.questions.map((q) => q.blankId)

  const application = {
    groupId: `group-${tail}-writing-application`,
    groupType: 'writing',
    title: '应用文写作',
    order: 7,
    paragraphs: data.application.paragraphs.map((text, i) => ({
      id: `para-${tail}-writing-app-${i === 0 ? 'title' : `p${i}`}`,
      text: norm(text),
    })),
    applicationGiven: data.application.applicationGiven || null,
    questions: [],
  }

  const continuation = {
    groupId: `group-${tail}-writing-continuation`,
    groupType: 'writing',
    title: '读后续写',
    order: 8,
    paragraphs: data.continuation.paragraphs.map((text, i) => ({
      id: `para-${tail}-writing-cont-${i === 0 ? 'title' : `p${i}`}`,
      text: norm(text),
    })),
    continuationStarters: data.continuation.continuationStarters,
    questions: [],
  }

  return { paper, readingGroups, seven, cloze, grammar, application, continuation }
}

// ============================================================
// Main — mirrors 01-split.mjs's shape-gate + write-outputs steps.
// ============================================================

const paperId = process.argv[2]
if (!paperId) {
  console.error('Usage: node pdf-extract.mjs <paperId>')
  process.exit(1)
}

const outDir = path.join(__dirname, 'papers', paperId)
mkdirSync(outDir, { recursive: true })

console.log(`\n[1/3] Building groups from CONTENT registry for ${paperId}`)
const groups = buildFromContent(paperId)
const { paper, readingGroups, seven, cloze, grammar, application, continuation } = groups

console.log(`\n[2/3] Shape-gating groups (shipped server/paper-import-ai/** validators)`)
const errors = []
function shapeGate(name, fn) {
  try {
    fn()
    console.log(`      [OK] ${name}`)
  } catch (err) {
    console.log(`      [FAIL] ${name}: ${err.message}`)
    errors.push(`${name}: ${err.message}`)
  }
}
for (const [i, group] of readingGroups.entries()) {
  const letter = ['a', 'b', 'c', 'd'][i]
  shapeGate(`reading-${letter}`, () => buildReadingAnalysisMessages({ paper, group }))
}
shapeGate('seven', () => buildSevenChoicesAnalysisMessages({ paper, group: seven }))
shapeGate('cloze', () => buildClozeAnalysisMessages({ paper, group: cloze }))
shapeGate('grammar', () => buildGrammarFillAnalysisMessages({ paper, group: grammar }))

if (errors.length > 0) {
  console.error(`\nShape gate FAILED (${errors.length} error(s))`)
  process.exit(1)
}

console.log(`\n[3/3] Writing outputs to ${outDir}`)
const groupsPath = path.join(outDir, 'groups.json')
writeFileSync(groupsPath, JSON.stringify(groups, null, 2))
console.log(`      groups.json written`)

function writeCombined(name, messages) {
  const combined = [
    '=== SYSTEM (governing spec — follow exactly) ===',
    messages[0].content,
    '',
    '=== TASK ===',
    messages[1].content,
  ].join('\n')
  writeFileSync(path.join(outDir, `analyze-${name}-combined.txt`), combined)
  console.log(`      analyze-${name}-combined.txt`)
}
for (const [i, group] of readingGroups.entries()) {
  const letter = ['a', 'b', 'c', 'd'][i]
  writeCombined(`reading-${letter}`, buildReadingAnalysisMessages({ paper, group }))
}
writeCombined('seven', buildSevenChoicesAnalysisMessages({ paper, group: seven }))
writeCombined('cloze', buildClozeAnalysisMessages({ paper, group: cloze }))
writeCombined('grammar', buildGrammarFillAnalysisMessages({ paper, group: grammar }))

console.log(`\n======= BUILD REPORT: ${paperId} =======`)
let totalReadingQs = 0
for (const g of readingGroups) {
  const nos = g.questions.map((q) => Number(q.questionNo))
  const answers = g.questions.map((q) => q.answerKey).join('')
  console.log(`   ${g.groupId}: ${g.questions.length} qs, nos ${Math.min(...nos)}-${Math.max(...nos)}, ans="${answers}"`)
  totalReadingQs += g.questions.length
}
console.log(`   Total reading: ${totalReadingQs} (expect 15, nos 21-35)`)
console.log(`   seven: ${seven.questions.length} qs ans="${seven.questions.map((q) => q.answerKey).join('')}"`)
console.log(`   cloze: ${cloze.questions.length} qs ans="${cloze.questions.map((q) => q.answerKey).join('')}"`)
console.log(`   grammar: ${grammar.questions.length} qs ans="${grammar.questions.map((q) => q.answerKey).join('/')}"`)
console.log(`   application paras=${application.paragraphs.length} given=${application.applicationGiven}`)
console.log(`   continuation paras=${continuation.paragraphs.length} starters=${continuation.continuationStarters.length}`)
console.log(`\n[DONE] All shape gates passed. groups.json + combined prompts written to ${outDir}`)
