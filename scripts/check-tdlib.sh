#!/usr/bin/env bash
set -euo pipefail
LIBRARY="${TDLIB_PATH:-./tdlib-native/lib/libtdjson.so.1.8.67}"
if [ ! -f "$LIBRARY" ]; then
  echo "Missing TDLib library: $LIBRARY" >&2
  echo "Copy the original prebuilt .so from the repository. Repomix XML contains no binary payload." >&2
  exit 1
fi
printf '[OK] Found: %s\n' "$LIBRARY"
if command -v file >/dev/null; then file "$LIBRARY"; fi
if command -v ldd >/dev/null; then ldd "$LIBRARY"; fi
if command -v nm >/dev/null; then
  for symbol in td_create_client_id td_send td_receive td_execute; do
    if ! nm -D "$LIBRARY" 2>/dev/null | grep -q " $symbol$"; then
      echo "Warning: native symbol $symbol was not found; verify TDLib ABI" >&2
    fi
  done
fi
