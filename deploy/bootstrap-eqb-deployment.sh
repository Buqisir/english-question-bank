#!/usr/bin/env bash
set -Eeuo pipefail

# One-time migration from the mutable production checkout to immutable releases.
# This script is never part of an ordinary deployment. Run it as root only after
# a separate, current Owner authorization and a read-only production preflight.

ROOT=/opt/eqb
SOURCE=$ROOT/english-question-bank
TARGET_SHA=${1-}
PUBLIC_KEY_FILE=${2-}
CONTROLLER=/usr/local/libexec/eqb-deploy-controller-v1
CONTROLLER_MODULE=/usr/local/libexec/eqb-deploy-controller-v1.mjs
AUTHORIZED_KEYS=/root/.ssh/authorized_keys
KEY_COMMENT=eqb-amp-deployment-v1
FIXED_PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin
export PATH=$FIXED_PATH
export GIT_TERMINAL_PROMPT=0
export GCM_INTERACTIVE=never
export GIT_SSH_COMMAND='/usr/bin/ssh -F /dev/null -o BatchMode=yes -o PasswordAuthentication=no'
activated=0
key_installed=0
build_user_created=0
rollback_armed=0
root_hardened=0
archive_dir=
staging=
build_home=
declare -a protected_paths=()
declare -A protected_modes=()

fail() {
  printf 'EQB deployment bootstrap failed closed: %s\n' "$*" >&2
  if declare -F rollback >/dev/null && (( rollback_armed == 1 )); then
    rollback 1
  fi
  exit 1
}

[[ $(id -u) == 0 ]] || fail 'run as root'
[[ $TARGET_SHA =~ ^[a-f0-9]{40}$ ]] || fail 'target SHA is invalid'
[[ -f $PUBLIC_KEY_FILE ]] || fail 'controller public key file is missing'
[[ ! -e $ROOT/current && ! -L $ROOT/current ]] || fail 'release layout already has a current pointer'
[[ ! -e $ROOT/releases && ! -L $ROOT/releases \
  && ! -e $ROOT/shared && ! -L $ROOT/shared \
  && ! -e $ROOT/deployments && ! -L $ROOT/deployments ]] \
  || fail 'partial or linked release layout requires manual inspection'
[[ ! -e $CONTROLLER && ! -L $CONTROLLER \
  && ! -e $CONTROLLER_MODULE && ! -L $CONTROLLER_MODULE ]] \
  || fail 'deployment controller is already installed'
[[ ! -L $AUTHORIZED_KEYS ]] || fail 'root authorized_keys must not be a symlink'
if [[ -f $AUTHORIZED_KEYS ]] && grep -Fq "$KEY_COMMENT" "$AUTHORIZED_KEYS"; then
  fail 'deployment forced key is already present'
fi
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
done

read -r key_type key_body key_extra < "$PUBLIC_KEY_FILE" || fail 'cannot read controller public key'
[[ $key_type == ssh-ed25519 && $key_body =~ ^[A-Za-z0-9+/]+={0,3}$ && -z ${key_extra-} ]] \
  || fail 'controller public key must be one bare Ed25519 key'
ssh-keygen -l -f "$PUBLIC_KEY_FILE" >/dev/null || fail 'controller public key is invalid'
forced_key="restrict,command=\"$CONTROLLER\" $key_type $key_body $KEY_COMMENT"

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

for executable in \
  /usr/bin/node /usr/bin/npm /usr/bin/pnpm /usr/bin/git /usr/bin/tar /usr/bin/getent /usr/bin/df \
  /usr/bin/caddy /usr/bin/curl /usr/bin/systemctl /usr/bin/systemd-run \
  /usr/bin/flock /usr/bin/ssh-keygen \
  /usr/sbin/runuser /usr/sbin/useradd /usr/sbin/userdel; do
  [[ -x $executable ]] || fail "required executable is missing: $executable"
done
available_bytes=$(/usr/bin/df --output=avail -B1 "$ROOT" | /usr/bin/tail -n 1 | /usr/bin/tr -d ' ')
[[ $available_bytes =~ ^[0-9]+$ && $available_bytes -ge 5368709120 ]] \
  || fail 'production filesystem needs at least 5 GiB free for bootstrap staging'

build_user_missing=0
if ! id -u eqb-build >/dev/null 2>&1; then
  build_user_missing=1
else
  [[ $(id -u eqb-build) != "$eqb_uid" ]] || fail 'build and runtime users must differ'
  getent group eqb-build >/dev/null || fail 'existing build group is missing'
fi

backup=$ROOT/deployments/bootstrap-backup-$(date -u +%Y%m%dT%H%M%SZ)
release=$ROOT/releases/$TARGET_SHA
archive=

cleanup() {
  if [[ -n $archive_dir ]]; then rm -rf "$archive_dir"; fi
  if [[ -n $build_home ]]; then rm -rf "$build_home"; fi
  if [[ -n $staging && -d $staging ]]; then rm -rf "$staging"; fi
}

restore_protected_modes() {
  local path
  for path in "${protected_paths[@]}"; do
    if [[ -e $path || -L $path ]]; then chmod "${protected_modes[$path]}" "$path"; fi
  done
}

restore_file() {
  local saved=$1 destination=$2
  if [[ -f $saved ]]; then
    cp --preserve=mode,ownership,timestamps "$saved" "$destination"
  else
    rm -f "$destination"
  fi
}

restore_migrated_directory() {
  local source_path=$1 shared_name=$2
  local shared_path=$ROOT/shared/$shared_name
  if [[ -L $source_path ]]; then rm -f "$source_path"; fi
  if [[ -e $source_path ]]; then return; fi
  if [[ -f $backup/legacy-$shared_name-existed && -d $shared_path ]]; then
    mkdir -p "$(dirname "$source_path")"
    mv "$shared_path" "$source_path"
  else
    rm -rf "$shared_path"
  fi
}

rollback() {
  local exit_code=${1:-1}
  local rollback_healthy=1
  trap - ERR
  if (( activated == 1 )); then
    restore_file "$backup/eqb.service" /etc/systemd/system/eqb.service
    restore_file "$backup/Caddyfile" /etc/caddy/Caddyfile
    rm -f "$ROOT/current"
    rm -rf "$release"
    restore_migrated_directory "$SOURCE/data" data
    restore_migrated_directory "$SOURCE/app/public/paper-assets" paper-assets
    restore_migrated_directory "$SOURCE/exports" exports
    restore_migrated_directory "$SOURCE/server/logs" server-logs
    if [[ -L $SOURCE/.env ]]; then rm -f "$SOURCE/.env"; fi
    if [[ ! -e $SOURCE/.env && -f $ROOT/shared/.env ]]; then
      mv "$ROOT/shared/.env" "$SOURCE/.env"
    fi
    rmdir "$ROOT/shared" 2>/dev/null || true
    restore_protected_modes
    systemctl daemon-reload || true
    systemctl restart eqb || true
    systemctl reload caddy || true
    rollback_healthy=0
    for (( attempt = 1; attempt <= 30; attempt += 1 )); do
      if systemctl is-active --quiet eqb \
        && systemctl is-active --quiet caddy \
        && curl --fail --silent --show-error --max-time 10 \
          http://127.0.0.1:8787/api/health >/dev/null \
        && curl --fail --silent --show-error --max-time 10 \
          --resolve eqbank.cc:443:127.0.0.1 https://eqbank.cc/api/health >/dev/null \
        && curl --fail --silent --show-error --max-time 10 \
          https://eqbank.cc/api/health >/dev/null; then
        rollback_healthy=1
        break
      fi
      sleep 1
    done
  else
    restore_protected_modes
  fi
  if (( key_installed == 1 )); then
    restore_file "$backup/authorized_keys" "$AUTHORIZED_KEYS"
  fi
  rm -f "$CONTROLLER" "$CONTROLLER_MODULE"
  cleanup
  if (( rollback_healthy == 1 )); then
    rm -rf "$backup"
    rmdir "$ROOT/releases" "$ROOT/deployments/receipts" "$ROOT/deployments" 2>/dev/null || true
  fi
  if (( root_hardened == 1 && rollback_healthy == 1 )); then
    chown "$root_uid:$root_gid" "$ROOT"
    chmod "$root_mode" "$ROOT"
  fi
  if (( build_user_created == 1 )); then userdel --remove eqb-build >/dev/null 2>&1 || true; fi
  if (( rollback_healthy == 1 )); then
    printf 'EQB deployment bootstrap rolled back; legacy service configuration restored and healthy\n' >&2
  else
    printf 'CRITICAL: legacy rollback is unhealthy; root-private backup retained at %s\n' "$backup" >&2
  fi
  exit "$exit_code"
}

trap cleanup EXIT
trap 'rollback $?' ERR
rollback_armed=1
chown root:root "$ROOT"
root_hardened=1
chmod 0755 "$ROOT"

if (( build_user_missing == 1 )); then
  useradd --system --user-group --home-dir /var/lib/eqb-build \
    --create-home --shell /usr/sbin/nologin eqb-build
  build_user_created=1
fi
[[ $(id -u eqb-build) != "$eqb_uid" ]] || fail 'build and runtime users must differ'
getent group eqb-build >/dev/null || fail 'build group is missing'

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

for relative in data app/public/paper-assets exports server/logs; do
  legacy_path=$SOURCE/$relative
  if [[ -d $legacy_path ]]; then protect_legacy_path "$legacy_path"; fi
done
protect_legacy_path "$SOURCE/.env"

chown -hR eqb-build:eqb-build "$staging" "$build_home"
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
    "$@"
}

run_build /usr/bin/pnpm -C "$staging/app" install --frozen-lockfile
run_build /usr/bin/npm --prefix "$staging/server" ci
run_build /usr/bin/pnpm -C "$staging/app" exec playwright install --no-shell chromium
run_build /usr/bin/node "$staging/scripts/smoke-production-chromium.mjs"
run_build /usr/bin/pnpm -C "$staging/app" build

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

# Candidate package scripts run as eqb-build and cannot be trusted as a root
# installation source. The transient build units kill leftover child processes;
# restore the control files from the root-private exact-target archive afterward.
rm -rf "$staging/deploy"
tar -xf "$archive" -C "$staging" deploy
assert_real_directory "$staging/deploy"
for control_file in \
  Caddyfile.release \
  eqb-release.service \
  eqb-deploy-controller \
  eqb-deploy-controller.mjs; do
  [[ -f $staging/deploy/$control_file && ! -L $staging/deploy/$control_file ]] \
    || fail "trusted deployment control file is unsafe: $control_file"
done
/usr/bin/node --check "$staging/deploy/eqb-deploy-controller.mjs"
/bin/sh -n "$staging/deploy/eqb-deploy-controller"
/usr/bin/caddy validate --config "$staging/deploy/Caddyfile.release" >/dev/null

install -d -o root -g root -m 0700 "$backup"
if [[ -f /etc/systemd/system/eqb.service ]]; then
  cp --preserve=mode,ownership,timestamps /etc/systemd/system/eqb.service "$backup/eqb.service"
fi
if [[ -f /etc/caddy/Caddyfile ]]; then
  cp --preserve=mode,ownership,timestamps /etc/caddy/Caddyfile "$backup/Caddyfile"
fi
if [[ -f $AUTHORIZED_KEYS ]]; then
  cp --preserve=mode,ownership,timestamps "$AUTHORIZED_KEYS" "$backup/authorized_keys"
fi

activated=1
systemctl stop eqb

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
mv "$staging" "$release"
ln -s "releases/$TARGET_SHA" "$ROOT/current"

install -o root -g root -m 0644 \
  "$release/deploy/eqb-deploy-controller.mjs" "$CONTROLLER_MODULE"
install -o root -g root -m 0755 \
  "$release/deploy/eqb-deploy-controller" "$CONTROLLER"

key_installed=1
install -d -o root -g root -m 0700 /root/.ssh
touch "$AUTHORIZED_KEYS"
chown root:root "$AUTHORIZED_KEYS"
chmod 0600 "$AUTHORIZED_KEYS"
grep -Fqx "$forced_key" "$AUTHORIZED_KEYS" || printf '%s\n' "$forced_key" >> "$AUTHORIZED_KEYS"

install -o root -g root -m 0644 "$release/deploy/eqb-release.service" /etc/systemd/system/eqb.service
install -o root -g root -m 0644 "$release/deploy/Caddyfile.release" /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl restart eqb
systemctl reload caddy

deadline=$((SECONDS + 30))
until \
  systemctl is-active --quiet eqb \
  && systemctl is-active --quiet caddy \
  && curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8787/api/health >/dev/null \
  && curl --fail --silent --show-error --max-time 10 \
    --resolve eqbank.cc:443:127.0.0.1 https://eqbank.cc/api/health >/dev/null \
  && curl --fail --silent --show-error --max-time 10 https://eqbank.cc/api/health >/dev/null \
  && curl --fail --silent --show-error --max-time 10 https://eqbank.cc/ >/dev/null \
  && curl --fail --silent --show-error --max-time 10 https://eqbank.cc/ops/ >/dev/null \
  && curl --fail --silent --show-error --max-time 10 'https://eqbank.cc/ops/?view=review' >/dev/null; do
  (( SECONDS < deadline )) || fail 'release-layout health check timed out'
  sleep 1
done

receipt=$ROOT/deployments/receipts/$(date -u +%Y%m%dT%H%M%SZ)-bootstrap-$TARGET_SHA.json
umask 077
cat > "$receipt" <<EOF
{
  "schemaVersion": "eqb-deployment-bootstrap-v1",
  "state": "reported",
  "conclusion": "success",
  "targetSha": "$TARGET_SHA",
  "controllerVersion": "eqb-deploy-controller-v1",
  "finishedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
chmod 0600 "$receipt"
trap - ERR
printf 'EQB deployment bootstrap complete: %s\n' "$TARGET_SHA"
