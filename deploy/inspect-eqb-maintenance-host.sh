#!/usr/bin/env bash
set -Eeuo pipefail

# Read-only root/TAT readiness inspection for the one-time maintenance-controller
# installation. Stream this exact reviewed script to `bash -s`; it writes no
# host file and never reads application databases or secret contents.

umask 077
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin

TARGET_SHA=${1-}
PAYLOAD_DIGEST=${2-}
TRANSPORT_USER=${3-}
ROOT=/opt/eqb
SOURCE=$ROOT/english-question-bank
SOURCE_USER=eqb
HOST_CONFIG_ROOT=$ROOT/deployments/host-configuration
HOST_UPDATE_ROOT=$ROOT/deployments/host-configuration-update
REVIEWED_PERSISTENCE_ROOT=$ROOT/deployments/reviewed-persistence
DEPLOY_LOCK=$ROOT/deployments/deploy.lock
ROOT_WRAPPER=/usr/local/libexec/eqb-deploy-controller-v1
LEGACY_CONTROLLER=/usr/local/libexec/eqb-deploy-controller-v1.mjs
TRANSPORT_WRAPPER=/usr/local/libexec/eqb-deploy-transport-v1
UNIT=/etc/systemd/system/eqb.service
CADDYFILE=/etc/caddy/Caddyfile
BACKUP_ROOT=/var/backups/eqb
MINIMUM_FREE_BYTES=$((5 * 1024 * 1024 * 1024))
arguments_validated=0
DEPLOYMENT_LOCK_MODE=

fail() {
  local failure_code=${1-UNCLASSIFIED_COMMAND_FAILURE}
  [[ $failure_code =~ ^[A-Z0-9_]+$ ]] || failure_code=UNCLASSIFIED_COMMAND_FAILURE
  if (( arguments_validated == 1 )); then
    printf 'EQB_MAINTENANCE_INSTALL_READINESS '
    printf '{"schemaVersion":"eqb-maintenance-install-readiness-v1",'
    printf '"state":"failed","failureCode":"%s",' "$failure_code"
    printf '"targetSha":"%s","payloadDigest":"%s",' "$TARGET_SHA" "$PAYLOAD_DIGEST"
    printf '"productionSha":null,"layout":null,"deploymentLockMode":null,'
    printf '"transportUser":"%s","transportUid":null,"availableBytes":null,' \
      "$TRANSPORT_USER"
    printf '"controllerModuleSha256":null,"rootWrapperSha256":null,'
    printf '"transportWrapperSha256":null,'
    printf '"unitSha256":null,"caddyfileSha256":null}\n'
  fi
  printf 'EQB maintenance-install readiness failed closed: %s\n' "$failure_code" >&2
  exit 1
}

assert_real_directory() {
  local target=$1 expected_uid=$2 expected_gid=$3 expected_mode=$4 label=$5
  [[ -d $target && ! -L $target \
    && $(stat -c '%u:%g:%a' "$target") == "$expected_uid:$expected_gid:$expected_mode" ]] \
    || fail "$label"
}

assert_real_file() {
  local target=$1 expected_uid=$2 expected_gid=$3 expected_mode=$4 label=$5
  [[ -f $target && ! -L $target \
    && $(stat -c '%u:%g:%a:%h' "$target") == "$expected_uid:$expected_gid:$expected_mode:1" ]] \
    || fail "$label"
}

assert_deployment_lock() {
  local actual_uid actual_gid actual_mode actual_links
  [[ -f $DEPLOY_LOCK && ! -L $DEPLOY_LOCK ]] || fail DEPLOYMENT_LOCK_METADATA
  IFS=: read -r actual_uid actual_gid actual_mode actual_links \
    <<< "$(/usr/bin/stat -c '%u:%g:%a:%h' -- "$DEPLOY_LOCK")"
  [[ $actual_uid == 0 && $actual_gid == 0 && $actual_links == 1 \
    && ( $actual_mode == 600 || $actual_mode == 644 ) ]] \
    || fail DEPLOYMENT_LOCK_METADATA
  DEPLOYMENT_LOCK_MODE=0$actual_mode
}

run_source() {
  /usr/sbin/runuser -u "$SOURCE_USER" -- \
    /usr/bin/env -i \
      HOME=/home/eqb \
      PATH=/usr/local/bin:/usr/bin:/bin \
      GIT_TERMINAL_PROMPT=0 \
      GCM_INTERACTIVE=never \
      'GIT_SSH_COMMAND=/usr/bin/ssh -F /dev/null -o BatchMode=yes -o PasswordAuthentication=no -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/home/eqb/.ssh/known_hosts -o GlobalKnownHostsFile=/dev/null' \
      "$@"
}

[[ $(id -u) == 0 ]] || fail RUN_AS_ROOT
[[ $TARGET_SHA =~ ^[a-f0-9]{40}$ ]] || fail TARGET_SHA
[[ $PAYLOAD_DIGEST =~ ^[a-f0-9]{64}$ ]] || fail PAYLOAD_DIGEST
[[ $TRANSPORT_USER =~ ^[a-z_][a-z0-9_-]*$ && $TRANSPORT_USER != root ]] \
  || fail TRANSPORT_USER
arguments_validated=1
trap 'fail UNCLASSIFIED_COMMAND_FAILURE' ERR

for tool in \
  /bin/bash \
  /bin/sh \
  /usr/bin/caddy \
  /usr/bin/cat \
  /usr/bin/chmod \
  /usr/bin/chown \
  /usr/bin/cp \
  /usr/bin/curl \
  /usr/bin/cut \
  /usr/bin/date \
  /usr/bin/df \
  /usr/bin/dirname \
  /usr/bin/env \
  /usr/bin/flock \
  /usr/bin/getent \
  /usr/bin/git \
  /usr/bin/id \
  /usr/bin/install \
  /usr/bin/ln \
  /usr/bin/mktemp \
  /usr/bin/mv \
  /usr/bin/node \
  /usr/bin/readlink \
  /usr/bin/rm \
  /usr/bin/sha256sum \
  /usr/bin/sort \
  /usr/bin/ssh \
  /usr/bin/stat \
  /usr/bin/sudo \
  /usr/bin/sync \
  /usr/bin/systemctl \
  /usr/bin/systemd-analyze \
  /usr/bin/tail \
  /usr/bin/tar \
  /usr/bin/timeout \
  /usr/bin/tr \
  /usr/sbin/runuser; do
  [[ -x $tool ]] || fail REQUIRED_TOOL
done

assert_deployment_lock
if [[ ${EQB_MAINTENANCE_LOCK_FD-} == 9 ]]; then
  [[ $(/usr/bin/readlink /proc/$$/fd/9) == "$DEPLOY_LOCK" ]] || fail DEPLOYMENT_LOCK_FD
else
  exec 9< "$DEPLOY_LOCK"
fi
/usr/bin/flock --exclusive --nonblock --conflict-exit-code 75 9 \
  || fail DEPLOYMENT_LOCK_HELD

assert_real_directory "$ROOT" 0 0 755 DEPLOYMENT_ROOT
assert_real_directory "$ROOT/releases" 0 0 755 RELEASES_ROOT
assert_real_directory "$ROOT/deployments" 0 0 711 DEPLOYMENT_STATE_ROOT
[[ -d $ROOT/shared && ! -L $ROOT/shared ]] || fail SHARED_ROOT
[[ -L $ROOT/current && $(/usr/bin/stat -c '%u:%g' "$ROOT/current") == 0:0 ]] \
  || fail CURRENT_POINTER
current_target=$(/usr/bin/readlink "$ROOT/current")
[[ $current_target =~ ^releases/([a-f0-9]{40})$ ]] || fail CURRENT_POINTER
PRODUCTION_SHA=${BASH_REMATCH[1]}
release=$ROOT/releases/$PRODUCTION_SHA
assert_real_directory "$release" 0 0 755 CURRENT_RELEASE
assert_real_file "$release/.eqb-release.json" 0 0 444 RELEASE_MARKER
/usr/bin/node --input-type=module - "$release/.eqb-release.json" "$PRODUCTION_SHA" <<'NODE' \
  || fail RELEASE_MARKER_CONTENT
import fs from 'node:fs'
const marker = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (
  marker?.schemaVersion !== 'eqb-release-v1'
  || marker.sha !== process.argv[3]
  || marker.controllerVersion !== 'eqb-deploy-controller-v1'
) process.exit(1)
NODE

[[ ! -e $HOST_CONFIG_ROOT && ! -L $HOST_CONFIG_ROOT ]] || fail HOST_CONFIGURATION_PRESENT
for active in \
  "$HOST_UPDATE_ROOT/active.json" \
  "$HOST_UPDATE_ROOT/recovery-controller.mjs" \
  "$REVIEWED_PERSISTENCE_ROOT/active.json"; do
  [[ ! -e $active && ! -L $active ]] || fail ACTIVE_MAINTENANCE_STATE
done

assert_real_directory /usr/local/libexec 0 0 755 LIBEXEC_METADATA
assert_real_file "$ROOT_WRAPPER" 0 0 755 ROOT_WRAPPER_METADATA
assert_real_file "$LEGACY_CONTROLLER" 0 0 644 LEGACY_CONTROLLER_METADATA
assert_real_file "$TRANSPORT_WRAPPER" 0 0 755 TRANSPORT_WRAPPER_METADATA
assert_real_file "$UNIT" 0 0 644 SYSTEMD_UNIT_METADATA
assert_real_file "$CADDYFILE" 0 0 644 CADDYFILE_METADATA
assert_real_directory "$BACKUP_ROOT" 0 0 700 BACKUP_ROOT_METADATA

for binding in \
  "$ROOT_WRAPPER:deploy/eqb-deploy-controller" \
  "$LEGACY_CONTROLLER:deploy/eqb-deploy-controller.mjs" \
  "$TRANSPORT_WRAPPER:deploy/eqb-deploy-transport" \
  "$UNIT:deploy/eqb-release.service" \
  "$CADDYFILE:deploy/Caddyfile.release"; do
  installed=${binding%%:*}
  relative=${binding#*:}
  [[ $(sha256sum "$installed" | cut -d ' ' -f 1) \
    == "$(sha256sum "$release/$relative" | cut -d ' ' -f 1)" ]] \
    || fail INSTALLED_ARTIFACT_DRIFT
done

/usr/bin/node --check "$LEGACY_CONTROLLER" || fail LEGACY_CONTROLLER_PARSE
/bin/sh -n "$ROOT_WRAPPER" || fail ROOT_WRAPPER_PARSE
/bin/sh -n "$TRANSPORT_WRAPPER" || fail TRANSPORT_WRAPPER_PARSE
/usr/bin/systemd-analyze verify "$UNIT" >/dev/null || fail SYSTEMD_UNIT_PARSE
/usr/bin/caddy validate --config "$CADDYFILE" >/dev/null || fail CADDYFILE_PARSE

IFS=: read -r resolved_transport _ transport_uid transport_gid _ transport_home _ \
  < <(/usr/bin/getent passwd "$TRANSPORT_USER") || fail TRANSPORT_ACCOUNT
[[ $resolved_transport == "$TRANSPORT_USER" \
  && $transport_uid =~ ^[0-9]+$ && $transport_uid != 0 \
  && $transport_gid =~ ^[0-9]+$ \
  && $transport_home == /* ]] || fail TRANSPORT_ACCOUNT
assert_real_directory "$transport_home/.ssh" "$transport_uid" "$transport_gid" 700 TRANSPORT_SSH_DIRECTORY
assert_real_file "$transport_home/.ssh/authorized_keys" \
  "$transport_uid" "$transport_gid" 600 TRANSPORT_AUTHORIZED_KEYS
[[ ! -e $transport_home/.ssh/authorized_keys2 && ! -L $transport_home/.ssh/authorized_keys2 ]] \
  || fail TRANSPORT_SECONDARY_AUTHORIZED_KEYS

for controller_command in \
  "preflight" \
  "deploy $TARGET_SHA" \
  "deploy-reviewed-persistence $TARGET_SHA $PAYLOAD_DIGEST" \
  "update-host-config $TARGET_SHA $PAYLOAD_DIGEST"; do
  read -r -a controller_argv <<< "$controller_command"
  /usr/bin/sudo -n -l -U "$TRANSPORT_USER" \
    "$ROOT_WRAPPER" -- "${controller_argv[@]}" >/dev/null \
    || fail TRANSPORT_SUDO_BOUNDARY
done

[[ -d $SOURCE && ! -L $SOURCE ]] || fail PRODUCTION_SOURCE
origin=$(run_source /usr/bin/git -C "$SOURCE" remote get-url origin)
case "$origin" in
  https://github.com/Buqisir/english-question-bank|\
  https://github.com/Buqisir/english-question-bank.git|\
  git@github.com:Buqisir/english-question-bank|\
  git@github.com:Buqisir/english-question-bank.git|\
  ssh://git@github.com/Buqisir/english-question-bank|\
  ssh://git@github.com/Buqisir/english-question-bank.git) ;;
  *) fail PRODUCTION_SOURCE_REMOTE ;;
esac
mapfile -t remote_main < <(run_source /usr/bin/git -C "$SOURCE" \
  ls-remote --exit-code origin refs/heads/main)
[[ ${#remote_main[@]} -eq 1 \
  && ${remote_main[0]} == "$TARGET_SHA"$'\trefs/heads/main' ]] \
  || fail REMOTE_MAIN

available_bytes=$(/usr/bin/df --output=avail -B1 "$ROOT" | /usr/bin/tail -n 1)
[[ $available_bytes =~ ^[[:space:]]*([0-9]+)[[:space:]]*$ ]] || fail AVAILABLE_BYTES
available_bytes=${BASH_REMATCH[1]}
(( available_bytes >= MINIMUM_FREE_BYTES )) || fail INSUFFICIENT_SPACE

/usr/bin/systemctl is-active --quiet eqb || fail EQB_INACTIVE
/usr/bin/systemctl is-active --quiet caddy || fail CADDY_INACTIVE
/usr/bin/curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:8787/api/health >/dev/null || fail LOCAL_API_HEALTH
/usr/bin/curl --fail --silent --show-error --max-time 10 \
  --resolve eqbank.cc:443:127.0.0.1 https://eqbank.cc/api/health >/dev/null \
  || fail LOCAL_TLS_HEALTH
/usr/bin/curl --fail --silent --show-error --max-time 10 \
  https://eqbank.cc/api/health >/dev/null || fail PUBLIC_API_HEALTH
/usr/bin/curl --fail --silent --show-error --max-time 10 \
  https://eqbank.cc/ >/dev/null || fail PUBLIC_ROOT_HEALTH
/usr/bin/curl --fail --silent --show-error --max-time 10 \
  https://eqbank.cc/ops/ >/dev/null || fail PUBLIC_OPS_HEALTH
/usr/bin/curl --fail --silent --show-error --max-time 10 \
  'https://eqbank.cc/ops/?view=review' >/dev/null || fail PUBLIC_REVIEW_HEALTH

controller_module_sha256=$(/usr/bin/sha256sum "$LEGACY_CONTROLLER" | /usr/bin/cut -d ' ' -f 1)
root_wrapper_sha256=$(/usr/bin/sha256sum "$ROOT_WRAPPER" | /usr/bin/cut -d ' ' -f 1)
transport_wrapper_sha256=$(
  /usr/bin/sha256sum "$TRANSPORT_WRAPPER" | /usr/bin/cut -d ' ' -f 1
)
unit_sha256=$(/usr/bin/sha256sum "$UNIT" | /usr/bin/cut -d ' ' -f 1)
caddyfile_sha256=$(/usr/bin/sha256sum "$CADDYFILE" | /usr/bin/cut -d ' ' -f 1)

printf 'EQB_MAINTENANCE_INSTALL_READINESS '
printf '{"schemaVersion":"eqb-maintenance-install-readiness-v1",'
printf '"state":"ready","failureCode":null,'
printf '"targetSha":"%s","payloadDigest":"%s",' "$TARGET_SHA" "$PAYLOAD_DIGEST"
printf '"productionSha":"%s","layout":"release","deploymentLockMode":"%s",' \
  "$PRODUCTION_SHA" "$DEPLOYMENT_LOCK_MODE"
printf '"transportUser":"%s","transportUid":%s,"availableBytes":%s,' \
  "$TRANSPORT_USER" "$transport_uid" "$available_bytes"
printf '"controllerModuleSha256":"%s","rootWrapperSha256":"%s",' \
  "$controller_module_sha256" "$root_wrapper_sha256"
printf '"transportWrapperSha256":"%s",' "$transport_wrapper_sha256"
printf '"unitSha256":"%s","caddyfileSha256":"%s"}\n' \
  "$unit_sha256" "$caddyfile_sha256"
