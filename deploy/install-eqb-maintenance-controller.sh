#!/usr/bin/env bash
set -Eeuo pipefail

# One-time Tencent Cloud root installation for the post-bootstrap maintenance
# controller. The payload must be a tar archive of the six exact deploy files
# from one reviewed main SHA; the expected archive digest is supplied out of
# band. This script does not provision a new host or restore application data.
# Usage: install-eqb-maintenance-controller.sh <sha> <tar-sha256> <tar> <transport-user>

umask 077
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin

TARGET_SHA=${1-}
EXPECTED_PAYLOAD_DIGEST=${2-}
PAYLOAD=${3-}
TRANSPORT_USER=${4-}
ROOT=/opt/eqb
SOURCE=$ROOT/english-question-bank
SOURCE_USER=eqb
DEPLOY_LOCK=$ROOT/deployments/deploy.lock
HOST_CONFIG_ROOT=$ROOT/deployments/host-configuration
VERSIONS=$HOST_CONFIG_ROOT/versions
ACTIVE=$HOST_CONFIG_ROOT/current
ROOT_WRAPPER=/usr/local/libexec/eqb-deploy-controller-v1
TRANSPORT_WRAPPER=/usr/local/libexec/eqb-deploy-transport-v1
UNIT=/etc/systemd/system/eqb.service
CADDYFILE=/etc/caddy/Caddyfile
BACKUP_ROOT=/var/backups/eqb
staging=
backup=
activated=0
host_config_created=0
deploy_lock_mode=
lock_mode_changed=0

fail() {
  printf 'EQB maintenance-controller install failed closed: %s\n' "$*" >&2
  exit 1
}

assert_real_file() {
  local path=$1 uid=$2 gid=$3 mode=$4 label=$5
  local actual
  [[ -f $path && ! -L $path ]] || fail "$label must be a real file"
  actual=$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$path")
  [[ $actual == "$uid:$gid:$mode:1" ]] || fail "$label metadata is invalid"
}

assert_legacy_deploy_lock() {
  local actual_uid actual_gid actual_mode actual_links
  [[ -f $DEPLOY_LOCK && ! -L $DEPLOY_LOCK ]] || fail 'deployment lock must be a real file'
  IFS=: read -r actual_uid actual_gid actual_mode actual_links \
    <<< "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$DEPLOY_LOCK")"
  [[ $actual_uid == 0 && $actual_gid == 0 && $actual_links == 1 \
    && ( $actual_mode == 600 || $actual_mode == 644 ) ]] \
    || fail 'deployment lock metadata is invalid'
  deploy_lock_mode=$actual_mode
}

run_source() {
  /usr/sbin/runuser -u "$SOURCE_USER" -- \
    /usr/bin/env -i \
      "HOME=/home/$SOURCE_USER" \
      PATH=/usr/local/bin:/usr/bin:/bin \
      GIT_TERMINAL_PROMPT=0 \
      GCM_INTERACTIVE=never \
      'GIT_SSH_COMMAND=/usr/bin/ssh -F /dev/null -o BatchMode=yes -o PasswordAuthentication=no -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/home/eqb/.ssh/known_hosts -o GlobalKnownHostsFile=/dev/null' \
      "$@"
}

strict_health() {
  /usr/bin/timeout --signal=TERM --kill-after=2s 60s /bin/bash -c '
    set -e
    systemctl is-active --quiet eqb
    systemctl is-active --quiet caddy
    curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8787/api/health >/dev/null
    curl --fail --silent --show-error --max-time 10 --resolve eqbank.cc:443:127.0.0.1 https://eqbank.cc/api/health >/dev/null
    curl --fail --silent --show-error --max-time 10 https://eqbank.cc/ >/dev/null
    curl --fail --silent --show-error --max-time 10 https://eqbank.cc/ops/ >/dev/null
    curl --fail --silent --show-error --max-time 10 "https://eqbank.cc/ops/?view=review" >/dev/null
  '
}

restore_file() {
  local source=$1 destination=$2 mode=$3
  local temporary
  temporary=$(mktemp "$(dirname "$destination")/.${destination##*/}.XXXXXXXX")
  install -o root -g root -m "$mode" "$source" "$temporary"
  sync -d "$temporary"
  mv -fT "$temporary" "$destination"
  sync -f "$(dirname "$destination")"
}

rollback() {
  local status=$?
  local restored=1
  local rollback_failed=0
  trap - ERR
  set +e
  if (( activated == 1 )) && [[ -n $backup && -d $backup ]]; then
    restore_file "$backup/eqb-deploy-controller-v1" "$ROOT_WRAPPER" 0755 \
      || { restored=0; rollback_failed=1; }
    restore_file "$backup/eqb-deploy-transport-v1" "$TRANSPORT_WRAPPER" 0755 \
      || { restored=0; rollback_failed=1; }
    restore_file "$backup/eqb.service" "$UNIT" 0644 \
      || { restored=0; rollback_failed=1; }
    restore_file "$backup/Caddyfile" "$CADDYFILE" 0644 \
      || { restored=0; rollback_failed=1; }
  fi
  if (( host_config_created == 1 && (activated == 0 || restored == 1) )); then
    rm -rf "$HOST_CONFIG_ROOT" || rollback_failed=1
    sync -f "$ROOT/deployments" || rollback_failed=1
  fi
  if (( activated == 1 && restored == 1 )); then
    systemctl daemon-reload || rollback_failed=1
    caddy reload --config "$CADDYFILE" || rollback_failed=1
    strict_health || rollback_failed=1
  fi
  if (( lock_mode_changed == 1 )); then
    chmod "$deploy_lock_mode" "$DEPLOY_LOCK" || rollback_failed=1
  fi
  if (( rollback_failed == 1 )); then
    printf 'EQB maintenance-controller install CRITICAL: rollback incomplete; backup=%s\n' \
      "${backup:-unavailable}" >&2
    exit 70
  fi
  exit "$status"
}

cleanup() {
  if [[ -n $staging ]]; then rm -rf "$staging"; fi
}

trap rollback ERR
trap cleanup EXIT

[[ $(id -u) == 0 ]] || fail 'run as root'
[[ $TARGET_SHA =~ ^[a-f0-9]{40}$ ]] || fail 'target SHA is invalid'
[[ $EXPECTED_PAYLOAD_DIGEST =~ ^[a-f0-9]{64}$ ]] || fail 'payload digest is invalid'
[[ $TRANSPORT_USER =~ ^[a-z_][a-z0-9_-]*$ ]] || fail 'transport user is invalid'
id -u "$TRANSPORT_USER" >/dev/null 2>&1 || fail 'transport user does not exist'
[[ $(id -u "$TRANSPORT_USER") != 0 ]] || fail 'transport user must be non-root'
for tool in \
  /usr/bin/cut \
  /usr/bin/env \
  /usr/bin/flock \
  /usr/bin/git \
  /usr/bin/mktemp \
  /usr/bin/node \
  /usr/bin/sha256sum \
  /usr/bin/sort \
  /usr/bin/ssh \
  /usr/bin/stat \
  /usr/bin/tar \
  /usr/sbin/runuser; do
  [[ -x $tool ]] || fail "required tool is unavailable: $tool"
done
assert_legacy_deploy_lock
exec 9< "$DEPLOY_LOCK"
/usr/bin/flock --exclusive --nonblock --conflict-exit-code 75 9 \
  || fail 'deployment lock is held'
[[ -f $PAYLOAD && ! -L $PAYLOAD ]] || fail 'payload is not one real file'
[[ $(sha256sum "$PAYLOAD" | cut -d ' ' -f 1) == "$EXPECTED_PAYLOAD_DIGEST" ]] \
  || fail 'payload digest mismatch'
[[ -L $ROOT/current && -d $ROOT/releases && -d $ROOT/shared && -d $ROOT/deployments ]] \
  || fail 'release layout is not established'
[[ -d /usr/local/libexec && ! -L /usr/local/libexec ]] || fail 'libexec is unsafe'
for installed in "$ROOT_WRAPPER" "$TRANSPORT_WRAPPER" "$UNIT" "$CADDYFILE"; do
  [[ -f $installed && ! -L $installed ]] || fail "installed file is unsafe: $installed"
done
[[ -d $BACKUP_ROOT && ! -L $BACKUP_ROOT \
  && $(stat -c '%u:%g:%a' "$BACKUP_ROOT") == 0:0:700 ]] \
  || fail 'root-private backup root is unavailable'
[[ ! -e $HOST_CONFIG_ROOT && ! -L $HOST_CONFIG_ROOT ]] \
  || fail 'maintenance controller is already installed'
for controller_command in \
  "preflight" \
  "deploy $TARGET_SHA" \
  "deploy-reviewed-persistence $TARGET_SHA $EXPECTED_PAYLOAD_DIGEST" \
  "update-host-config $TARGET_SHA $EXPECTED_PAYLOAD_DIGEST"; do
  # sudo -l authorizes the exact argv without executing the controller.
  read -r -a controller_argv <<< "$controller_command"
  sudo -n -l -U "$TRANSPORT_USER" "$ROOT_WRAPPER" -- "${controller_argv[@]}" >/dev/null \
    || fail "transport sudo scope does not allow: $controller_command"
done

staging=$(mktemp -d "$ROOT/deployments/.maintenance-controller-XXXXXXXX")
mapfile -t payload_names < <(tar -tf "$PAYLOAD")
expected_names=(
  deploy/
  deploy/Caddyfile.release
  deploy/eqb-deploy-controller
  deploy/eqb-deploy-controller.mjs
  deploy/eqb-deploy-transport
  deploy/eqb-release.service
  deploy/inspect-eqb-maintenance-host.sh
)
mapfile -t sorted_payload_names < <(printf '%s\n' "${payload_names[@]}" | LC_ALL=C sort)
mapfile -t sorted_expected_names < <(printf '%s\n' "${expected_names[@]}" | LC_ALL=C sort)
[[ ${#payload_names[@]} -eq ${#expected_names[@]} \
  && ${sorted_payload_names[*]} == "${sorted_expected_names[*]}" ]] \
  || fail 'payload archive member set is not exact'
mapfile -t payload_types < <(tar -tvf "$PAYLOAD" | cut -c 1)
[[ ${#payload_types[@]} -eq ${#payload_names[@]} ]] \
  || fail 'payload archive metadata is ambiguous'
for index in "${!payload_names[@]}"; do
  if [[ ${payload_names[$index]} == deploy/ ]]; then
    [[ ${payload_types[$index]} == d ]] || fail 'payload deploy node is not a directory'
  else
    [[ ${payload_types[$index]} == - ]] || fail 'payload member is not a regular file'
  fi
done
tar -xf "$PAYLOAD" -C "$staging"
/usr/bin/node --input-type=module - "$staging" <<'NODE'
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2]
const expected = new Set([
  'deploy',
  'deploy/Caddyfile.release',
  'deploy/eqb-release.service',
  'deploy/eqb-deploy-transport',
  'deploy/eqb-deploy-controller',
  'deploy/eqb-deploy-controller.mjs',
  'deploy/inspect-eqb-maintenance-host.sh',
])
function walk(directory, relative = '.') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = relative === '.' ? entry.name : `${relative}/${entry.name}`
    if (!expected.has(child) || entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new Error('unexpected payload node')
    }
    if (entry.isFile() && fs.lstatSync(path.join(directory, entry.name)).nlink !== 1) {
      throw new Error('linked payload file')
    }
    if (entry.isDirectory()) walk(path.join(directory, entry.name), child)
  }
}
walk(root)
for (const name of expected) {
  if (!fs.existsSync(path.join(root, name))) throw new Error('missing payload node')
}
NODE

remote_origin=$(run_source /usr/bin/git -C "$SOURCE" remote get-url origin)
case "$remote_origin" in
  https://github.com/Buqisir/english-question-bank|\
  https://github.com/Buqisir/english-question-bank.git|\
  git@github.com:Buqisir/english-question-bank|\
  git@github.com:Buqisir/english-question-bank.git|\
  ssh://git@github.com/Buqisir/english-question-bank|\
  ssh://git@github.com/Buqisir/english-question-bank.git) ;;
  *) fail 'production source origin is not the fixed repository' ;;
esac
run_source /usr/bin/git -C "$SOURCE" fetch --quiet --no-tags origin main
[[ $(run_source /usr/bin/git -C "$SOURCE" rev-parse FETCH_HEAD) == "$TARGET_SHA" ]] \
  || fail 'fetched main does not match target SHA'
resolved_target=$(run_source /usr/bin/git -C "$SOURCE" rev-parse "$TARGET_SHA^{commit}")
[[ $resolved_target == "$TARGET_SHA" ]] || fail 'target commit is unavailable in the production source clone'
for relative in \
  deploy/Caddyfile.release \
  deploy/eqb-release.service \
  deploy/eqb-deploy-transport \
  deploy/eqb-deploy-controller \
  deploy/eqb-deploy-controller.mjs \
  deploy/inspect-eqb-maintenance-host.sh; do
  target_digest=$(run_source /usr/bin/git -C "$SOURCE" show "$TARGET_SHA:$relative" \
    | sha256sum | cut -d ' ' -f 1)
  [[ $(sha256sum "$staging/$relative" | cut -d ' ' -f 1) == "$target_digest" ]] \
    || fail "payload file is not from the exact target commit: $relative"
done

node --check "$staging/deploy/eqb-deploy-controller.mjs"
/bin/sh -n "$staging/deploy/eqb-deploy-controller"
/bin/sh -n "$staging/deploy/eqb-deploy-transport"
systemd-analyze verify "$staging/deploy/eqb-release.service" >/dev/null
caddy validate --config "$staging/deploy/Caddyfile.release" >/dev/null

readiness_output=$(
  /usr/bin/env -i \
    PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin \
    EQB_MAINTENANCE_LOCK_FD=9 \
    /bin/bash "$staging/deploy/inspect-eqb-maintenance-host.sh" \
      "$TARGET_SHA" "$EXPECTED_PAYLOAD_DIGEST" "$TRANSPORT_USER"
) || fail 'maintenance install readiness inspection failed'
if ! /usr/bin/node --input-type=module - \
  "$readiness_output" "$TARGET_SHA" "$EXPECTED_PAYLOAD_DIGEST" "$TRANSPORT_USER" <<'NODE'
const [line, targetSha, payloadDigest, transportUser] = process.argv.slice(2)
const prefix = 'EQB_MAINTENANCE_INSTALL_READINESS '
if (!line.startsWith(prefix) || line.indexOf('\n') !== -1) process.exit(1)
let report
try {
  report = JSON.parse(line.slice(prefix.length))
} catch {
  process.exit(1)
}
const expectedKeys = [
  'availableBytes', 'caddyfileSha256', 'controllerModuleSha256',
  'deploymentLockMode', 'failureCode', 'layout', 'payloadDigest', 'productionSha',
  'rootWrapperSha256', 'schemaVersion', 'state', 'targetSha',
  'transportUid', 'transportUser', 'transportWrapperSha256', 'unitSha256',
].sort()
if (
  JSON.stringify(Object.keys(report).sort()) !== JSON.stringify(expectedKeys)
  || report.schemaVersion !== 'eqb-maintenance-install-readiness-v1'
  || report.state !== 'ready'
  || report.failureCode !== null
  || report.targetSha !== targetSha
  || report.payloadDigest !== payloadDigest
  || report.transportUser !== transportUser
  || !['0600', '0644'].includes(report.deploymentLockMode)
  || !Number.isSafeInteger(report.transportUid)
  || report.transportUid <= 0
  || !Number.isSafeInteger(report.availableBytes)
  || report.availableBytes < 5 * 1024 * 1024 * 1024
  || report.layout !== 'release'
  || !/^[0-9a-f]{40}$/.test(report.productionSha)
  || ![
    report.controllerModuleSha256,
    report.rootWrapperSha256,
    report.transportWrapperSha256,
    report.unitSha256,
    report.caddyfileSha256,
  ]
    .every((value) => /^[0-9a-f]{64}$/.test(value))
) process.exit(1)
NODE
then
  fail 'maintenance install readiness report is invalid'
fi

if [[ $deploy_lock_mode != 600 ]]; then
  lock_mode_changed=1
  chmod 0600 "$DEPLOY_LOCK"
  assert_real_file "$DEPLOY_LOCK" 0 0 600 'normalized deployment lock'
fi

backup=$(mktemp -d "$BACKUP_ROOT/maintenance-controller-install-${TARGET_SHA:0:12}-XXXXXXXX")
chown root:root "$backup"
chmod 0700 "$backup"
cp --preserve=mode,ownership,timestamps "$ROOT_WRAPPER" "$backup/eqb-deploy-controller-v1"
cp --preserve=mode,ownership,timestamps "$TRANSPORT_WRAPPER" "$backup/eqb-deploy-transport-v1"
cp --preserve=mode,ownership,timestamps "$UNIT" "$backup/eqb.service"
cp --preserve=mode,ownership,timestamps "$CADDYFILE" "$backup/Caddyfile"
sync -f "$backup"

host_config_created=1
install -d -o root -g root -m 0700 "$HOST_CONFIG_ROOT" "$VERSIONS"
version=$VERSIONS/$TARGET_SHA
install -d -o root -g root -m 0755 "$version/deploy"
install -o root -g root -m 0644 \
  "$staging/deploy/eqb-deploy-controller.mjs" "$version/deploy/eqb-deploy-controller.mjs"
install -o root -g root -m 0644 \
  "$staging/deploy/eqb-release.service" "$version/deploy/eqb-release.service"
install -o root -g root -m 0644 \
  "$staging/deploy/Caddyfile.release" "$version/deploy/Caddyfile.release"

node --input-type=module - "$version" "$TARGET_SHA" "$staging" <<'NODE'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
const [root, sha, payload] = process.argv.slice(2)
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
  crypto.createHash('sha256').update(fs.readFileSync(path.join(payload, name))).digest('hex'),
]))
fs.writeFileSync(path.join(root, '.eqb-host-configuration.json'), `${JSON.stringify({
  schemaVersion: 'eqb-host-configuration-v1',
  sha,
  files,
  stableLaunchers,
  preparedAt: new Date().toISOString(),
}, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
NODE
chown -hR root:root "$version"
chmod -R u+rwX,go+rX,go-w "$version"

ln -s "versions/$TARGET_SHA" "$HOST_CONFIG_ROOT/.current-new"
mv "$HOST_CONFIG_ROOT/.current-new" "$ACTIVE"
sync -f "$HOST_CONFIG_ROOT"

activated=1
restore_file "$staging/deploy/eqb-release.service" "$UNIT" 0644
restore_file "$staging/deploy/Caddyfile.release" "$CADDYFILE" 0644
restore_file "$staging/deploy/eqb-deploy-controller" "$ROOT_WRAPPER" 0755
restore_file "$staging/deploy/eqb-deploy-transport" "$TRANSPORT_WRAPPER" 0755
systemctl daemon-reload
caddy reload --config "$CADDYFILE"
strict_health
forced_preflight=$(/usr/bin/sudo -n -u "$TRANSPORT_USER" -- \
  /usr/bin/env -i \
  SSH_ORIGINAL_COMMAND=preflight \
  PATH=/usr/local/bin:/usr/bin:/bin \
  "$TRANSPORT_WRAPPER")
/usr/bin/node --input-type=module - "$forced_preflight" <<'NODE'
const preflight = JSON.parse(process.argv[2])
const keys = ['caddy', 'controllerVersion', 'eqb', 'layout', 'productionSha', 'schemaVersion']
if (
  !preflight
  || Object.keys(preflight).sort().join('\n') !== keys.join('\n')
  || preflight.schemaVersion !== 'eqb-deployment-preflight-v2'
  || preflight.controllerVersion !== 'eqb-deploy-controller-v1'
  || !/^[a-f0-9]{40}$/u.test(preflight.productionSha || '')
  || preflight.layout !== 'release'
  || preflight.eqb !== 'active'
  || preflight.caddy !== 'active'
) throw new Error('installed forced-controller preflight is invalid')
NODE

receipt=$backup/success-receipt.json
cat > "$receipt" <<EOF
{
  "schemaVersion": "eqb-maintenance-controller-install-v1",
  "state": "reported",
  "conclusion": "success",
  "targetSha": "$TARGET_SHA",
  "payloadDigest": "$EXPECTED_PAYLOAD_DIGEST",
  "hostConfigurationSha": "$TARGET_SHA",
  "finishedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
chmod 0600 "$receipt"
sync -d "$receipt"
sync -f "$backup"
trap - ERR
printf 'EQB_MAINTENANCE_CONTROLLER_INSTALL %s\n' "$(tr -d '\n' < "$receipt")"
