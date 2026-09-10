#!/usr/bin/env bash
set -euo pipefail

# Temporary compatibility patch for Amp base images whose embedded Waymote
# viewer drops a cold-start bootstrap GOP before its first frame is painted.
# Remove this installer after a newer base image passes repeated cold-viewer
# checks against a completely static desktop without this patch.

gateway=/opt/amp-wayland/bin/waymote-gateway
streamd=/opt/amp-wayland/libexec/waymote-streamd
known_broken_011_sha256=b39eccb824127fb54eeb795d3974c7821dcf1f46c1e3d3e8aa2ca96c5ceaf977
known_broken_014_sha256=7fa3bec1bc1bd4f3783486260db4b0034a10aa81f95d7768c7e01ec8a8e601a4
patched_sha256=5899f8e524b483b26df5587355ccd18c7b4515710e7b28f7eaaf5d2af7e4d2f4

waymote_source_url=https://codeload.github.com/rockorager/waymote/tar.gz/refs/tags/v0.1.4
waymote_source_sha256=4846e8e257a1c735ea86fd383434ecb672942584666fd901f86334963fa6d385
go_url=https://go.dev/dl/go1.26.8.linux-amd64.tar.gz
go_sha256=d0f743b33e8d8945e6b1f432edd15785c70507121d6e2a723b21285eddf8b57b
patched_version=0.1.4-amp-first-frame.2

sha256_of() {
  sha256sum "$1" | awk '{print $1}'
}

warn_and_skip() {
  echo "[waymote-patch] WARNING: $*; leaving the installed gateway unchanged" >&2
  exit 0
}

if [[ ! -x "$gateway" || ! -x "$streamd" ]]; then
  warn_and_skip "Waymote is not installed at the expected Amp Desktop paths"
fi

current_sha256="$(sha256_of "$gateway")"
current_identity="$($gateway -version 2>&1 || true)"
streamd_identity="$($streamd --version 2>&1 || true)"

if [[ "$current_sha256" == "$patched_sha256" ]]; then
  echo "[waymote-patch] already installed: $current_identity ($current_sha256)"
  exit 0
fi

if [[ "$current_identity" != *"protocol 2"* || "$streamd_identity" != *"protocol 2"* ]]; then
  warn_and_skip "unsupported protocol identity: gateway='$current_identity', streamd='$streamd_identity'"
fi

case "$current_sha256" in
  "$known_broken_011_sha256"|"$known_broken_014_sha256") ;;
  *)
    current_version="$(awk '{print $2}' <<<"$current_identity")"
    if [[ "$current_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] &&
       [[ "$(printf '%s\n' 0.1.4 "$current_version" | sort -V | tail -n 1)" == "$current_version" ]] &&
       [[ "$current_version" != 0.1.4 ]]; then
      warn_and_skip "newer gateway detected: $current_identity ($current_sha256)"
    fi
    warn_and_skip "unknown gateway identity: $current_identity ($current_sha256)"
    ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
patch_file="$repo_root/.agents/patches/waymote-v0.1.4-first-frame.patch"
if [[ ! -f "$patch_file" ]]; then
  echo "[waymote-patch] missing patch file: $patch_file" >&2
  exit 1
fi

temp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$temp_dir"
}
trap cleanup EXIT

source_archive="$temp_dir/waymote-v0.1.4.tar.gz"
go_archive="$temp_dir/go1.26.8.linux-amd64.tar.gz"
source_dir="$temp_dir/source"
go_root="$temp_dir/go"
candidate="$temp_dir/waymote-gateway"
mkdir -p "$source_dir" "$go_root"

echo "[waymote-patch] downloading audited Waymote v0.1.4 source"
curl -fsSLo "$source_archive" "$waymote_source_url"
[[ "$(sha256_of "$source_archive")" == "$waymote_source_sha256" ]] || {
  echo "[waymote-patch] Waymote source checksum mismatch" >&2
  exit 1
}
tar -xzf "$source_archive" --strip-components=1 -C "$source_dir"
git -C "$source_dir" apply --check "$patch_file"
git -C "$source_dir" apply "$patch_file"

echo "[waymote-patch] downloading audited Go toolchain"
curl -fsSLo "$go_archive" "$go_url"
[[ "$(sha256_of "$go_archive")" == "$go_sha256" ]] || {
  echo "[waymote-patch] Go toolchain checksum mismatch" >&2
  exit 1
}
tar -xzf "$go_archive" --strip-components=1 -C "$go_root"

echo "[waymote-patch] building the protocol-2 gateway compatibility patch"
(
  cd "$source_dir/gateway"
  PATH="$go_root/bin:$PATH" \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOAMD64=v1 GOTOOLCHAIN=local \
    go build -trimpath \
      -ldflags="-s -w -X main.version=$patched_version" \
      -o "$candidate" .
)

[[ "$(sha256_of "$candidate")" == "$patched_sha256" ]] || {
  echo "[waymote-patch] patched gateway checksum mismatch" >&2
  exit 1
}
[[ "$($candidate -version 2>&1)" == "waymote-gateway $patched_version (protocol 2)" ]] || {
  echo "[waymote-patch] patched gateway identity mismatch" >&2
  exit 1
}

backup="$gateway.amp-backup-${current_sha256:0:12}"
if [[ ! -e "$backup" ]]; then
  sudo install -o root -g root -m 0755 "$gateway" "$backup"
fi
[[ "$(sha256_of "$backup")" == "$current_sha256" ]] || {
  echo "[waymote-patch] refusing to overwrite mismatched rollback backup: $backup" >&2
  exit 1
}

service_was_active=false
if systemctl is-active --quiet amp-desktop; then
  service_was_active=true
fi

rollback() {
  echo "[waymote-patch] health check failed; restoring $current_identity" >&2
  sudo install -o root -g root -m 0755 "$backup" "$gateway"
  if [[ "$(sha256_of "$gateway")" != "$current_sha256" ]]; then
    echo "[waymote-patch] rollback checksum verification failed" >&2
    return 1
  fi
  if [[ "$service_was_active" == true ]]; then
    sudo systemctl restart amp-desktop
    if ! systemctl is-active --quiet amp-desktop; then
      echo "[waymote-patch] amp-desktop is not active after rollback" >&2
      return 1
    fi
  fi
}

sudo install -o root -g root -m 0755 "$candidate" "$gateway.new"
[[ "$(sha256_of "$gateway.new")" == "$patched_sha256" ]] || {
  sudo rm -f "$gateway.new"
  echo "[waymote-patch] staged gateway checksum mismatch" >&2
  exit 1
}
sudo mv -f "$gateway.new" "$gateway"

if [[ "$service_was_active" == true ]]; then
  if ! sudo systemctl restart amp-desktop; then
    rollback
    exit 1
  fi
  # This confirms that amp-desktop serves the installed SDK. Repeated cold
  # viewer connections remain the behavioral acceptance test for first paint.
  healthy=false
  for _attempt in $(seq 1 50); do
    if systemctl is-active --quiet amp-desktop &&
       curl -fsS --max-time 2 http://127.0.0.1:5900/waymote.js \
         -o "$temp_dir/installed-waymote.js" 2>/dev/null &&
       grep -Fq 'cached GOP as a burst' "$temp_dir/installed-waymote.js"; then
      healthy=true
      break
    fi
    sleep 0.1
  done
  if [[ "$healthy" != true ]]; then
    rollback
    exit 1
  fi
fi

echo "[waymote-patch] installed: $($gateway -version) ($patched_sha256)"
echo "[waymote-patch] preserved streamd: $streamd_identity ($(sha256_of "$streamd"))"
echo "[waymote-patch] rollback backup: $backup"
