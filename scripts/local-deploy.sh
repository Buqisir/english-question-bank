#!/bin/sh
# Owner Mac entrypoint: the private key lives only in Keychain, never in config.
set -eu

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repository_root"
config_dir=${EQB_DEPLOY_CONFIG:-"$HOME/.config/eqbank/deploy"}
[ -r "$config_dir/env" ] || fail "缺少可读的部署配置：$config_dir/env"
[ -s "$config_dir/known_hosts" ] && [ -r "$config_dir/known_hosts" ] ||
  fail "缺少非空且可读的主机公钥文件：$config_dir/known_hosts"
. "$config_dir/env"
[ -n "${QUESTION_BANK_DEPLOY_SSH_HOST:-}" ] || fail "部署配置缺少 QUESTION_BANK_DEPLOY_SSH_HOST"
real_gh=$(command -v gh) || fail "找不到 gh；请先安装并登录 GitHub CLI"
command -v node >/dev/null 2>&1 || fail "找不到 node；请将 Node.js 加入 PATH"
command -v security >/dev/null 2>&1 || fail "找不到 macOS security 钥匙串命令"
QUESTION_BANK_DEPLOY_SSH_KNOWN_HOSTS=$(cat "$config_dir/known_hosts")
QUESTION_BANK_DEPLOY_SSH_PRIVATE_KEY=$(
  security find-generic-password -a eqbank -s eqbank-deploy-ssh-private-key -w 2>/dev/null
) || fail "无法读取部署私钥：请检查钥匙串中的 eqbank-deploy-ssh-private-key 项及访问权限"
[ -n "$QUESTION_BANK_DEPLOY_SSH_PRIVATE_KEY" ] || fail "钥匙串中的部署私钥为空"
export QUESTION_BANK_DEPLOY_SSH_HOST QUESTION_BANK_DEPLOY_SSH_KNOWN_HOSTS QUESTION_BANK_DEPLOY_SSH_PRIVATE_KEY

umask 077
shim_dir=$(mktemp -d "${TMPDIR:-/tmp}/eqbank-local-deploy.XXXXXXXX") ||
  fail "无法创建部署临时目录"
trap 'rm -f "$shim_dir/ssh" "$shim_dir/gh"; rmdir "$shim_dir"' 0
trap 'exit 130' INT
trap 'exit 143' TERM

interface=${EQB_DEPLOY_DIRECT_INTERFACE:-en0}
if [ "$interface" != none ]; then
  case "$interface" in
    ''|*[!a-zA-Z0-9_-]*) fail "部署直连网卡名称无效" ;;
  esac
  cat >"$shim_dir/ssh" <<EOF
#!/bin/sh
exec /usr/bin/ssh -o "ProxyCommand=/usr/bin/nc -b $interface %h %p" "\$@"
EOF
  chmod 700 "$shim_dir/ssh"
fi

# Quote the resolved path as shell source so the shim cannot resolve itself.
quoted_gh=$(printf '%s' "$real_gh" | sed "s/'/'\\\\''/g")
printf '#!/bin/sh\nreal_gh='\''%s'\''\n' "$quoted_gh" >"$shim_dir/gh"
cat >>"$shim_dir/gh" <<'EOF'
set -eu
if [ "${1:-}" != api ]; then
  exec "$real_gh" "$@"
fi
for arg do
  case "$arg" in
    -X*|--method|--method=*|-f*|-F*|--field|--field=*|--raw-field|--raw-field=*|--input|--input=*)
      exec "$real_gh" "$@"
      ;;
  esac
done
# Failed GETs may leave partial JSON; expose only the successful stdout.
output=$(mktemp "${TMPDIR:-/tmp}/eqbank-gh-output.XXXXXXXX")
trap 'rm -f "$output"' 0
trap 'exit 130' INT
trap 'exit 143' TERM
attempt=1
while :; do
  if "$real_gh" "$@" >"$output"; then
    cat "$output"
    exit 0
  else
    result=$?
  fi
  [ "$attempt" -lt 4 ] || exit "$result"
  attempt=$((attempt + 1))
  sleep 2
done
EOF
chmod 700 "$shim_dir/gh"
PATH="$shim_dir:$PATH"
export PATH

# Keep this shell alive to clean the shims after Node exits, including failure.
( exec node scripts/amp-orb-deploy.mjs "$@" )
