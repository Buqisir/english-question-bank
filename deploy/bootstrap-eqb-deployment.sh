#!/usr/bin/env bash
set -Eeuo pipefail

# One-time migration from the mutable production checkout to immutable releases.
# This script is never part of an ordinary deployment. Run it as root only after
# a separate, current Owner authorization and a read-only production preflight.

umask 077
ROOT=/opt/eqb
SOURCE=$ROOT/english-question-bank
TARGET_SHA=${1-}
PUBLIC_KEY_FILE=${2-}
PUBLIC_KEY_TEMP=
TRANSPORT_USER=${EQB_DEPLOY_TRANSPORT_USER-}
BOOTSTRAP_UNIT=${EQB_DEPLOY_BOOTSTRAP_UNIT-}
BOOTSTRAP_KEY_BODY=${EQB_DEPLOY_BOOTSTRAP_PUBLIC_KEY_BODY-}
LEGACY_BASELINE_CHILD_DIGEST=${EQB_LEGACY_BASELINE_CHILD_DIGEST-}
LEGACY_BASELINE_CHILD_FILE_COUNT=4876
CONTROLLER_DIRECTORY=/usr/local/libexec
CONTROLLER=$CONTROLLER_DIRECTORY/eqb-deploy-controller-v1
TRANSPORT_CONTROLLER=$CONTROLLER_DIRECTORY/eqb-deploy-transport-v1
HOST_CONFIG_ROOT=$ROOT/deployments/host-configuration
SSH_DIRECTORY=
AUTHORIZED_KEYS=
AUTHORIZED_KEYS2=
KEY_COMMENT=eqb-amp-deployment-v1
FAILURE_BACKUP_ROOT=/var/backups/eqb
FIXED_PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin
export PATH=$FIXED_PATH
export GIT_TERMINAL_PROMPT=0
export GCM_INTERACTIVE=never
export GIT_SSH_COMMAND='/usr/bin/ssh -F /dev/null -o BatchMode=yes -o PasswordAuthentication=no'
exec 3>&2
activated=0
key_installed=0
build_user_created=0
build_group_created=0
controller_directory_created=0
rollback_armed=0
initial_health_verified=0
root_hardened=0
archive_dir=
staging=
build_home=
backup=
bootstrap_log=
success_receipt=
baseline_inspector=
stage=preflight
declare -a protected_paths=()
declare -A protected_modes=()
declare -A database_identities=()
declare -A database_snapshot_digests=()
declare -A persistence_identities=()

assert_not_cancelled() {
  local cancellation=$FAILURE_BACKUP_ROOT/bootstrap-cancellation-$BOOTSTRAP_UNIT.json
  if [[ ! -e $cancellation && ! -L $cancellation ]]; then return; fi
  /usr/bin/node --input-type=module - "$cancellation" "$TARGET_SHA" "$BOOTSTRAP_UNIT" <<'NODE'
import fs from 'node:fs'

const [filePath, targetSha, unit] = process.argv.slice(2)
const state = fs.lstatSync(filePath)
if (
  !state.isFile()
  || state.isSymbolicLink()
  || state.uid !== 0
  || state.gid !== 0
  || (state.mode & 0o7777) !== 0o600
  || state.nlink !== 1
  || state.size < 1
  || state.size > 4096
) process.exit(1)
const receipt = JSON.parse(fs.readFileSync(filePath, 'utf8'))
const expectedKeys = [
  'cancellationInstalled',
  'conclusion',
  'hostAttemptStarted',
  'schemaVersion',
  'state',
  'targetSha',
  'unit',
]
if (
  !receipt
  || typeof receipt !== 'object'
  || Array.isArray(receipt)
  || Object.keys(receipt).sort().join('\n') !== expectedKeys.join('\n')
  || receipt.schemaVersion !== 'eqb-release-bootstrap-cancellation-v1'
  || receipt.state !== 'reported'
  || receipt.conclusion !== 'cancelled'
  || receipt.targetSha !== targetSha
  || receipt.unit !== unit
  || receipt.cancellationInstalled !== true
  || typeof receipt.hostAttemptStarted !== 'boolean'
) process.exit(1)
NODE
  fail 'bootstrap attempt was cancelled before host acceptance'
}

register_host_acceptance() {
  local marker=$FAILURE_BACKUP_ROOT/bootstrap-attempt-$BOOTSTRAP_UNIT.json
  local temporary
  [[ ! -e $marker && ! -L $marker ]] \
    || fail 'bootstrap unit already has host acceptance evidence'
  temporary=$(mktemp "$FAILURE_BACKUP_ROOT/.bootstrap-attempt-XXXXXXXX")
  if ! printf '{"schemaVersion":"eqb-release-bootstrap-attempt-v1","state":"accepted","targetSha":"%s","unit":"%s"}\n' \
      "$TARGET_SHA" "$BOOTSTRAP_UNIT" > "$temporary" \
    || ! chown root:root "$temporary" \
    || ! chmod 0600 "$temporary" \
    || [[ $(stat -c '%u:%g:%a:%h' "$temporary") != 0:0:600:1 ]] \
    || ! /usr/bin/sync -d "$temporary" \
    || ! mv "$temporary" "$marker" \
    || ! /usr/bin/sync -d "$FAILURE_BACKUP_ROOT"; then
    rm -f "$temporary"
    fail 'cannot retain bootstrap host acceptance evidence'
  fi
}

report_failure() {
  local failed_stage=$1 exit_code=$2 rollback_json=$3
  local failure_receipt failure_receipt_temp
  local evidence_retained=false
  if [[ -n $backup && -d $backup && -n $bootstrap_log && -f $bootstrap_log ]]; then
    failure_receipt=$backup/failure-receipt.json
    failure_receipt_temp=$backup/.failure-receipt-$$
    if cat > "$failure_receipt_temp" <<EOF
{
  "schemaVersion": "eqb-deployment-bootstrap-failure-v1",
  "state": "reported",
  "conclusion": "failure",
  "targetSha": "$TARGET_SHA",
  "failedStage": "$failed_stage",
  "exitCode": $exit_code,
  "rollbackHealthy": $rollback_json,
  "evidenceRetained": true
}
EOF
    then
      if chmod 0600 "$failure_receipt_temp" \
        && mv "$failure_receipt_temp" "$failure_receipt"; then
        evidence_retained=true
      fi
    fi
    rm -f "$failure_receipt_temp"
  fi
  printf 'EQB_BOOTSTRAP_FAILURE {"schemaVersion":"eqb-deployment-bootstrap-failure-v1","state":"reported","conclusion":"failure","targetSha":"%s","failedStage":"%s","exitCode":%d,"rollbackHealthy":%s,"evidenceRetained":%s}\n' \
    "$TARGET_SHA" "$failed_stage" "$exit_code" "$rollback_json" "$evidence_retained" >&3
}

fail() {
  local rollback_json=false
  printf 'EQB deployment bootstrap failed closed: %s\n' "$*" >&2
  if declare -F rollback >/dev/null && (( rollback_armed == 1 )); then
    rollback 1
  fi
  set +e
  if (( initial_health_verified == 1 )); then rollback_json=true; fi
  report_failure "$stage" 1 "$rollback_json"
  exit 1
}

cleanup_public_key() {
  if [[ -n $PUBLIC_KEY_TEMP ]]; then rm -f "$PUBLIC_KEY_TEMP"; fi
}

assert_authorized_keys_state() {
  local expected_forced_key=${1-}
  /usr/bin/node --input-type=module - \
    "$AUTHORIZED_KEYS" "$BOOTSTRAP_KEY_BODY" "$key_body" "$expected_forced_key" <<'NODE'
import fs from 'node:fs'

const [filePath, bootstrapBody, controllerBody, expectedForcedKey] = process.argv.slice(2)
const bytes = fs.readFileSync(filePath)
if (bytes.length > 1024 * 1024 || bytes.includes(0) || bytes.includes(13)) process.exit(1)
const lines = bytes.toString('utf8').split('\n').filter(Boolean)
const matching = (body) => lines.filter((line) => line.trim().split(/[\t ]+/u).includes(body))
const bootstrapLines = matching(bootstrapBody)
const bootstrapFields = bootstrapLines[0]?.trim().split(/[\t ]+/u) || []
if (
  bootstrapLines.length !== 1
  || bootstrapFields[0] !== 'ssh-ed25519'
  || bootstrapFields[1] !== bootstrapBody
) process.exit(1)
const controllerLines = matching(controllerBody)
if (
  expectedForcedKey
    ? controllerLines.length !== 1 || controllerLines[0].trim() !== expectedForcedKey
    : controllerLines.length !== 0
) process.exit(1)
const authorizationLines = lines.filter((line) => line.trim() && !line.trim().startsWith('#'))
if (authorizationLines.length !== (expectedForcedKey ? 2 : 1)) process.exit(1)
NODE
}

install_forced_key() {
  /usr/bin/node --input-type=module - \
    "$AUTHORIZED_KEYS" "$transport_uid" "$transport_gid" "$forced_key" <<'NODE'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const [authorizedKeys, uidValue, gidValue, forcedKey] = process.argv.slice(2)
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
const originalState = fs.lstatSync(authorizedKeys)
if (!originalState.isFile() || originalState.isSymbolicLink() || originalState.nlink !== 1) {
  throw new Error('authorized-keys-state')
}
const original = fs.readFileSync(authorizedKeys)
const separator = original.length === 0 || original.at(-1) === 10 ? '' : '\n'
const replacement = Buffer.concat([original, Buffer.from(`${separator}${forcedKey}\n`),])
const temporary = path.join(
  path.dirname(authorizedKeys),
  `.authorized_keys-eqb-${crypto.randomBytes(12).toString('hex')}`,
)
let descriptor
try {
  descriptor = fs.openSync(temporary, 'wx', 0o600)
  fs.writeFileSync(descriptor, replacement)
  fs.fsyncSync(descriptor)
  fs.fchownSync(descriptor, Number(uidValue), Number(gidValue))
  fs.fchmodSync(descriptor, 0o600)
  fs.closeSync(descriptor)
  descriptor = undefined
  const currentState = fs.lstatSync(authorizedKeys)
  if (
    currentState.dev !== originalState.dev
    || currentState.ino !== originalState.ino
    || currentState.uid !== originalState.uid
    || currentState.gid !== originalState.gid
    || (currentState.mode & 0o7777) !== (originalState.mode & 0o7777)
    || currentState.nlink !== originalState.nlink
    || hash(fs.readFileSync(authorizedKeys)) !== hash(original)
  ) throw new Error('authorized-keys-race')
  fs.renameSync(temporary, authorizedKeys)
  const directory = fs.openSync(path.dirname(authorizedKeys), 'r')
  try {
    fs.fsyncSync(directory)
  } finally {
    fs.closeSync(directory)
  }
} finally {
  if (descriptor !== undefined) fs.closeSync(descriptor)
  try {
    fs.unlinkSync(temporary)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
NODE
}

verify_sqlite_database() {
  local database=$1
  /usr/bin/node --no-warnings --input-type=module - "$database" <<'NODE'
import { DatabaseSync } from 'node:sqlite'

const database = new DatabaseSync(process.argv[2], { readOnly: true })
try {
  const integrity = database.prepare('PRAGMA integrity_check').all()
  const foreignKeys = database.prepare('PRAGMA foreign_key_check').all()
  if (
    integrity.length !== 1
    || Object.values(integrity[0])[0] !== 'ok'
    || foreignKeys.length !== 0
  ) process.exitCode = 1
} finally {
  database.close()
}
NODE
}

snapshot_databases() {
  local database_name database_path expected_identity snapshot
  install -d -o root -g root -m 0700 "$backup/databases"
  for database_name in question-bank.sqlite user-data.sqlite import-ops.sqlite; do
    database_path=$SOURCE/data/$database_name
    expected_identity=${database_identities[$database_name]-}
    [[ -n $expected_identity && -f $database_path && ! -L $database_path \
      && $(stat -c '%d:%i' "$database_path") == "$expected_identity" ]] \
      || fail "production database changed before snapshot: $database_name"
    snapshot=$backup/databases/$database_name
    /usr/bin/sqlite3 "$database_path" ".backup '$snapshot'"
    [[ -f $database_path && ! -L $database_path \
      && $(stat -c '%d:%i' "$database_path") == "$expected_identity" ]] \
      || fail "production database changed during snapshot: $database_name"
    chown root:root "$snapshot"
    chmod 0600 "$snapshot"
    verify_sqlite_database "$snapshot" \
      || fail "production database snapshot is invalid: $database_name"
    database_snapshot_digests["$database_name"]=$(/usr/bin/sha256sum "$snapshot" | /usr/bin/cut -d ' ' -f 1)
    /usr/bin/sync -d "$snapshot"
  done
}

normalize_generated_dist() {
  local dist=$1
  /usr/bin/node --input-type=module - "$dist" <<'NODE'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const dist = process.argv[2]
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
function manifest(verifyModes) {
  const entries = []
  function walk(absolute, relative = '.') {
    const stat = fs.lstatSync(absolute)
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      throw new Error('generated-dist-special-node')
    }
    if (stat.isFile() && stat.nlink !== 1) throw new Error('generated-dist-linked-file')
    const type = stat.isDirectory() ? 'directory' : 'file'
    const expectedMode = type === 'directory' ? 0o755 : 0o644
    if (verifyModes && (stat.mode & 0o7777) !== expectedMode) {
      throw new Error('generated-dist-mode')
    }
    entries.push({
      relative,
      type,
      uid: stat.uid,
      gid: stat.gid,
      dev: stat.dev,
      ino: stat.ino,
      nlink: stat.nlink,
      size: stat.size,
      digest: stat.isFile() ? hash(fs.readFileSync(absolute)) : null,
    })
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) {
        walk(path.join(absolute, name), relative === '.' ? name : `${relative}/${name}`)
      }
    }
  }
  walk(dist)
  if (!entries.some((entry) => entry.relative === 'index.html' && entry.type === 'file')) {
    throw new Error('generated-dist-index-missing')
  }
  return entries
}

const before = manifest(false)
for (const entry of before) {
  const absolute = entry.relative === '.' ? dist : path.join(dist, entry.relative)
  const expectedMode = entry.type === 'directory' ? 0o755 : 0o644
  const flags = fs.constants.O_RDONLY
    | fs.constants.O_NOFOLLOW
    | fs.constants.O_NONBLOCK
    | (entry.type === 'directory' ? fs.constants.O_DIRECTORY : 0)
  const descriptor = fs.openSync(absolute, flags)
  try {
    const current = fs.fstatSync(descriptor)
    const currentType = current.isDirectory() ? 'directory' : current.isFile() ? 'file' : 'other'
    if (
      currentType !== entry.type
      || current.uid !== entry.uid
      || current.gid !== entry.gid
      || current.dev !== entry.dev
      || current.ino !== entry.ino
      || current.nlink !== entry.nlink
      || current.size !== entry.size
    ) throw new Error('generated-dist-normalize-race')
    fs.fchmodSync(descriptor, expectedMode)
  } finally {
    fs.closeSync(descriptor)
  }
}
const after = manifest(true)
if (JSON.stringify(before) !== JSON.stringify(after)) {
  throw new Error('generated-dist-normalize-drift')
}
NODE
}

trap cleanup_public_key EXIT
trap 'fail "unexpected command failure during $stage"' ERR

[[ $(id -u) == 0 ]] || fail 'run as root'
[[ $TARGET_SHA =~ ^[a-f0-9]{40}$ ]] || fail 'target SHA is invalid'
[[ $BOOTSTRAP_UNIT =~ ^eqb-release-bootstrap-[a-f0-9]{32}$ ]] \
  || fail 'bootstrap unit is invalid'
[[ $TRANSPORT_USER =~ ^[a-z_][a-z0-9_-]*$ && $TRANSPORT_USER != root ]] \
  || fail 'deployment SSH transport account is invalid'
[[ $BOOTSTRAP_KEY_BODY =~ ^[A-Za-z0-9+/]+={0,3}$ ]] \
  || fail 'bootstrap public key environment input is invalid'
[[ $LEGACY_BASELINE_CHILD_DIGEST =~ ^[a-f0-9]{64}$ ]] \
  || fail 'legacy baseline digest environment input is invalid'
[[ -d $FAILURE_BACKUP_ROOT && ! -L $FAILURE_BACKUP_ROOT \
  && $(stat -c '%u:%g:%a' "$FAILURE_BACKUP_ROOT") == 0:0:700 ]] \
  || fail 'root-private bootstrap evidence directory is unavailable'
assert_not_cancelled
register_host_acceptance
backup=$(mktemp -d "$FAILURE_BACKUP_ROOT/bootstrap-attempt-${TARGET_SHA:0:12}-XXXXXXXX")
chown root:root "$backup"
chmod 0700 "$backup"
bootstrap_log=$backup/build.log
install -o root -g root -m 0600 /dev/null "$bootstrap_log"
exec 2>> "$bootstrap_log"
if [[ $PUBLIC_KEY_FILE == - ]]; then
  [[ ${EQB_DEPLOY_CONTROLLER_PUBLIC_KEY_BODY-} =~ ^[A-Za-z0-9+/]+={0,3}$ ]] \
    || fail 'controller public key environment input is invalid'
  PUBLIC_KEY_TEMP=$(mktemp /run/eqb-controller-public-key-XXXXXXXX)
  printf 'ssh-ed25519 %s\n' "$EQB_DEPLOY_CONTROLLER_PUBLIC_KEY_BODY" > "$PUBLIC_KEY_TEMP"
  chmod 0600 "$PUBLIC_KEY_TEMP"
  PUBLIC_KEY_FILE=$PUBLIC_KEY_TEMP
fi
[[ -f $PUBLIC_KEY_FILE ]] || fail 'controller public key file is missing'
[[ ! -e $ROOT/current && ! -L $ROOT/current ]] || fail 'release layout already has a current pointer'
[[ ! -e $ROOT/releases && ! -L $ROOT/releases \
  && ! -e $ROOT/shared && ! -L $ROOT/shared \
  && ! -e $ROOT/deployments && ! -L $ROOT/deployments ]] \
  || fail 'partial or linked release layout requires manual inspection'
[[ ! -e $CONTROLLER && ! -L $CONTROLLER \
  && ! -e $TRANSPORT_CONTROLLER && ! -L $TRANSPORT_CONTROLLER ]] \
  || fail 'deployment controller is already installed'
[[ ! -e $HOST_CONFIG_ROOT && ! -L $HOST_CONFIG_ROOT ]] \
  || fail 'deployment host configuration already exists'
[[ -d /usr/local && ! -L /usr/local \
  && $(stat -c '%u:%g:%a' /usr/local) == 0:0:755 ]] \
  || fail 'controller parent ancestry is unsafe'
if [[ -e $CONTROLLER_DIRECTORY || -L $CONTROLLER_DIRECTORY ]]; then
  [[ -d $CONTROLLER_DIRECTORY && ! -L $CONTROLLER_DIRECTORY \
    && $(stat -c '%u:%g:%a' "$CONTROLLER_DIRECTORY") == 0:0:755 ]] \
    || fail 'controller directory is unsafe'
fi
IFS=: read -r resolved_transport _ transport_uid transport_gid _ transport_home transport_shell \
  < <(getent passwd "$TRANSPORT_USER") || fail 'deployment SSH transport account is missing'
[[ $resolved_transport == "$TRANSPORT_USER" \
  && $transport_uid =~ ^[0-9]+$ && $transport_uid != 0 \
  && $transport_gid =~ ^[0-9]+$ \
  && $transport_home == /* && $transport_home != *:* ]] \
  || fail 'deployment SSH transport account metadata is invalid'
[[ -d $transport_home && ! -L $transport_home \
  && $(stat -c '%u' "$transport_home") == "$transport_uid" ]] \
  || fail 'deployment SSH transport home is unsafe'
transport_home_mode=$(stat -c '%a' "$transport_home")
(( (8#$transport_home_mode & 0022) == 0 )) \
  || fail 'deployment SSH transport home is writable by another account'
SSH_DIRECTORY=$transport_home/.ssh
AUTHORIZED_KEYS=$SSH_DIRECTORY/authorized_keys
AUTHORIZED_KEYS2=$SSH_DIRECTORY/authorized_keys2
[[ -d $SSH_DIRECTORY && ! -L $SSH_DIRECTORY \
  && $(stat -c '%u:%g:%a' "$SSH_DIRECTORY") == "$transport_uid:$transport_gid:700" ]] \
  || fail 'deployment SSH transport directory is unsafe'
[[ -f $AUTHORIZED_KEYS && ! -L $AUTHORIZED_KEYS \
  && $(stat -c '%u:%g:%a:%h' "$AUTHORIZED_KEYS") == "$transport_uid:$transport_gid:600:1" \
  && ! -e $AUTHORIZED_KEYS2 && ! -L $AUTHORIZED_KEYS2 ]] \
  || fail 'deployment SSH transport authorized_keys boundary is unsafe'
for host_config in /etc/systemd/system/eqb.service /etc/caddy/Caddyfile; do
  [[ -f $host_config && ! -L $host_config \
    && $(stat -c '%u:%g:%a' "$host_config") == 0:0:644 ]] \
    || fail "legacy host configuration is unsafe: $host_config"
done
[[ -d $SOURCE && ! -L $SOURCE ]] || fail 'legacy production checkout is missing or linked'
for relative in .git app app/public server; do
  [[ -d $SOURCE/$relative && ! -L $SOURCE/$relative ]] \
    || fail "legacy production ancestor is missing or linked: $SOURCE/$relative"
done
read -r root_uid root_gid root_mode < <(stat -c '%u %g %a' "$ROOT")
eqb_uid=$(id -u eqb)
[[ $(systemctl is-active eqb || true) == active ]] || fail 'eqb is not active before bootstrap'
[[ $(systemctl is-active caddy || true) == active ]] || fail 'caddy is not active before bootstrap'
[[ -z $(runuser -u eqb -- git -C "$SOURCE" status --porcelain --untracked-files=no) ]] \
  || fail 'legacy production checkout has tracked changes'
production_sha=$(runuser -u eqb -- git -C "$SOURCE" rev-parse HEAD)
[[ $production_sha =~ ^[a-f0-9]{40}$ ]] || fail 'legacy production SHA is invalid'
[[ -f $SOURCE/.env && ! -L $SOURCE/.env ]] || fail 'legacy production .env is missing or linked'
for relative in data app/public/paper-assets exports server/logs; do
  legacy_path=$SOURCE/$relative
  [[ ! -L $legacy_path ]] || fail "legacy path is already a symlink: $legacy_path"
  [[ ! -e $legacy_path || -d $legacy_path ]] || fail "legacy path is not a directory: $legacy_path"
  if [[ -d $legacy_path ]]; then
    persistence_identities["$relative"]=$(stat -c '%d:%i' "$legacy_path")
  fi
done
persistence_identities[.env]=$(stat -c '%d:%i' "$SOURCE/.env")
for database_name in question-bank.sqlite user-data.sqlite import-ops.sqlite; do
  database_path=$SOURCE/data/$database_name
  [[ -f $database_path && ! -L $database_path ]] \
    || fail "production database is missing or linked: $database_name"
  verify_sqlite_database "$database_path" \
    || fail "production database integrity gate failed: $database_name"
  database_identities["$database_name"]=$(stat -c '%d:%i' "$database_path")
done

read -r key_type key_body key_extra < "$PUBLIC_KEY_FILE" || fail 'cannot read controller public key'
[[ $key_type == ssh-ed25519 && $key_body =~ ^[A-Za-z0-9+/]+={0,3}$ && -z ${key_extra-} ]] \
  || fail 'controller public key must be one bare Ed25519 key'
[[ $key_body != "$BOOTSTRAP_KEY_BODY" ]] || fail 'bootstrap and controller identities must differ'
ssh-keygen -l -f "$PUBLIC_KEY_FILE" >/dev/null || fail 'controller public key is invalid'
forced_key="restrict,command=\"$TRANSPORT_CONTROLLER\" $key_type $key_body $KEY_COMMENT"
assert_authorized_keys_state || fail 'bootstrap authorized_keys state is ineligible'

origin=$(runuser -u eqb -- git -C "$SOURCE" remote get-url origin)
case "$origin" in
  https://github.com/Buqisir/english-question-bank|\
  https://github.com/Buqisir/english-question-bank.git|\
  git@github.com:Buqisir/english-question-bank|\
  git@github.com:Buqisir/english-question-bank.git|\
  ssh://git@github.com/Buqisir/english-question-bank|\
  ssh://git@github.com/Buqisir/english-question-bank.git) ;;
  *) fail 'legacy production origin is not the fixed repository' ;;
esac
runuser -u eqb -- git -C "$SOURCE" fetch --quiet --no-tags origin main
[[ $(runuser -u eqb -- git -C "$SOURCE" rev-parse FETCH_HEAD) == "$TARGET_SHA" ]] \
  || fail 'fetched main does not match the authorized target'
/usr/bin/git -c safe.directory="$SOURCE" -C "$SOURCE" \
  merge-base --is-ancestor "$production_sha" "$TARGET_SHA" \
  || fail 'target ancestry does not continue from the established baseline'
protected_changes=$(/usr/bin/git -c safe.directory="$SOURCE" -C "$SOURCE" \
  diff --name-only --no-renames "$production_sha" "$TARGET_SHA" -- \
  data/sql \
  server/api.mjs \
  server/auth/auth.mjs \
  server/draft-paper/draftPaperStore.mjs \
  server/import-review/importReviewStore.mjs \
  server/my-space/mySpace.mjs \
  server/paper-import/publisher.mjs \
  server/paper-import/storage.mjs \
  server/source-intake/sourceIntakeStore.mjs \
  server/user-data \
  server/vocabulary/vocabularyStore.mjs)
[[ -z $protected_changes ]] \
  || fail 'target changes persistence authority; complete a separately authorized migration procedure first'

stage=verify-established-baseline
baseline_inspector=$backup/eqb-legacy-baseline-state.mjs
/usr/bin/git -c safe.directory="$SOURCE" -C "$SOURCE" \
  show "$TARGET_SHA:deploy/eqb-legacy-baseline-state.mjs" > "$baseline_inspector"
chmod 0600 "$baseline_inspector"
/usr/bin/node --check "$baseline_inspector"
declare -A baseline_evidence=()
baseline_output=$(/usr/bin/node "$baseline_inspector" \
  "$SOURCE" "$FAILURE_BACKUP_ROOT" /home/eqb "$production_sha" \
  "$LEGACY_BASELINE_CHILD_DIGEST" "$LEGACY_BASELINE_CHILD_FILE_COUNT" eqb "$TRANSPORT_USER") \
  || fail 'established baseline evidence inspection failed'
while IFS='=' read -r evidence_key evidence_value; do
  case "$evidence_key" in
    baselineState|baselineReceipts|baselineFailedReceipts|quarantineChildren|liveReleaseLayout|defaultIdentity|controllerSudo) ;;
    *) fail 'established baseline evidence shape is invalid' ;;
  esac
  [[ ! -v baseline_evidence[$evidence_key] ]] \
    || fail 'established baseline evidence contains duplicate fields'
  baseline_evidence["$evidence_key"]=$evidence_value
done <<< "$baseline_output"
[[ ${#baseline_evidence[@]} == 7 ]] \
  || fail 'established baseline evidence is incomplete'
[[ ${baseline_evidence[baselineState]-} == established \
  && ${baseline_evidence[baselineReceipts]-} == 1 \
  && ${baseline_evidence[quarantineChildren]-} == 1 \
  && ${baseline_evidence[liveReleaseLayout]-} == absent \
  && ${baseline_evidence[defaultIdentity]-} == ok ]] \
  || fail 'legacy production is not an established baseline'
[[ ${baseline_evidence[controllerSudo]-} == ok ]] \
  || fail 'deployment SSH transport sudo scope does not allow the forced controller'

for executable in \
  /usr/bin/node /usr/bin/npm /usr/bin/pnpm /usr/bin/git /usr/bin/tar /usr/bin/getent /usr/bin/df \
  /usr/bin/sqlite3 /usr/bin/sudo /usr/bin/sha256sum /usr/bin/cut /usr/bin/sync \
  /usr/bin/caddy /usr/bin/curl /usr/bin/systemctl /usr/bin/systemd-analyze /usr/bin/systemd-run \
  /usr/bin/journalctl \
  /usr/bin/flock /usr/bin/ssh-keygen /usr/bin/timeout \
  /usr/sbin/runuser /usr/sbin/useradd /usr/sbin/userdel /usr/sbin/groupdel; do
  [[ -x $executable ]] || fail "required executable is missing: $executable"
done
available_bytes=$(/usr/bin/df --output=avail -B1 "$ROOT" | /usr/bin/tail -n 1 | /usr/bin/tr -d ' ')
[[ $available_bytes =~ ^[0-9]+$ && $available_bytes -ge 5368709120 ]] \
  || fail 'production filesystem needs at least 5 GiB free for bootstrap staging'

build_user_missing=0
if ! id -u eqb-build >/dev/null 2>&1; then
  build_user_missing=1
  ! getent group eqb-build >/dev/null \
    || fail 'partial isolated build identity already exists'
else
  [[ $(id -u eqb-build) != "$eqb_uid" ]] || fail 'build and runtime users must differ'
  getent group eqb-build >/dev/null || fail 'existing build group is missing'
fi

release=$ROOT/releases/$TARGET_SHA
archive=

cleanup() {
  local cleanup_status=0
  if ! cleanup_public_key; then cleanup_status=1; fi
  if [[ -n $archive_dir ]] && ! rm -rf "$archive_dir"; then cleanup_status=1; fi
  if [[ -n $build_home ]] && ! rm -rf "$build_home"; then cleanup_status=1; fi
  if [[ -n $staging && -d $staging ]] && ! rm -rf "$staging"; then cleanup_status=1; fi
  return "$cleanup_status"
}

restore_protected_modes() {
  local path restore_status=0
  for path in "${protected_paths[@]}"; do
    if [[ -e $path || -L $path ]]; then
      chmod "${protected_modes[$path]}" "$path" || restore_status=1
    fi
  done
  return "$restore_status"
}

restore_file() {
  local saved=$1 destination=$2
  if [[ -f $saved ]]; then
    local destination_directory temporary
    destination_directory=$(dirname "$destination") || return 1
    [[ -d $destination_directory && ! -L $destination_directory ]] || return 1
    temporary=$(mktemp "$destination_directory/.eqb-rollback-XXXXXXXX") || return 1
    if ! cp --preserve=mode,ownership,timestamps "$saved" "$temporary" \
      || ! mv -fT "$temporary" "$destination"; then
      rm -f "$temporary"
      return 1
    fi
  else
    rm -f "$destination" || return 1
  fi
}

restore_migrated_directory() {
  local source_path=$1 shared_name=$2
  local shared_path=$ROOT/shared/$shared_name
  if [[ -L $source_path ]]; then rm -f "$source_path" || return 1; fi
  if [[ -e $source_path ]]; then return 0; fi
  if [[ -f $backup/legacy-$shared_name-existed ]]; then
    [[ -d $shared_path && ! -L $shared_path ]] || return 1
    mkdir -p "$(dirname "$source_path")" || return 1
    mv "$shared_path" "$source_path" || return 1
  else
    rm -rf "$shared_path" || return 1
  fi
}

remove_empty_directory() {
  local directory=$1
  if [[ -e $directory || -L $directory ]]; then
    [[ -d $directory && ! -L $directory ]] || return 1
    rmdir "$directory" || return 1
  fi
}

strict_health_once() {
  /usr/bin/timeout --signal=TERM --kill-after=2s 15s /bin/bash -c '
    set -e
    systemctl is-active --quiet eqb
    systemctl is-active --quiet caddy
    curl --fail --silent --show-error --connect-timeout 3 --max-time 5 \
      http://127.0.0.1:8787/api/health >/dev/null
    curl --fail --fail-early --silent --show-error --connect-timeout 3 --max-time 5 \
      --resolve eqbank.cc:443:127.0.0.1 \
      https://eqbank.cc/api/health https://eqbank.cc/ >/dev/null
    curl --fail --fail-early --silent --show-error --connect-timeout 3 --max-time 5 \
      --parallel --parallel-immediate --parallel-max 4 \
      https://eqbank.cc/api/health \
      https://eqbank.cc/ \
      https://eqbank.cc/ops/ \
      "https://eqbank.cc/ops/?view=review" >/dev/null
  '
}

wait_for_strict_health() {
  local deadline=$((SECONDS + 30))
  while (( SECONDS < deadline )); do
    if strict_health_once; then return 0; fi
    sleep 1
  done
  return 1
}

rollback() {
  local exit_code=${1:-1}
  local failed_stage=$stage
  local rollback_healthy=1
  local service_recovered=1
  local rollback_json=false
  trap - ERR
  set +e
  rollback_step() {
    if ! "$@"; then
      rollback_healthy=0
      printf 'Legacy rollback step failed: %s\n' "$*" >&2
    fi
    return 0
  }
  if (( activated == 1 )); then
    rollback_step restore_file "$backup/eqb.service" /etc/systemd/system/eqb.service
    rollback_step restore_file "$backup/Caddyfile" /etc/caddy/Caddyfile
    rollback_step rm -f "$ROOT/current"
    rollback_step rm -rf "$release"
    rollback_step restore_migrated_directory "$SOURCE/data" data
    rollback_step restore_migrated_directory "$SOURCE/app/public/paper-assets" paper-assets
    rollback_step restore_migrated_directory "$SOURCE/exports" exports
    rollback_step restore_migrated_directory "$SOURCE/server/logs" server-logs
    if [[ -L $SOURCE/.env ]]; then rollback_step rm -f "$SOURCE/.env"; fi
    if [[ ! -e $SOURCE/.env && -f $ROOT/shared/.env ]]; then
      rollback_step mv "$ROOT/shared/.env" "$SOURCE/.env"
    fi
    rollback_step remove_empty_directory "$ROOT/shared"
    rollback_step restore_protected_modes
    rollback_step systemctl daemon-reload
    rollback_step systemctl restart eqb
    rollback_step systemctl reload caddy
    service_recovered=0
    if wait_for_strict_health; then service_recovered=1; fi
    if (( service_recovered == 0 )); then rollback_healthy=0; fi
  else
    rollback_step restore_protected_modes
  fi
  if (( key_installed == 1 )); then
    rollback_step restore_file "$backup/authorized_keys" "$AUTHORIZED_KEYS"
  fi
  rollback_step rm -f "$CONTROLLER" "$TRANSPORT_CONTROLLER"
  rollback_step rm -rf "$HOST_CONFIG_ROOT"
  if (( controller_directory_created == 1 )); then
    rollback_step remove_empty_directory "$CONTROLLER_DIRECTORY"
  fi
  rollback_step cleanup
  if [[ -n $success_receipt ]]; then rollback_step rm -f "$success_receipt"; fi
  rollback_step remove_empty_directory "$ROOT/releases"
  rollback_step remove_empty_directory "$ROOT/deployments/receipts"
  rollback_step remove_empty_directory "$ROOT/deployments"
  if (( build_user_created == 1 )); then
    if id -u eqb-build >/dev/null 2>&1; then rollback_step userdel --remove eqb-build; fi
  fi
  if (( build_group_created == 1 )) && getent group eqb-build >/dev/null; then
    rollback_step groupdel eqb-build
  fi
  if (( root_hardened == 1 && rollback_healthy == 1 )); then
    rollback_step chown "$root_uid:$root_gid" "$ROOT"
    rollback_step chmod "$root_mode" "$ROOT"
  fi
  if (( rollback_healthy == 1 )); then rollback_json=true; fi
  report_failure "$failed_stage" "$exit_code" "$rollback_json"
  if (( rollback_healthy == 1 )); then
    printf 'EQB deployment bootstrap rolled back; legacy service configuration restored and healthy\n' >&2
  else
    printf 'CRITICAL: legacy rollback is unhealthy; root-private backup retained\n' >&2
  fi
  exit "$exit_code"
}

stage=initial-health
wait_for_strict_health || fail 'legacy production is not strictly healthy before bootstrap'
initial_health_verified=1
trap cleanup EXIT
trap 'rollback $?' ERR
rollback_armed=1

stage=snapshot-databases
snapshot_databases

stage=secure-root
root_hardened=1
chown root:root "$ROOT"
chmod 0755 "$ROOT"

stage=build-user
if (( build_user_missing == 1 )); then
  if useradd --system --user-group --home-dir /var/lib/eqb-build \
    --create-home --shell /usr/sbin/nologin eqb-build; then
    build_user_created=1
    build_group_created=1
  else
    if id -u eqb-build >/dev/null 2>&1; then build_user_created=1; fi
    if getent group eqb-build >/dev/null; then build_group_created=1; fi
    fail 'cannot create isolated build user'
  fi
fi
[[ $(id -u eqb-build) != "$eqb_uid" ]] || fail 'build and runtime users must differ'
getent group eqb-build >/dev/null || fail 'build group is missing'

stage=layout-directories
install -d -o root -g root -m 0755 "$ROOT/releases"
install -d -o root -g root -m 0711 "$ROOT/deployments"
install -d -o root -g root -m 0700 "$ROOT/deployments/receipts"
archive_dir=$(mktemp -d "$ROOT/deployments/.bootstrap-source-XXXXXXXX")
staging=$(mktemp -d "$ROOT/releases/.bootstrap-$TARGET_SHA-XXXXXXXX")
build_home=$(mktemp -d "$ROOT/deployments/.bootstrap-build-home-XXXXXXXX")
archive=$archive_dir/$TARGET_SHA.tar

protect_legacy_path() {
  local path=$1
  [[ $(stat -c '%u' "$path") == "$eqb_uid" ]] \
    || fail "legacy production path is not owned by eqb: $path"
  protected_paths+=("$path")
  protected_modes["$path"]=$(stat -c '%a' "$path")
  chmod go-rwx "$path"
}

stage=protect-persistence
for relative in data app/public/paper-assets exports server/logs; do
  legacy_path=$SOURCE/$relative
  if [[ -d $legacy_path ]]; then protect_legacy_path "$legacy_path"; fi
done
protect_legacy_path "$SOURCE/.env"

chown -hR eqb-build:eqb-build "$staging" "$build_home"
stage=archive-source
/usr/bin/git -c safe.directory="$SOURCE" -C "$SOURCE" archive \
  --format=tar "$TARGET_SHA" > "$archive"
tar -xf "$archive" -C "$staging"
chown -hR eqb-build:eqb-build "$staging"

run_build() {
  /usr/bin/systemd-run \
    --quiet \
    --wait \
    --pipe \
    --collect \
    --property=Type=exec \
    --property=RuntimeMaxSec=1200s \
    --property=KillMode=control-group \
    --uid=eqb-build \
    -- \
    /usr/bin/env -i \
    HOME="$build_home" \
    PATH="$FIXED_PATH" \
    PLAYWRIGHT_BROWSERS_PATH="$staging/.playwright-browsers" \
    /bin/sh -c 'umask 022; exec "$@"' eqb-bootstrap-build "$@"
}

stage=build-app-install
run_build /usr/bin/pnpm -C "$staging/app" install --frozen-lockfile >> "$bootstrap_log" 2>&1
stage=build-server-install
run_build /usr/bin/npm --prefix "$staging/server" ci >> "$bootstrap_log" 2>&1
stage=build-browser-install
run_build /usr/bin/pnpm -C "$staging/app" exec playwright install --no-shell chromium >> "$bootstrap_log" 2>&1
stage=build-smoke
run_build /usr/bin/node "$staging/scripts/smoke-production-chromium.mjs" >> "$bootstrap_log" 2>&1
stage=build-app
run_build /usr/bin/pnpm -C "$staging/app" build >> "$bootstrap_log" 2>&1

stage=validate-candidate
assert_real_directory() {
  local candidate_path=$1
  [[ -d $candidate_path && ! -L $candidate_path ]] \
    || fail "bootstrap candidate has an unsafe directory: $candidate_path"
}

assert_real_directory "$staging"
assert_real_directory "$staging/app"
assert_real_directory "$staging/app/public"
assert_real_directory "$staging/server"
[[ -f $staging/app/dist/index.html ]] || fail 'bootstrap candidate build is missing index.html'
stage=normalize-generated-dist
normalize_generated_dist "$staging/app/dist"

# Candidate package scripts run as eqb-build and cannot be trusted as a root
# installation source. The transient build units kill leftover child processes;
# restore the control files from the root-private exact-target archive afterward.
rm -rf "$staging/deploy"
tar -xf "$archive" -C "$staging" deploy
assert_real_directory "$staging/deploy"
for control_file in \
  Caddyfile.release \
  eqb-release.service \
  eqb-deploy-transport \
  eqb-deploy-controller \
  eqb-deploy-controller.mjs \
  eqb-legacy-baseline-state.mjs; do
  [[ -f $staging/deploy/$control_file && ! -L $staging/deploy/$control_file ]] \
    || fail "trusted deployment control file is unsafe: $control_file"
done
/usr/bin/node --check "$staging/deploy/eqb-deploy-controller.mjs"
/usr/bin/node --check "$staging/deploy/eqb-legacy-baseline-state.mjs"
/bin/sh -n "$staging/deploy/eqb-deploy-controller"
/bin/sh -n "$staging/deploy/eqb-deploy-transport"
/usr/bin/systemd-analyze verify "$staging/deploy/eqb-release.service" >/dev/null
/usr/bin/caddy validate --config "$staging/deploy/Caddyfile.release" >/dev/null

stage=prepare-controller-directory
if [[ ! -d $CONTROLLER_DIRECTORY ]]; then
  controller_directory_created=1
  install -d -o root -g root -m 0755 "$CONTROLLER_DIRECTORY"
fi

stage=backup-host-config
if [[ -f /etc/systemd/system/eqb.service ]]; then
  cp --preserve=mode,ownership,timestamps /etc/systemd/system/eqb.service "$backup/eqb.service"
fi
if [[ -f /etc/caddy/Caddyfile ]]; then
  cp --preserve=mode,ownership,timestamps /etc/caddy/Caddyfile "$backup/Caddyfile"
fi
if [[ -f $AUTHORIZED_KEYS ]]; then
  cp --preserve=mode,ownership,timestamps "$AUTHORIZED_KEYS" "$backup/authorized_keys"
fi

stage=stop-legacy-service
activated=1
systemctl stop eqb

stage=migrate-persistence
install -d -o eqb -g eqb -m 0700 "$ROOT/shared"

migrate_directory() {
  local source_path=$1 shared_name=$2
  local shared_path=$ROOT/shared/$shared_name
  [[ ! -L $source_path ]] || fail "legacy path is already a symlink: $source_path"
  if [[ -e $shared_path ]]; then
    [[ -d $shared_path ]] || fail "shared path is not a directory: $shared_path"
    [[ ! -e $source_path ]] || fail "both legacy and shared paths exist: $source_path"
  elif [[ -d $source_path ]]; then
    touch "$backup/legacy-$shared_name-existed"
    mv "$source_path" "$shared_path"
  else
    install -d -o eqb -g eqb -m 0700 "$shared_path"
  fi
  mkdir -p "$(dirname "$source_path")"
  ln -s "$shared_path" "$source_path"
}

migrate_directory "$SOURCE/data" data
migrate_directory "$SOURCE/app/public/paper-assets" paper-assets
migrate_directory "$SOURCE/exports" exports
migrate_directory "$SOURCE/server/logs" server-logs

[[ ! -e $ROOT/shared/.env ]] || fail 'shared production .env already exists'
mv "$SOURCE/.env" "$ROOT/shared/.env"
chmod 0600 "$ROOT/shared/.env"
ln -s "$ROOT/shared/.env" "$SOURCE/.env"
chown -hR eqb:eqb "$ROOT/shared"
chmod 0700 "$ROOT/shared"

stage=verify-migrated-persistence
for mapping in \
  'data:data' \
  'app/public/paper-assets:paper-assets' \
  'exports:exports' \
  'server/logs:server-logs'; do
  relative=${mapping%%:*}
  shared_name=${mapping#*:}
  if [[ -v persistence_identities[$relative] ]]; then
    [[ $(stat -c '%d:%i' "$ROOT/shared/$shared_name") \
      == "${persistence_identities[$relative]}" ]] \
      || fail "migrated directory identity changed: $relative"
  fi
done
[[ $(stat -c '%d:%i' "$ROOT/shared/.env") == "${persistence_identities[.env]}" ]] \
  || fail 'migrated environment identity changed'
for database_name in question-bank.sqlite user-data.sqlite import-ops.sqlite; do
  database_path=$ROOT/shared/data/$database_name
  [[ $(stat -c '%d:%i' "$database_path") == "${database_identities[$database_name]}" ]] \
    || fail "migrated database identity changed: $database_name"
  verify_sqlite_database "$database_path" \
    || fail "migrated database integrity gate failed: $database_name"
done

stage=seal-release
rm -rf \
  "$staging/data" \
  "$staging/app/public/paper-assets" \
  "$staging/exports" \
  "$staging/server/logs" \
  "$staging/.env"
mkdir -p "$staging/app/public" "$staging/server"
ln -s "$ROOT/shared/data" "$staging/data"
ln -s "$ROOT/shared/paper-assets" "$staging/app/public/paper-assets"
ln -s "$ROOT/shared/exports" "$staging/exports"
ln -s "$ROOT/shared/server-logs" "$staging/server/logs"
ln -s "$ROOT/shared/.env" "$staging/.env"
rm -rf "$staging/.eqb-release.json"
(
  set -o noclobber
  cat > "$staging/.eqb-release.json" <<EOF
{
  "schemaVersion": "eqb-release-v1",
  "sha": "$TARGET_SHA",
  "controllerVersion": "eqb-deploy-controller-v1",
  "preparedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)
chmod 0444 "$staging/.eqb-release.json"
chown -hR root:root "$staging"
chmod -R u+rwX,go+rX,go-w "$staging"
chmod 0755 "$staging"
chmod 0444 "$staging/.eqb-release.json"
stage=pre-caddy-dist-proof
normalize_generated_dist "$staging/app/dist"
mv "$staging" "$release"
ln -s "releases/$TARGET_SHA" "$ROOT/current"

stage=install-controller
install -d -o root -g root -m 0700 "$HOST_CONFIG_ROOT" "$HOST_CONFIG_ROOT/versions"
host_config=$HOST_CONFIG_ROOT/versions/$TARGET_SHA
install -d -o root -g root -m 0755 "$host_config/deploy"
install -o root -g root -m 0644 \
  "$release/deploy/eqb-deploy-controller.mjs" "$host_config/deploy/eqb-deploy-controller.mjs"
install -o root -g root -m 0644 \
  "$release/deploy/eqb-release.service" "$host_config/deploy/eqb-release.service"
install -o root -g root -m 0644 \
  "$release/deploy/Caddyfile.release" "$host_config/deploy/Caddyfile.release"
/usr/bin/node --input-type=module - "$host_config" "$TARGET_SHA" "$release" <<'NODE'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
const [root, sha, release] = process.argv.slice(2)
const names = [
  'deploy/Caddyfile.release',
  'deploy/eqb-release.service',
  'deploy/eqb-deploy-controller.mjs',
]
const files = Object.fromEntries(names.map((name) => [
  name,
  crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex'),
]))
const stableLaunchers = Object.fromEntries([
  'deploy/eqb-deploy-transport',
  'deploy/eqb-deploy-controller',
].map((name) => [
  name,
  crypto.createHash('sha256').update(fs.readFileSync(path.join(release, name))).digest('hex'),
]))
fs.writeFileSync(path.join(root, '.eqb-host-configuration.json'), `${JSON.stringify({
  schemaVersion: 'eqb-host-configuration-v1',
  sha,
  files,
  stableLaunchers,
  preparedAt: new Date().toISOString(),
}, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
NODE
chown -hR root:root "$host_config"
chmod -R u+rwX,go+rX,go-w "$host_config"
ln -s "versions/$TARGET_SHA" "$HOST_CONFIG_ROOT/current"
install -o root -g root -m 0755 \
  "$release/deploy/eqb-deploy-controller" "$CONTROLLER"
install -o root -g root -m 0755 \
  "$release/deploy/eqb-deploy-transport" "$TRANSPORT_CONTROLLER"

stage=install-forced-key
key_installed=1
install_forced_key
assert_authorized_keys_state "$forced_key" || fail 'deployment forced key postcondition failed'

stage=install-service-config
install -o root -g root -m 0644 "$release/deploy/eqb-release.service" /etc/systemd/system/eqb.service
install -o root -g root -m 0644 "$release/deploy/Caddyfile.release" /etc/caddy/Caddyfile
systemctl daemon-reload
stage=activate-release
systemctl restart eqb
systemctl reload caddy

stage=strict-health
wait_for_strict_health || fail 'release-layout health check timed out'

stage=cleanup
cleanup
archive_dir=
build_home=
staging=
PUBLIC_KEY_TEMP=

stage=success-receipt
success_receipt=$ROOT/deployments/receipts/$(date -u +%Y%m%dT%H%M%SZ)-bootstrap-$TARGET_SHA.json
cat > "$success_receipt" <<EOF
{
  "schemaVersion": "eqb-deployment-bootstrap-v1",
  "state": "reported",
  "conclusion": "success",
  "targetSha": "$TARGET_SHA",
  "previousSha": "$production_sha",
  "controllerVersion": "eqb-deploy-controller-v1",
  "databaseSnapshots": {
    "question-bank.sqlite": "${database_snapshot_digests[question-bank.sqlite]}",
    "user-data.sqlite": "${database_snapshot_digests[user-data.sqlite]}",
    "import-ops.sqlite": "${database_snapshot_digests[import-ops.sqlite]}"
  },
  "finishedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
chmod 0600 "$success_receipt"
trap - ERR
trap - EXIT
printf 'EQB deployment bootstrap complete: %s\n' "$TARGET_SHA"
