#!/usr/bin/env bash
# Build only the small compatibility launcher; reuse the large renderer rootfs.
set -euo pipefail
: "${OUTPUT:?}" "${RUNNER_TEMP:?}"
commit=d4b49e2243dee34e41c13dfeca6a3d07e9cf0f00
source="$RUNNER_TEMP/eqb-proot-source"
layer="$RUNNER_TEMP/eqb-launcher-layer"
sudo apt-get update
sudo apt-get install --yes --no-install-recommends build-essential gcc-multilib pkg-config libtalloc-dev
mkdir -p "$source" "$layer"
git -C "$source" init -q
git -C "$source" remote add origin https://github.com/proot-me/proot.git
git -C "$source" fetch --depth=1 origin "$commit"
git -C "$source" -c core.hooksPath=/dev/null checkout --detach FETCH_HEAD
test "$(git -C "$source" rev-parse HEAD)" = "$commit"
# No optional Python extension or CARE binary is required.
make -C "$source/src" -j2 HAS_SWIG= HAS_PYTHON_CONFIG= proot
cp "$source/src/proot" "$layer/proot"
ldd "$source/src/proot" | awk '/=> \// {print $3} /^[[:space:]]*\// {print $1}' \
  | while read -r lib; do cp -L "$lib" "$layer/"; done
test -f "$layer/ld-linux-x86-64.so.2"
printf '%s\n' "$commit" > "$layer/proot-source-sha"
"$layer/ld-linux-x86-64.so.2" --library-path "$layer" "$layer/proot" --version
# Ubuntu's old apt PRoot misses statx translation: test the exact failure seam.
"$layer/ld-linux-x86-64.so.2" --library-path "$layer" "$layer/proot" \
  -r / -b "$source:/eqb-statx-proof" \
  /usr/bin/stat /eqb-statx-proof/src/proot
find "$source" -maxdepth 1 -type f \( -iname '*license*' -o -iname 'copying*' \) \
  -exec cp '{}' "$layer/" \;
tar -C "$layer" -czf "$OUTPUT" .
