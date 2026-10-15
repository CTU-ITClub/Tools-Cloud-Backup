#!/usr/bin/env bash
set -euo pipefail
# Automatic TDLib (libtdjson) builder for Linux & macOS
# Usage:
#   ./scripts/build-tdlib.sh
# Optional env overrides:
#   TDLIB_REF=master BUILD_JOBS=4 ./scripts/build-tdlib.sh

TC_TDLIB_REF="${TDLIB_REF:-master}"
TC_BUILD_ROOT="${TC_BUILD_ROOT:-$PWD/.tdlib-build}"
TC_INSTALL_ROOT="${TC_INSTALL_ROOT:-$PWD/tdlib-native}"

# Detect CPU cores automatically if BUILD_JOBS is not set
if command -v nproc >/dev/null 2>&1; then
  DEFAULT_JOBS="$(nproc)"
elif command -v sysctl >/dev/null 2>&1; then
  DEFAULT_JOBS="$(sysctl -n hw.ncpu 2>/dev/null || echo 2)"
else
  DEFAULT_JOBS=2
fi
TC_JOBS="${BUILD_JOBS:-$DEFAULT_JOBS}"

mkdir -p "$TC_BUILD_ROOT" "$TC_INSTALL_ROOT/lib"

if [ ! -d "$TC_BUILD_ROOT/source/.git" ]; then
  git init "$TC_BUILD_ROOT/source"
  git -C "$TC_BUILD_ROOT/source" remote add origin https://github.com/tdlib/td.git
fi

git -C "$TC_BUILD_ROOT/source" fetch --depth=1 origin "$TC_TDLIB_REF"
git -C "$TC_BUILD_ROOT/source" checkout --detach FETCH_HEAD

CMAKE_EXTRA_ARGS=()
if [ "$(uname -s)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
  OPENSSL_PREFIX="$(brew --prefix openssl@3 2>/dev/null || brew --prefix openssl 2>/dev/null || true)"
  if [ -n "$OPENSSL_PREFIX" ]; then
    CMAKE_EXTRA_ARGS+=("-DOPENSSL_ROOT_DIR=$OPENSSL_PREFIX")
  fi
fi

cmake -S "$TC_BUILD_ROOT/source" -B "$TC_BUILD_ROOT/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DTD_ENABLE_JNI=OFF \
  "${CMAKE_EXTRA_ARGS[@]}"

cmake --build "$TC_BUILD_ROOT/build" --target tdjson --parallel "$TC_JOBS"

if [ "$(uname -s)" = "Darwin" ]; then
  cp -a "$TC_BUILD_ROOT/build/"libtdjson*.dylib "$TC_INSTALL_ROOT/lib/"
  printf '\n[OK] Đã build xong cho macOS! Đặt trong backend/.env:\nTDLIB_PATH=%s/lib/libtdjson.dylib\n' "$TC_INSTALL_ROOT"
else
  cp -a "$TC_BUILD_ROOT/build/"libtdjson.so* "$TC_INSTALL_ROOT/lib/"
  printf '\n[OK] Đã build xong cho Linux! Đặt trong backend/.env:\nTDLIB_PATH=%s/lib/libtdjson.so\n' "$TC_INSTALL_ROOT"
fi
