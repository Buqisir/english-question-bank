#!/bin/sh
# Owner Mac entrypoint: the private key lives only in Keychain, never in config.
set -eu

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repository_root"
# Reject checkout mistakes before config, Keychain or any network request.
quoted_root=$(printf '%s' "$repository_root" | sed "s/'/'\\\\''/g")
git_here="git -C '$quoted_root'"
branch=$(git branch --show-current)
[ "$branch" = main ] || fail "部署仓库当前为 ${branch:-detached HEAD}；当前分支必须是 main。
先保留其他任务的改动，再执行：
$git_here switch main
$git_here fetch origin
$git_here merge --ff-only origin/main"
[ -z "$(git status --porcelain)" ] || fail "部署仓库工作区必须干净（包括未跟踪文件）。
先查看并保留这些改动，再重新运行：
$git_here status --short"
local_sha=$(git rev-parse HEAD)
origin_sha=$(git rev-parse --verify refs/remotes/origin/main 2>/dev/null) ||
  fail "部署仓库缺少 origin/main；先执行：
$git_here fetch origin
$git_here merge --ff-only origin/main"
[ "$local_sha" = "$origin_sha" ] || fail "部署仓库 HEAD 必须等于 origin/main。
先执行（若无法 fast-forward，保留本地提交并人工处理；不要 reset）：
$git_here fetch origin
$git_here merge --ff-only origin/main"
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
invocation_tmp=$(mktemp -d /tmp/eqbank-local-deploy.XXXXXXXX) ||
  fail "无法创建部署临时目录"
# Own the whole credential lifetime, even when Node cannot run its finally.
trap 'rm -rf "$invocation_tmp"' 0
trap 'exit 130' INT
trap 'exit 143' TERM
TMPDIR=$invocation_tmp
export TMPDIR
shim_dir=$invocation_tmp/shims
mkdir "$shim_dir"

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
method_pending=0
for arg do
  if [ "$method_pending" = 1 ]; then
    [ "$arg" = GET ] || exec "$real_gh" "$@"
    method_pending=0
    continue
  fi
  case "$arg" in
    -X|--method) method_pending=1 ;;
    -XGET|--method=GET) ;;
    # GraphQL can mutate even without field flags (e.g. a query read from stdin).
    graphql|*/graphql|graphql\?*|*/graphql\?*|-X*|--method=*|-f*|-F*|--field|--field=*|--raw-field|--raw-field=*|--input|--input=*)
      exec "$real_gh" "$@"
      ;;
  esac
done
[ "$method_pending" = 0 ] || exec "$real_gh" "$@"
# Failed GETs may leave partial JSON and transient EOF diagnostics. Expose only
# successful output, or the final stderr and exit code when all attempts fail.
output=$(mktemp "${TMPDIR:-/tmp}/eqbank-gh-output.XXXXXXXX")
errors=$output.stderr
trap 'rm -f "$output" "$errors"' 0
trap 'exit 130' INT
trap 'exit 143' TERM
attempt=1
while :; do
  if "$real_gh" "$@" >"$output" 2>"$errors"; then
    cat "$output"
    cat "$errors" >&2
    exit 0
  else
    result=$?
  fi
  if [ "$attempt" -ge 4 ]; then
    cat "$errors" >&2
    exit "$result"
  fi
  attempt=$((attempt + 1))
  sleep 2
done
EOF
chmod 700 "$shim_dir/gh"
PATH="$shim_dir:$PATH"
export PATH

# Keep this shell alive to clean credentials and shims after Node exits.
( exec node scripts/amp-orb-deploy.mjs "$@" )
