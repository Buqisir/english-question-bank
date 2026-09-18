# Shared host checks for EQB Ops MCP. Sourced by install-eqb-ops-mcp.sh.
# Functions return 1 on failure; callers decide whether to exit.

MIN_CLOUDFLARED_VERSION=2025.4.0

assert_install_destination() {
  case "$1" in
    /etc/caddy/Caddyfile|*/Caddyfile|*/Caddyfile.release|/etc/systemd/system/eqb.service|*/eqb-release.service)
      echo "refusing to touch $1" >&2
      return 1
      ;;
  esac
  return 0
}

parse_cloudflared_version() {
  printf '%s\n' "$1" | sed -n 's/.*[Vv]ersion \([0-9][0-9]*\.[0-9][0-9]*\(\.[0-9][0-9]*\)*\).*/\1/p' | head -n 1
}

version_ge() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    n = split(a, A, ".")
    m = split(b, B, ".")
    max = (n > m) ? n : m
    for (i = 1; i <= max; i++) {
      x = (i <= n) ? A[i] + 0 : 0
      y = (i <= m) ? B[i] + 0 : 0
      if (x > y) exit 0
      if (x < y) exit 1
    }
    exit 0
  }'
}

require_cloudflared() {
  bin=${EQB_OPS_MCP_CLOUDFLARED_BIN:-/usr/bin/cloudflared}
  if [ ! -x "$bin" ]; then
    echo "cloudflared binary not found or not executable: $bin (need >= $MIN_CLOUDFLARED_VERSION)" >&2
    return 1
  fi
  ver_text=$("$bin" --version 2>/dev/null || true)
  ver=$(parse_cloudflared_version "$ver_text")
  if [ -z "$ver" ]; then
    echo "unable to parse cloudflared version from: $ver_text" >&2
    return 1
  fi
  if ! version_ge "$ver" "$MIN_CLOUDFLARED_VERSION"; then
    echo "cloudflared $ver is too old; need >= $MIN_CLOUDFLARED_VERSION" >&2
    return 1
  fi
  return 0
}
