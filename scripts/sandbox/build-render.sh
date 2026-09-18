#!/usr/bin/env bash
# Runs ONLY on an ephemeral GitHub-hosted builder, not on production or the receiver.
set -euo pipefail
: "${WORKSPACE:?}" "${NODE_LAYER:?}" "${OUTPUT:?}" "${IMAGE:?}"
name="eqb-sandbox-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# Export contains no bind-mounted source, node_modules, runtime or credentials.
docker create --name "$name" --entrypoint /bin/bash \
  --mount "type=bind,source=$WORKSPACE,target=/workspace,readonly" \
  --mount "type=bind,source=$NODE_LAYER/runtime,target=/runtime,readonly" \
  "$IMAGE" -c 'while :; do sleep 3600; done' >/dev/null
docker start "$name" >/dev/null
docker exec -e DEBIAN_FRONTEND=noninteractive \
  -e PATH=/runtime/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  "$name" /bin/bash -euc '
    apt-get update
    apt-get install --yes --no-install-recommends bash coreutils git python3 \
      ca-certificates ffmpeg poppler-utils libreoffice-writer imagemagick \
      ghostscript fonts-noto-cjk fonts-liberation fontconfig sqlite3 unzip zip proot
    node /workspace/app/node_modules/playwright/cli.js install-deps chromium
    PLAYWRIGHT_BROWSERS_PATH=/opt/eqb-browsers \
      node /workspace/app/node_modules/playwright/cli.js install --no-shell chromium
    printf "%s\n" "#!/bin/sh" \
      "if [ \"\${1:-}\" = identify ]; then shift; exec /usr/bin/identify \"\$@\"; fi" \
      "exec /usr/bin/convert \"\$@\"" > /usr/local/bin/magick
    chmod 755 /usr/local/bin/magick
    policy=$(find /etc/ImageMagick-* -name policy.xml -print -quit)
    test -n "$policy"
    sed -i "s/rights=\"none\" pattern=\"PDF\"/rights=\"read|write\" pattern=\"PDF\"/" "$policy"
    # Copy dereferenced loader/libraries: run PRoot without installing host packages.
    mkdir -p /opt/eqb-launcher /opt/eqb-state /opt/eqb-tooling /workspace /runtime
    cp -L /usr/bin/proot /opt/eqb-launcher/proot
    ldd /usr/bin/proot | awk '\''/=> \// {print $3} /^[[:space:]]*\// {print $1}'\'' \
      | while read -r lib; do cp -L "$lib" /opt/eqb-launcher/; done
    test -f /opt/eqb-launcher/ld-linux-x86-64.so.2
    dpkg-query -W > /opt/eqb-system-packages.tsv
    fc-cache -f
    apt-get clean
    rm -rf /var/lib/apt/lists/* /root/.cache /root/.npm /root/.local/share/pnpm
  '
docker export "$name" | gzip -1 > "$OUTPUT"
test -s "$OUTPUT"
