#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function git(args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function baselineRef() {
  try {
    git(['rev-parse', '--verify', 'github/main'])
    return 'github/main'
  } catch {
    return 'main'
  }
}

console.log('C8 verify: My Space artifact contracts')

// M0-1 user-data split: my_space_folders / my_space_artifacts schema now lives solely in
// server/my-space/mySpace.mjs's ensureMySpaceDatabaseShape (single source of truth per
// ADR-0011 / plan.md decision 2) — data/sql/schema.sql must NOT contain these tables.
const schema = read('data/sql/schema.sql')
assert('schema.sql no longer defines my_space_folders (moved to user database)', !/CREATE TABLE IF NOT EXISTS my_space_folders/.test(schema))
assert('schema.sql no longer defines my_space_artifacts (moved to user database)', !/CREATE TABLE IF NOT EXISTS my_space_artifacts/.test(schema))

const mySpaceModuleSourceForShape = read('server/my-space/mySpace.mjs')
assert('ensureMySpaceDatabaseShape creates my_space_folders table', /CREATE TABLE IF NOT EXISTS my_space_folders/.test(mySpaceModuleSourceForShape))
assert('ensureMySpaceDatabaseShape creates my_space_artifacts table', /CREATE TABLE IF NOT EXISTS my_space_artifacts/.test(mySpaceModuleSourceForShape))
assert('artifact stores file path', /file_path TEXT NOT NULL/.test(mySpaceModuleSourceForShape))
const mySpaceArtifactsTableBody = mySpaceModuleSourceForShape.match(/CREATE TABLE IF NOT EXISTS my_space_artifacts[\s\S]*?\);/)?.[0]
assert('my_space_artifacts table body located (BLOB check is not vacuous)', Boolean(mySpaceArtifactsTableBody))
assert('artifact does not store PDF blob', Boolean(mySpaceArtifactsTableBody) && !/pdf_blob|file_blob|BLOB/i.test(mySpaceArtifactsTableBody))
assert('artifact stores source draft id', /source_draft_paper_id TEXT NOT NULL/.test(mySpaceModuleSourceForShape))
assert('folder index exists', /idx_my_space_artifacts_folder/.test(mySpaceModuleSourceForShape))
assert('draft index exists', /idx_my_space_artifacts_draft/.test(mySpaceModuleSourceForShape))

// M0-4 user data isolation (docs/cuts/m0-4-user-scope/plan.md decisions 4-6): folders
// are now per-user unique (not globally unique) and both tables carry user_id.
const mySpaceFoldersTableBody = mySpaceModuleSourceForShape.match(/CREATE TABLE IF NOT EXISTS my_space_folders[\s\S]*?\);/)?.[0]
assert('my_space_folders table body located', Boolean(mySpaceFoldersTableBody))
assert('folder name is per-user unique, not globally unique', Boolean(mySpaceFoldersTableBody) && /UNIQUE\(user_id,\s*name\)/.test(mySpaceFoldersTableBody) && !/name TEXT NOT NULL UNIQUE/.test(mySpaceFoldersTableBody))
assert('folders table carries user_id', Boolean(mySpaceFoldersTableBody) && /user_id TEXT NOT NULL DEFAULT 'local'/.test(mySpaceFoldersTableBody))
assert('artifacts table carries user_id', Boolean(mySpaceArtifactsTableBody) && /user_id TEXT NOT NULL DEFAULT 'local'/.test(mySpaceArtifactsTableBody))

// The v2->v3 migration (rebuild + dedup-UPDATE + column ADDs) lives in server/api.mjs's
// ensureUserDatabaseShape, not here — mySpace.mjs only ever defines the new-form shape.
const apiSourceForMigration = read('server/api.mjs')
const ensureUserDbStartForMySpace = apiSourceForMigration.indexOf('function ensureUserDatabaseShape')
const ensureUserDbEndForMySpace = apiSourceForMigration.indexOf('function warnIfSharedDatabaseStillHasUserTables', ensureUserDbStartForMySpace)
const ensureUserDbSourceForMySpace = ensureUserDbStartForMySpace >= 0 && ensureUserDbEndForMySpace > ensureUserDbStartForMySpace
  ? apiSourceForMigration.slice(ensureUserDbStartForMySpace, ensureUserDbEndForMySpace)
  : ''
assert('ensureUserDatabaseShape source located (for my_space_folders rebuild assertions)', Boolean(ensureUserDbSourceForMySpace))
assert('my_space_folders rebuild guarded by user_version < 3 (never === 3)', /userVersion < 3/.test(ensureUserDbSourceForMySpace) && !/userVersion === 3/.test(ensureUserDbSourceForMySpace))
assert('my_space_folders rebuild wraps CREATE/INSERT/DROP/RENAME in a single BEGIN...COMMIT', /PRAGMA foreign_keys = OFF[\s\S]{0,100}BEGIN[\s\S]{0,900}COMMIT/.test(ensureUserDbSourceForMySpace))
assert('PRAGMA foreign_keys OFF/ON run outside the transaction (not between BEGIN/COMMIT)', (() => {
  const beginIndex = ensureUserDbSourceForMySpace.indexOf("db.exec('BEGIN')")
  const commitIndex = ensureUserDbSourceForMySpace.indexOf("db.exec('COMMIT')")
  const offIndex = ensureUserDbSourceForMySpace.indexOf("PRAGMA foreign_keys = OFF")
  const onIndex = ensureUserDbSourceForMySpace.indexOf("PRAGMA foreign_keys = ON")
  return beginIndex > 0 && commitIndex > beginIndex && offIndex >= 0 && offIndex < beginIndex && onIndex > commitIndex
})())
assert('rebuild verifies foreign_key_check after my_space_folders swap', /PRAGMA foreign_key_check/.test(ensureUserDbSourceForMySpace))
assert('post-migration index block creates per-user my_space_artifacts index', /idx_my_space_artifacts_user/.test(ensureUserDbSourceForMySpace) && /ON my_space_artifacts\(user_id, generated_at\)/.test(ensureUserDbSourceForMySpace))

const server = read('server/api.mjs')
const mySpaceRoutes = read('server/my-space/mySpaceRoutes.mjs')
assert('server imports My Space module', server.includes("from './my-space/mySpace.mjs'"))
assert('server resolves user-space root env', server.includes('QUESTION_BANK_USER_SPACE_ROOT'))
assert('server creates user-space files root on boot', server.includes('ensureMySpaceFilesRoot(userSpaceFilesDir)'))
assert('server exposes My Space list route', mySpaceRoutes.includes('/api\\/my-space$'))
assert('server exposes folder create route', mySpaceRoutes.includes('/api\\/my-space\\/folders$'))
assert('server exposes folder item route', mySpaceRoutes.includes('/api\\/my-space\\/folders\\/([^/]+)$'))
assert('server exposes artifact create route', mySpaceRoutes.includes('/api\\/my-space\\/artifacts$'))
assert('server exposes artifact item route', mySpaceRoutes.includes('/api\\/my-space\\/artifacts\\/([^/]+)$'))
assert('server exposes artifacts list alias', mySpaceRoutes.includes('/api\\/my-space\\/artifacts$') && mySpaceRoutes.includes('{ artifacts: snapshot.artifacts }'))
assert('server exposes static user-space route', mySpaceRoutes.includes('/user-space\\/files\\/[^/]+\\.pdf'))
assert('static route requires pdf suffix', mySpaceRoutes.includes('^\\/user-space\\/files\\/([^/]+)\\.pdf$'))
assert('static route rejects invalid artifact id', mySpaceRoutes.includes("Invalid artifact id"))
assert('save-to-space reuses recent PDF path', mySpaceRoutes.includes('preferRecent: true') && mySpaceRoutes.includes('reusedRecentPdf'))

const moduleSource = read('server/my-space/mySpace.mjs')
assert('My Space module writes PDF to disk', moduleSource.includes('writeFileSync(filePath, body)'))
assert('My Space module removes file on artifact delete', moduleSource.includes("rmSync(file, { force: true })"))
assert('My Space module removes partial file on DB failure', moduleSource.includes("rmSync(filePath, { force: true })"))
assert('My Space path guard compares resolved root', moduleSource.includes('path.resolve(filesRoot)') && moduleSource.includes("startsWith(`${root}${path.sep}`)"))
assert('unsupported nested folders by schema shape', !/parent_folder_id|parentId/.test(schema + moduleSource))

const vite = read('app/vite.config.ts')
assert('Vite proxies user-space static files', vite.includes("'/user-space'"))

const service = read('app/src/services/mySpace.ts')
assert('frontend can fetch My Space', service.includes('fetchMySpace'))
assert('frontend can create folders', service.includes('createMySpaceFolder'))
assert('frontend can rename folders', service.includes('renameMySpaceFolder'))
assert('frontend can delete folders', service.includes('deleteMySpaceFolder'))
assert('frontend can save draft paper artifact', service.includes('saveDraftPaperToMySpace'))
assert('frontend can download artifact', service.includes('downloadMySpaceArtifact'))

const workbench = read('app/src/features/draft-paper/DraftPaperWorkbench.tsx')
assert('Draft workbench exposes save to My Space', workbench.includes('保存到个人空间'))
assert('Draft workbench has compact save dialog', workbench.includes('draft-save-space-dialog'))
assert('Draft workbench creates folder from dialog', workbench.includes('createFolderInDialog'))
assert('Draft workbench does not print source metadata in A4', !workbench.includes('显示来源'))

const mySpacePage = read('app/src/features/my-space/MySpacePage.tsx')
assert('My Space route page exists', mySpacePage.includes('export function MySpacePage'))
assert('My Space page has one-level folder list', mySpacePage.includes('my-space-folders') && !mySpacePage.includes('children'))
assert('My Space page downloads artifacts', mySpacePage.includes('downloadMySpaceArtifact'))
assert('My Space page opens source draft', mySpacePage.includes('onOpenDraft'))
assert('My Space page handles missing source draft', mySpacePage.includes('原草稿卷已删除，PDF 仍可下载'))
// my-space-shelf (docs/cuts/my-space-shelf/plan.md): window.confirm was
// replaced with a self-built confirm modal (verify-my-space-shelf.mjs owns
// the full contract for it) — this assertion now checks its absence plus
// the presence of the custom dialog, instead of asserting window.confirm.
assert('My Space page deletes artifacts with a custom confirm dialog, not window.confirm', !mySpacePage.includes('window.confirm') && mySpacePage.includes('my-space-confirm-dialog'))

const app = read('app/src/App.tsx')
assert('App parses my-space route', app.includes("get('view') === 'my-space'"))
assert('App renders MySpacePage', app.includes('<MySpacePage'))
assert('App can navigate from draft to My Space', app.includes('onOpenMySpace={openMySpace}'))

const gitignore = read('.gitignore')
assert('user-space generated PDFs are gitignored', gitignore.includes('data/user-space/files/'))

const changed = [
  ...git(['diff', '--name-only', baselineRef()]).split('\n').filter(Boolean),
  ...git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean),
]
const forbidden = [
  'app/src/shared-ui/papersurface/',
  'shared/papersurface/',
  'app/src/features/reading-analysis/',
  'app/public/paper-assets/',
  'app/public/reports/',
  'server/print-renderer.mjs',
]
for (const prefix of forbidden) {
  assert(`forbidden scope untouched: ${prefix}`, !changed.some((file) => file.startsWith(prefix) || file === prefix))
}

const modulePath = path.join(rootDir, 'server/my-space/mySpace.mjs')
const mySpace = await import(modulePath)
const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-my-space-'))
const filesRoot = path.join(tempRoot, 'files')
const db = new DatabaseSync(path.join(tempRoot, 'test.sqlite'))
const USER_ID = 'local'

try {
  // M0-4 (docs/cuts/m0-4-user-scope/plan.md): draft_papers now carries user_id too
  // (fixture built by hand here, not via ensureUserDatabaseShape, since this file
  // only exercises server/my-space/mySpace.mjs in isolation).
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE draft_papers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    INSERT INTO draft_papers (id, user_id, title, status) VALUES ('draft-1', 'local', '0523 英语草稿卷', 'active');
  `)
  mySpace.ensureMySpaceDatabaseShape(db)
  mySpace.ensureMySpaceFilesRoot(filesRoot)
  assert('ensureMySpaceFilesRoot creates files root', existsSync(filesRoot))

  const folder = mySpace.createMySpaceFolder(db, USER_ID, { name: '高三一轮' })
  assert('createMySpaceFolder returns folder id', /^my-folder-/.test(folder.id))
  const renamed = mySpace.renameMySpaceFolder(db, USER_ID, folder.id, { name: '高三二轮' })
  assert('renameMySpaceFolder updates name', renamed.name === '高三二轮')

  const body = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\n%%EOF')
  const artifact = mySpace.saveMySpaceArtifact(db, USER_ID, {
    filesRoot,
    draftPaper: { id: 'draft-1', title: '0523 英语草稿卷' },
    folderId: folder.id,
    fileName: '0523 学生卷.pdf',
    pdfBody: body,
  })
  assert('saveMySpaceArtifact returns artifact id', /^artifact-/.test(artifact.id))
  assert('saveMySpaceArtifact returns static pdf URL', artifact.fileUrl === `/user-space/files/${artifact.id}.pdf`)
  assert('saveMySpaceArtifact counts PDF pages', artifact.pageCount === 2)
  const row = db.prepare('SELECT * FROM my_space_artifacts WHERE id = ?').get(artifact.id)
  assert('artifact row stores file path on disk', typeof row.file_path === 'string' && row.file_path.endsWith(`${artifact.id}.pdf`))
  assert('artifact row stores user_id', row.user_id === USER_ID)
  assert('artifact file exists on disk', existsSync(row.file_path))
  assert('artifact row does not store PDF body column', !Object.keys(row).some((key) => /blob|body/i.test(key)))

  const download = mySpace.resolveMySpaceArtifactForDownload(db, USER_ID, filesRoot, artifact.id)
  assert('resolveMySpaceArtifactForDownload returns body', Buffer.isBuffer(download?.body) && download.body.length === body.length)
  const downloadWrongUser = mySpace.resolveMySpaceArtifactForDownload(db, 'someone-else', filesRoot, artifact.id)
  assert('resolveMySpaceArtifactForDownload scopes by userId (cross-user = null)', downloadWrongUser === null)

  let traversalBlocked = false
  try {
    mySpace.resolveMySpaceArtifactPath(filesRoot, path.join(tempRoot, 'evil.pdf'))
  } catch {
    traversalBlocked = true
  }
  assert('resolveMySpaceArtifactPath blocks traversal outside root', traversalBlocked)

  const blockedFolderDelete = (() => {
    try {
      mySpace.deleteMySpaceFolder(db, USER_ID, folder.id)
      return false
    } catch {
      return true
    }
  })()
  assert('deleteMySpaceFolder blocks non-empty folders', blockedFolderDelete)

  db.prepare("UPDATE draft_papers SET status = 'deleted' WHERE id = 'draft-1'").run()
  const afterSourceGone = mySpace.listMySpace(db, USER_ID, { folderId: folder.id }).artifacts[0]
  assert('artifact survives source draft deletion', afterSourceGone.sourceDraftExists === false && existsSync(row.file_path))

  mySpace.deleteMySpaceArtifact(db, USER_ID, filesRoot, artifact.id)
  assert('deleteMySpaceArtifact removes row', !db.prepare('SELECT id FROM my_space_artifacts WHERE id = ?').get(artifact.id))
  assert('deleteMySpaceArtifact removes PDF file', !existsSync(row.file_path))
  assert('deleteMySpaceArtifact does not delete source draft row', !!db.prepare("SELECT id FROM draft_papers WHERE id = 'draft-1'").get())

  mySpace.deleteMySpaceFolder(db, USER_ID, folder.id)
  assert('deleteMySpaceFolder removes empty folder', !db.prepare('SELECT id FROM my_space_folders WHERE id = ?').get(folder.id))
} finally {
  db.close()
  rmSync(tempRoot, { recursive: true, force: true })
}

if (failed > 0) {
  console.error(`\nC8 My Space contracts verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nC8 My Space contracts verify passed: ${passed} passed, 0 failed`)
