PRAGMA foreign_keys = ON;

INSERT OR REPLACE INTO sources (id, source_type, year, region, paper_name, section, note)
VALUES
  ('src-2023-n1-b', 'real_exam', 2023, '新课标 I', '全国高考', '阅读理解 B', 'V0 示例来源，只保存题库元数据，不复制原卷正文。'),
  ('src-2024-jslk-reading-a', 'real_exam', 2024, '九省联考', '高考综合改革适应性测试', '阅读理解 A', 'C6a-4 入口样本：题面与解析来自 paper-asset-v1。'),
  ('src-2024-jslk-reading-b', 'real_exam', 2024, '九省联考', '高考综合改革适应性测试', '阅读理解 B', 'C6a-6b 入口样本：题面与解析来自 paper-asset-v1。'),
  ('src-2024-jslk-reading-c', 'real_exam', 2024, '九省联考', '高考综合改革适应性测试', '阅读理解 C', 'C6a-9 入口样本：题面与解析来自 paper-asset-v1。'),
  ('src-2024-jslk-reading-d', 'real_exam', 2024, '九省联考', '高考综合改革适应性测试', '阅读理解 D', 'C6a-9 入口样本：题面与解析来自 paper-asset-v1。'),
  ('src-2024-zj-jan-b', 'real_exam', 2024, '浙江', '1月首考', '阅读理解 B', 'V0 示例来源，只保存题库元数据，不复制原卷正文。'),
  ('src-2025-n1-b', 'real_exam', 2025, '全国 I', '全国高考', '阅读理解 B', 'V0 示例来源，只保存题库元数据，不复制原卷正文。'),
  ('src-2025-zj-body-cloze', 'mock_exam', 2025, '浙江', '主题专项', '完形填空', '由 2025 浙江 1月 B 主题转化的训练样例。'),
  ('src-2026-zj-car-grammar', 'self_made', 2026, '浙江', '课堂转化', '语法填空', '由 2026 浙江 1月 B 主题转化的语法训练样例。');

INSERT OR REPLACE INTO passages (id, source_id, title, material_text, summary, theme, discourse_type, word_count, difficulty, note)
VALUES
  (
    'passage-2024-jslk-reading-a',
    'src-2024-jslk-reading-a',
    'Yellowstone Poster Exhibition to Be on View at UW’s Coe Library',
    '见 app/public/paper-assets/paper-2024-jslk-english/paper-asset.json。C6a-4 中题库只保存入口元数据，PaperSurface 从 paper-asset 读取正式题面。',
    '介绍怀俄明大学 Coe Library 举办黄石国家公园海报展的时间、地点、纪念意义和代表展品。',
    '人与社会',
    '应用文',
    NULL,
    'medium',
    'C6a-4 paper-asset Reading A 入口。'
  ),
  (
    'passage-2024-jslk-reading-b',
    'src-2024-jslk-reading-b',
    'Parrots are prey animals',
    '见 app/public/paper-assets/paper-2024-jslk-english/paper-asset.json。C6a-6b 中题库只保存入口元数据，PaperSurface 从 paper-asset 读取正式题面。',
    '说明鹦鹉作为被捕食动物的本能反应如何影响家庭行为，并给出饲养建议。',
    '人与自然',
    '说明文',
    NULL,
    'medium',
    'C6a-6b paper-asset Reading B 入口。'
  ),
  (
    'passage-2024-jslk-reading-c',
    'src-2024-jslk-reading-c',
    'Rethinking Arguments',
    '见 app/public/paper-assets/paper-2024-jslk-english/paper-asset.json。C6a-9 中题库只保存入口元数据，PaperSurface 从 paper-asset 读取正式题面。',
    '批判把争论视作打斗或比赛的旧观念，主张通过理性交换获得尊重与理解。',
    '人与社会',
    '议论文',
    NULL,
    'medium',
    'C6a-9 paper-asset Reading C 入口。'
  ),
  (
    'passage-2024-jslk-reading-d',
    'src-2024-jslk-reading-d',
    'How Your Baby Learns to Love',
    '见 app/public/paper-assets/paper-2024-jslk-english/paper-asset.json。C6a-9 中题库只保存入口元数据，PaperSurface 从 paper-asset 读取正式题面。',
    '说明幼儿通过模仿表达喜欢，并建议父母用规则、共情和语言表达引导健康社交。',
    '人与自我',
    '说明文',
    NULL,
    'medium',
    'C6a-9 paper-asset Reading D 入口。'
  ),
  (
    'passage-2023-john-todd',
    'src-2023-n1-b',
    '生态设计者的污水治理实验',
    '待补原文。V0 中先保存篇章摘要、来源和题组结构。',
    '从童年观察溪流自净，到用植物、动物和微生物组成生态机器清理污泥和污水。',
    '人与自然',
    '说明文',
    NULL,
    'medium',
    ''
  ),
  (
    'passage-2024-phone-box',
    'src-2024-zj-jan-b',
    '公共设施的新生命',
    '待补原文。V0 中先保存篇章摘要、来源和题组结构。',
    '从一次被锁门时靠电话亭求助，到电话亭后来成为社区共享图书空间。',
    '人与社会',
    '记叙说明',
    NULL,
    'low',
    ''
  ),
  (
    'passage-2025-writing-teacher',
    'src-2025-n1-b',
    '让学生写出有生命力的故事',
    '待补原文。V0 中先保存篇章摘要、来源和题组结构。',
    '学生对写作意义缺乏兴趣，教师调整任务后看见学生真实表达和连接他人的可能。',
    '人与自我',
    '教育反思',
    NULL,
    'medium',
    ''
  ),
  (
    'passage-2025-body-image',
    'src-2025-zj-body-cloze',
    'A child says "I am too fat"',
    '待补训练文本。V0 中先保存篇章摘要、来源和题组结构。',
    '母亲从孩子一句话回想童年饮食控制，尝试重新理解健康自主和家长边界。',
    '人与自我',
    '记叙文',
    NULL,
    'high',
    ''
  ),
  (
    'passage-2026-car-physics',
    'src-2026-zj-car-grammar',
    'Learning friction through tires',
    '待补训练文本。V0 中先保存篇章摘要、来源和题组结构。',
    '教师把汽车爱好带进物理课堂，用轮胎讲摩擦，让学生重新感到学习与现实有关。',
    '人与自我',
    '记叙说明',
    NULL,
    'medium',
    ''
  );

INSERT OR REPLACE INTO question_groups (id, passage_id, group_type, title, instruction, display_order, default_score, difficulty, note)
VALUES
  ('g-2023-n1-b', 'passage-2023-john-todd', 'reading', 'John Todd 与 eco-machine 污染治理', 'Read the passage and answer the questions.', 1, 2.5, 'medium', ''),
  ('group-2024-jslk-reading-a', 'passage-2024-jslk-reading-a', 'reading', '2024九省联考 阅读 A 黄石公园海报展', 'Read the passage and answer the questions.', 1, 2.5, 'medium', 'C6a-4: 阅读解析进入 source=paper-asset PaperSurface。'),
  ('group-2024-jslk-reading-b', 'passage-2024-jslk-reading-b', 'reading', '2024九省联考 阅读 B 鹦鹉本能与饲养建议', 'Read the passage and answer the questions.', 2, 2.5, 'medium', 'C6a-6b: 阅读解析进入 source=paper-asset PaperSurface。'),
  ('group-2024-jslk-reading-c', 'passage-2024-jslk-reading-c', 'reading', '2024九省联考 阅读 C 重新理解争论', 'Read the passage and answer the questions.', 3, 2.5, 'medium', 'C6a-9: 阅读解析进入 source=paper-asset PaperSurface。'),
  ('group-2024-jslk-reading-d', 'passage-2024-jslk-reading-d', 'reading', '2024九省联考 阅读 D 幼儿友谊与社交规则', 'Read the passage and answer the questions.', 4, 2.5, 'medium', 'C6a-9: 阅读解析进入 source=paper-asset PaperSurface。'),
  ('g-2024-zj-jan-b', 'passage-2024-phone-box', 'reading', '旧电话亭变成社区小图书馆', 'Read the passage and answer the questions.', 1, 2.5, 'low', ''),
  ('g-2025-n1-b', 'passage-2025-writing-teacher', 'reading', '写作教师重新设计写作任务', 'Read the passage and answer the questions.', 1, 2.5, 'medium', ''),
  ('g-mock-cloze-family', 'passage-2025-body-image', 'cloze', '家庭饮食规训与儿童身体观', 'Choose the best answer for each blank.', 1, 1, 'high', ''),
  ('g-self-grammar-car', 'passage-2026-car-physics', 'grammar_cloze', '汽车兴趣进入物理课堂', 'Fill in the blanks with proper forms.', 1, 1.5, 'medium', '');

INSERT OR REPLACE INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
VALUES
  ('q-2023-john-todd-1', 'g-2023-n1-b', '1', '推理判断', 'Which words best describe Todd''s approach to pollution treatment?', 'Nature-based and cooperative.', 'V0 示例解析：该题用于列表命中预览，正式解析后续录入。', 'medium', 2.5, 1, ''),
  ('q-2024-jslk-021', 'group-2024-jslk-reading-a', '21', '细节理解', 'How long will the exhibition "Wonderland Illustrated" last?', 'C. Four months.', 'C6a-4：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 1, ''),
  ('q-2024-jslk-022', 'group-2024-jslk-reading-a', '22', '细节理解', 'What is a purpose of the exhibition?', 'C. To mark the anniversary of a national park.', 'C6a-4：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 2, ''),
  ('q-2024-jslk-023', 'group-2024-jslk-reading-a', '23', '细节理解', 'What do we know about the 1904 poster Henry Wellge designed?', 'A. It is rare in the world.', 'C6a-4：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 3, ''),
  ('q-2024-jslk-024', 'group-2024-jslk-reading-b', '24', '细节理解', 'What is important for parrots to better survive from attacks in the wild?', 'A. Living in a group.', 'C6a-6b：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 1, ''),
  ('q-2024-jslk-025', 'group-2024-jslk-reading-b', '25', '细节理解', 'What is parrots'' first response to an immediate risk?', 'B. To get away.', 'C6a-6b：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 2, ''),
  ('q-2024-jslk-026', 'group-2024-jslk-reading-b', '26', '细节推断', 'Why would a balloon frighten a parrot?', 'D. It may move around quickly.', 'C6a-6b：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 3, ''),
  ('q-2024-jslk-027', 'group-2024-jslk-reading-b', '27', '写作目的', 'What is the author''s purpose of writing the text?', 'B. To give advice on raising a parrot.', 'C6a-6b：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 4, ''),
  ('q-2024-jslk-028', 'group-2024-jslk-reading-c', '28', '态度观点', 'What is the author''s attitude toward Carnegie''s understanding of argument?', 'A. Critical.', 'C6a-9：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 1, ''),
  ('q-2024-jslk-029', 'group-2024-jslk-reading-c', '29', '细节理解', 'Why do many people try to avoid arguments?', 'B. They may feel bad even if they win.', 'C6a-9：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 2, ''),
  ('q-2024-jslk-030', 'group-2024-jslk-reading-c', '30', '词义猜测', 'What does the underlined phrase "spell out" in paragraph 3 probably mean?', 'B. Explain.', 'C6a-9：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 3, ''),
  ('q-2024-jslk-031', 'group-2024-jslk-reading-c', '31', '主旨大意', 'What is the key to "winning" an argument according to the author?', 'D. Understanding from both sides.', 'C6a-9：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 4, ''),
  ('q-2024-jslk-032', 'group-2024-jslk-reading-d', '32', '细节推断', 'What does it indicate when toddlers copy their playmates'' behavior?', 'C. They are fond of their playmates.', 'C6a-9：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 1, ''),
  ('q-2024-jslk-033', 'group-2024-jslk-reading-d', '33', '细节理解', 'What does the author suggest parents do for their kids?', 'D. Help them understand social rules.', 'C6a-9：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 2, ''),
  ('q-2024-jslk-034', 'group-2024-jslk-reading-d', '34', '篇章结构', 'What is the function of the quoted statements in paragraph 4?', 'A. Giving examples.', 'C6a-9：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 3, ''),
  ('q-2024-jslk-035', 'group-2024-jslk-reading-d', '35', '标题归纳', 'Which of the following is the best title for the text?', 'C. How Your Baby Learns to Love.', 'C6a-9：正式解析见 paper-asset reviewed analysis JSON。', 'medium', 2.5, 4, ''),
  ('q-2024-phone-box-1', 'g-2024-zj-jan-b', '1', '细节理解', 'What did the phone box mean to the writer at first?', 'It was a source of timely help.', 'V0 示例解析：该题用于列表命中预览，正式解析后续录入。', 'low', 2.5, 1, ''),
  ('q-2025-writing-teacher-1', 'g-2025-n1-b', '1', '推理判断', 'Why did the teacher change the writing task?', 'To connect writing with lived experience.', 'V0 示例解析：该题用于列表命中预览，正式解析后续录入。', 'medium', 2.5, 1, ''),
  ('q-2025-body-image-1', 'g-mock-cloze-family', '1', '完形语义', 'The mother chose to step back and let the child notice hunger and fullness.', '自主选择与边界感相关。', 'V0 示例解析：该题用于列表命中预览，正式解析后续录入。', 'high', 1, 1, ''),
  ('q-2026-car-physics-1', 'g-self-grammar-car', '1', '语法填空', 'The lesson was designed to make physics feel connected to daily life.', '核心考查非谓语、从句和词形变化。', 'V0 示例解析：该题用于列表命中预览，正式解析后续录入。', 'medium', 1.5, 1, '');

WITH RECURSIVE n(value) AS (
  VALUES (2)
  UNION ALL
  SELECT value + 1 FROM n WHERE value < 4
)
INSERT OR REPLACE INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
SELECT
  'q-2023-john-todd-' || value,
  'g-2023-n1-b',
  CAST(value AS TEXT),
  '待录入',
  '待录入题干 ' || value,
  '',
  '',
  'medium',
  2.5,
  value,
  'V0 占位小题，用于保持题组题数。'
FROM n;

WITH RECURSIVE n(value) AS (
  VALUES (2)
  UNION ALL
  SELECT value + 1 FROM n WHERE value < 4
)
INSERT OR REPLACE INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
SELECT
  'q-2024-phone-box-' || value,
  'g-2024-zj-jan-b',
  CAST(value AS TEXT),
  '待录入',
  '待录入题干 ' || value,
  '',
  '',
  'low',
  2.5,
  value,
  'V0 占位小题，用于保持题组题数。'
FROM n;

WITH RECURSIVE n(value) AS (
  VALUES (2)
  UNION ALL
  SELECT value + 1 FROM n WHERE value < 4
)
INSERT OR REPLACE INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
SELECT
  'q-2025-writing-teacher-' || value,
  'g-2025-n1-b',
  CAST(value AS TEXT),
  '待录入',
  '待录入题干 ' || value,
  '',
  '',
  'medium',
  2.5,
  value,
  'V0 占位小题，用于保持题组题数。'
FROM n;

WITH RECURSIVE n(value) AS (
  VALUES (2)
  UNION ALL
  SELECT value + 1 FROM n WHERE value < 15
)
INSERT OR REPLACE INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
SELECT
  'q-2025-body-image-' || value,
  'g-mock-cloze-family',
  CAST(value AS TEXT),
  '待录入',
  '待录入题干 ' || value,
  '',
  '',
  'high',
  1,
  value,
  'V0 占位小题，用于保持题组题数。'
FROM n;

WITH RECURSIVE n(value) AS (
  VALUES (2)
  UNION ALL
  SELECT value + 1 FROM n WHERE value < 10
)
INSERT OR REPLACE INTO questions (id, group_id, question_no, question_type, stem, answer, explanation, difficulty, score, display_order, note)
SELECT
  'q-2026-car-physics-' || value,
  'g-self-grammar-car',
  CAST(value AS TEXT),
  '待录入',
  '待录入题干 ' || value,
  '',
  '',
  'medium',
  1.5,
  value,
  'V0 占位小题，用于保持题组题数。'
FROM n;

INSERT OR REPLACE INTO options (id, question_id, label, content, display_order)
VALUES
  ('opt-2023-john-todd-1-a', 'q-2023-john-todd-1', 'A', 'Nature-based and cooperative.', 1),
  ('opt-2023-john-todd-1-b', 'q-2023-john-todd-1', 'B', 'Costly and mechanical.', 2),
  ('opt-2024-phone-box-1-a', 'q-2024-phone-box-1', 'A', 'A source of timely help.', 1),
  ('opt-2024-phone-box-1-b', 'q-2024-phone-box-1', 'B', 'A place for routine reading.', 2),
  ('opt-2025-writing-teacher-1-a', 'q-2025-writing-teacher-1', 'A', 'To connect writing with lived experience.', 1),
  ('opt-2025-writing-teacher-1-b', 'q-2025-writing-teacher-1', 'B', 'To make the task easier to grade.', 2);

INSERT OR REPLACE INTO tags (id, name, category, description, is_active)
VALUES
  ('tag-ecological-wisdom', '生态智慧', '主题', '', 1),
  ('tag-human-nature', '人与自然', '主题', '', 1),
  ('tag-expository', '说明文', '语篇', '', 1),
  ('tag-problem-solving', '问题解决', '能力', '', 1),
  ('tag-community-sharing', '社区共享', '主题', '', 1),
  ('tag-public-space', '公共空间', '主题', '', 1),
  ('tag-narrative-expository', '记叙说明', '语篇', '', 1),
  ('tag-reuse', '旧物新用', '主题', '', 1),
  ('tag-writing-education', '写作教育', '主题', '', 1),
  ('tag-student-expression', '学生表达', '主题', '', 1),
  ('tag-teacher-student', '师生关系', '主题', '', 1),
  ('tag-education-reflection', '教育反思', '主题', '', 1),
  ('tag-family-education', '家庭教育', '主题', '', 1),
  ('tag-body-image', '身体观', '主题', '', 1),
  ('tag-health-autonomy', '健康自主', '主题', '', 1),
  ('tag-narrative', '记叙文', '语篇', '', 1),
  ('tag-real-life', '真实生活', '主题', '', 1),
  ('tag-interest-driven', '兴趣驱动', '学习', '', 1),
  ('tag-learning-motivation', '学习动机', '学习', '', 1),
  ('tag-grammar-cloze', '语法填空', '题型', '', 1);

INSERT OR REPLACE INTO tag_links (id, tag_id, target_type, target_id)
VALUES
  ('tl-john-ecological-wisdom', 'tag-ecological-wisdom', 'question_group', 'g-2023-n1-b'),
  ('tl-john-human-nature', 'tag-human-nature', 'question_group', 'g-2023-n1-b'),
  ('tl-john-expository', 'tag-expository', 'question_group', 'g-2023-n1-b'),
  ('tl-john-problem-solving', 'tag-problem-solving', 'question_group', 'g-2023-n1-b'),
  ('tl-phone-community-sharing', 'tag-community-sharing', 'question_group', 'g-2024-zj-jan-b'),
  ('tl-phone-public-space', 'tag-public-space', 'question_group', 'g-2024-zj-jan-b'),
  ('tl-phone-narrative-expository', 'tag-narrative-expository', 'question_group', 'g-2024-zj-jan-b'),
  ('tl-phone-reuse', 'tag-reuse', 'question_group', 'g-2024-zj-jan-b'),
  ('tl-writing-education', 'tag-writing-education', 'question_group', 'g-2025-n1-b'),
  ('tl-writing-expression', 'tag-student-expression', 'question_group', 'g-2025-n1-b'),
  ('tl-writing-teacher-student', 'tag-teacher-student', 'question_group', 'g-2025-n1-b'),
  ('tl-writing-reflection', 'tag-education-reflection', 'question_group', 'g-2025-n1-b'),
  ('tl-body-family', 'tag-family-education', 'question_group', 'g-mock-cloze-family'),
  ('tl-body-image', 'tag-body-image', 'question_group', 'g-mock-cloze-family'),
  ('tl-body-health', 'tag-health-autonomy', 'question_group', 'g-mock-cloze-family'),
  ('tl-body-narrative', 'tag-narrative', 'question_group', 'g-mock-cloze-family'),
  ('tl-car-real-life', 'tag-real-life', 'question_group', 'g-self-grammar-car'),
  ('tl-car-interest-driven', 'tag-interest-driven', 'question_group', 'g-self-grammar-car'),
  ('tl-car-learning-motivation', 'tag-learning-motivation', 'question_group', 'g-self-grammar-car'),
  ('tl-car-grammar-cloze', 'tag-grammar-cloze', 'question_group', 'g-self-grammar-car');

INSERT OR REPLACE INTO paper_sets (id, title, set_type, student_version_title, teacher_version_title, description)
VALUES
  (
    'paper-set-reading-b-themes',
    '高考阅读 B 主题训练',
    'training',
    '高考阅读 B 主题训练（学生版）',
    '高考阅读 B 主题训练（教师版）',
    'V0 示例题集，用于验证组题篮和导出链路。'
  );

INSERT OR REPLACE INTO paper_items (id, paper_set_id, item_type, item_id, display_order, score_override, section_title, note)
VALUES
  ('paper-item-reading-b-john', 'paper-set-reading-b-themes', 'question_group', 'g-2023-n1-b', 1, 2.5, '阅读理解 B', ''),
  ('paper-item-reading-b-phone', 'paper-set-reading-b-themes', 'question_group', 'g-2024-zj-jan-b', 2, 2.5, '阅读理解 B', '');

INSERT OR REPLACE INTO ai_tag_suggestions (id, target_type, target_id, suggested_tag, category, confidence, reason, status)
VALUES
  (
    'ai-tag-john-public-issue',
    'question_group',
    'g-2023-n1-b',
    '生态治理',
    '主题',
    0.82,
    '该题组围绕污染治理与自然协同展开，适合作为教师确认前的建议标签。',
    'pending'
  );
