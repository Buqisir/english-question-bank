PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('real_exam', 'mock_exam', 'self_made', 'other')),
  year INTEGER,
  region TEXT NOT NULL DEFAULT '',
  paper_name TEXT NOT NULL DEFAULT '',
  section TEXT NOT NULL DEFAULT '',
  publisher TEXT,
  original_url TEXT,
  file_ref TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS passages (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  material_text TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  theme TEXT,
  discourse_type TEXT,
  word_count INTEGER,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('low', 'medium', 'high')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS question_groups (
  id TEXT PRIMARY KEY,
  passage_id TEXT NOT NULL REFERENCES passages(id) ON DELETE CASCADE,
  group_type TEXT NOT NULL CHECK (
    group_type IN (
      'reading',
      'cloze',
      'seven_choices',
      'grammar_cloze',
      'writing',
      'continuation',
      'listening',
      'other'
    )
  ),
  title TEXT NOT NULL,
  instruction TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  default_score REAL NOT NULL DEFAULT 0,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('low', 'medium', 'high')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES question_groups(id) ON DELETE CASCADE,
  question_no TEXT NOT NULL DEFAULT '',
  question_type TEXT NOT NULL DEFAULT '',
  stem TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  explanation TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL CHECK (difficulty IN ('low', 'medium', 'high')),
  score REAL NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tag_links (
  id TEXT PRIMARY KEY,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('passage', 'question_group', 'question')),
  target_id TEXT NOT NULL,
  UNIQUE (tag_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS paper_sets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  set_type TEXT NOT NULL DEFAULT 'training' CHECK (set_type IN ('paper', 'handout', 'training', 'collection')),
  student_version_title TEXT,
  teacher_version_title TEXT,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS paper_items (
  id TEXT PRIMARY KEY,
  paper_set_id TEXT NOT NULL REFERENCES paper_sets(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('question_group', 'question')),
  item_id TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  score_override REAL,
  section_title TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS import_files (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'other' CHECK (file_type IN ('docx', 'pdf', 'image', 'other')),
  content_role TEXT NOT NULL DEFAULT 'question' CHECK (
    content_role IN ('question', 'answer_analysis', 'question_with_analysis', 'other')
  ),
  bundle_id TEXT NOT NULL DEFAULT '',
  bundle_title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'imported' CHECK (status IN ('imported', 'parsed', 'reviewed', 'archived')),
  source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_file_texts (
  id TEXT PRIMARY KEY,
  import_file_id TEXT NOT NULL UNIQUE REFERENCES import_files(id) ON DELETE CASCADE,
  parser TEXT NOT NULL DEFAULT '',
  extracted_text TEXT NOT NULL DEFAULT '',
  line_count INTEGER NOT NULL DEFAULT 0,
  char_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded', 'failed')),
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  directory_path TEXT NOT NULL,
  recursive INTEGER NOT NULL DEFAULT 1 CHECK (recursive IN (0, 1)),
  content_role TEXT NOT NULL DEFAULT 'question_with_analysis' CHECK (
    content_role IN ('question', 'answer_analysis', 'question_with_analysis', 'other')
  ),
  status TEXT NOT NULL DEFAULT 'scanned' CHECK (status IN ('scanned', 'importing', 'imported', 'partial', 'failed')),
  file_count INTEGER NOT NULL DEFAULT 0,
  supported_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  parsed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_batch_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'other' CHECK (file_type IN ('docx', 'pdf', 'image', 'other')),
  file_size INTEGER NOT NULL DEFAULT 0,
  content_role TEXT NOT NULL DEFAULT 'question_with_analysis' CHECK (
    content_role IN ('question', 'answer_analysis', 'question_with_analysis', 'other')
  ),
  bundle_id TEXT NOT NULL DEFAULT '',
  bundle_title TEXT NOT NULL DEFAULT '',
  import_file_id TEXT REFERENCES import_files(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'unsupported', 'imported', 'parsed', 'skipped', 'failed')
  ),
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (batch_id, file_path)
);

CREATE TABLE IF NOT EXISTS ai_tag_suggestions (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('passage', 'question_group', 'question')),
  target_id TEXT NOT NULL,
  suggested_tag TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  confidence REAL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS question_group_topic_labels (
  id TEXT PRIMARY KEY,
  question_group_id TEXT NOT NULL REFERENCES question_groups(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  theme TEXT NOT NULL,
  theme_group TEXT NOT NULL,
  subtopic TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ai',
  reason TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(question_group_id, label)
);

CREATE INDEX IF NOT EXISTS idx_question_group_topic_labels_group
  ON question_group_topic_labels(question_group_id);

CREATE TABLE IF NOT EXISTS reading_parse_results (
  id TEXT PRIMARY KEY,
  question_group_id TEXT NOT NULL UNIQUE REFERENCES question_groups(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL DEFAULT '{}',
  verify_payload_json TEXT NOT NULL DEFAULT '{}',
  provider TEXT NOT NULL DEFAULT 'deepseek',
  model TEXT NOT NULL DEFAULT '',
  thinking_mode INTEGER NOT NULL DEFAULT 0 CHECK (thinking_mode IN (0, 1)),
  request_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS paper_asset_versions (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  asset_version INTEGER NOT NULL,
  version_name TEXT NOT NULL,
  version_dir TEXT NOT NULL,
  source_file_sha256 TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(paper_id, asset_version)
);

CREATE TABLE IF NOT EXISTS paper_import_runs (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  asset_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('validated', 'published', 'failed')),
  validation_report_json TEXT NOT NULL DEFAULT '{}',
  publish_report_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  paper_set_id TEXT NOT NULL REFERENCES paper_sets(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL CHECK (export_type IN ('docx', 'pdf')),
  version_type TEXT NOT NULL CHECK (version_type IN ('student', 'teacher')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  output_path TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vocabulary_programs (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  source_title TEXT NOT NULL,
  source_edition TEXT NOT NULL DEFAULT '',
  total_planned_entries INTEGER NOT NULL,
  structure_json TEXT NOT NULL DEFAULT '{}',
  availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'hidden')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vocabulary_groups (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES vocabulary_programs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  week INTEGER NOT NULL,
  group_number INTEGER NOT NULL,
  source_label TEXT NOT NULL,
  start_order INTEGER NOT NULL,
  end_order INTEGER NOT NULL,
  UNIQUE(program_id, stage, group_number)
);

CREATE TABLE IF NOT EXISTS vocabulary_entries (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES vocabulary_programs(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES vocabulary_groups(id) ON DELETE CASCADE,
  headword TEXT NOT NULL,
  phonetic TEXT NOT NULL,
  phonetics_json TEXT NOT NULL DEFAULT '{}',
  part_of_speech TEXT NOT NULL,
  source_meanings_json TEXT NOT NULL,
  teaching_sense TEXT NOT NULL,
  teaching_senses_json TEXT NOT NULL DEFAULT '[]',
  exam_frequency INTEGER NOT NULL DEFAULT 0,
  pronunciation_mode TEXT NOT NULL CHECK (pronunciation_mode IN ('syllables', 'forms')),
  syllables_json TEXT NOT NULL,
  pronunciation_parts_json TEXT NOT NULL DEFAULT '{}',
  example_english TEXT NOT NULL,
  example_chinese TEXT NOT NULL,
  example_highlight TEXT NOT NULL,
  example_review_status TEXT NOT NULL CHECK (example_review_status = 'approved'),
  example_candidates_json TEXT NOT NULL DEFAULT '[]',
  visual_key TEXT NOT NULL,
  visual_version TEXT NOT NULL,
  visual_path TEXT NOT NULL,
  visual_alt TEXT NOT NULL,
  audio_key TEXT NOT NULL,
  audio_version TEXT NOT NULL,
  audio_path TEXT NOT NULL,
  audio_voice TEXT NOT NULL,
  audio_variants_json TEXT NOT NULL DEFAULT '{}',
  source_stage TEXT NOT NULL,
  source_day INTEGER NOT NULL,
  source_order INTEGER NOT NULL,
  printed_page INTEGER NOT NULL,
  source_verification TEXT NOT NULL CHECK (source_verification IN ('page-checked', 'index-and-heading-reviewed')),
  source_metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(program_id, source_order)
);

CREATE INDEX IF NOT EXISTS idx_sources_year_region ON sources(year, region);
CREATE INDEX IF NOT EXISTS idx_passages_source ON passages(source_id);
CREATE INDEX IF NOT EXISTS idx_question_groups_passage ON question_groups(passage_id);
CREATE INDEX IF NOT EXISTS idx_questions_group ON questions(group_id);
CREATE INDEX IF NOT EXISTS idx_reading_parse_results_group ON reading_parse_results(question_group_id);
CREATE INDEX IF NOT EXISTS idx_tag_links_target ON tag_links(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_paper_items_set ON paper_items(paper_set_id, display_order);
CREATE INDEX IF NOT EXISTS idx_import_file_texts_import ON import_file_texts(import_file_id);
CREATE INDEX IF NOT EXISTS idx_import_batch_items_batch ON import_batch_items(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_paper_asset_versions_paper ON paper_asset_versions(paper_id, asset_version);
CREATE INDEX IF NOT EXISTS idx_paper_import_runs_paper ON paper_import_runs(paper_id, asset_version);
CREATE INDEX IF NOT EXISTS idx_vocabulary_groups_program_order ON vocabulary_groups(program_id, start_order);
CREATE INDEX IF NOT EXISTS idx_vocabulary_entries_program_order ON vocabulary_entries(program_id, source_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vocabulary_entries_program_visual ON vocabulary_entries(program_id, visual_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vocabulary_entries_program_audio ON vocabulary_entries(program_id, audio_key);

DROP VIEW IF EXISTS v_question_group_cards;

CREATE VIEW v_question_group_cards AS
SELECT
  qg.id,
  qg.title,
  s.source_type,
  s.year,
  s.region,
  s.paper_name,
  s.section,
  p.title AS passage_title,
  p.summary,
  qg.group_type,
  qg.default_score,
  qg.difficulty,
  COUNT(DISTINCT q.id) AS question_count,
  COALESCE(MAX(CASE WHEN q.display_order = 1 THEN q.stem END), '') AS hit,
  COALESCE(MAX(CASE WHEN q.display_order = 1 THEN q.answer END), '') AS answer_preview,
  COALESCE(GROUP_CONCAT(DISTINCT t.name), '') AS tags
FROM question_groups qg
JOIN passages p ON p.id = qg.passage_id
JOIN sources s ON s.id = p.source_id
LEFT JOIN questions q ON q.group_id = qg.id
LEFT JOIN tag_links tl ON tl.target_type = 'question_group' AND tl.target_id = qg.id
LEFT JOIN tags t ON t.id = tl.tag_id AND t.is_active = 1
GROUP BY
  qg.id,
  qg.title,
  s.source_type,
  s.year,
  s.region,
  s.paper_name,
  s.section,
  p.title,
  p.summary,
  qg.group_type,
  qg.default_score,
  qg.difficulty;
