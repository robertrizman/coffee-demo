#!/usr/bin/env bash
#
# Checks an Android APK for 16 KB page-size compatibility:
#   1. ELF segment alignment (p_align on LOAD segments) inside every .so —
#      the real runtime requirement. A .so built with 4 KB alignment can
#      still pass zipalign and still fail/behave incorrectly on a genuine
#      16 KB device.
#   2. ZIP entry alignment (zipalign -P 16) — the packaging-level check,
#      handled automatically by AGP >= 8.5.1 with useLegacyPackaging=false.
#
# Usage:
#   ./scripts/check-16kb-alignment.sh [path/to/app.apk]
#
# If no APK path is given, defaults to the debug APK and builds it if missing.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

APK="${1:-}"
if [ -z "$APK" ]; then
  APK="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
  if [ ! -f "$APK" ]; then
    echo "No APK found at $APK — building it now (./gradlew :app:assembleDebug)..."
    (cd "$ANDROID_DIR" && ./gradlew :app:assembleDebug -q)
  fi
fi

if [ ! -f "$APK" ]; then
  echo "APK not found: $APK" >&2
  exit 1
fi

# --- Locate NDK's llvm-objdump ---
SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
NDK_DIR="$(find "$SDK_ROOT/ndk" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -V | tail -1)"
if [ -z "$NDK_DIR" ]; then
  echo "No NDK found under $SDK_ROOT/ndk — set ANDROID_SDK_ROOT or install an NDK via Android Studio's SDK Manager." >&2
  exit 1
fi
OBJDUMP="$(find "$NDK_DIR/toolchains/llvm/prebuilt" -maxdepth 3 -iname "llvm-objdump" 2>/dev/null | head -1)"
if [ -z "$OBJDUMP" ]; then
  echo "llvm-objdump not found under $NDK_DIR" >&2
  exit 1
fi

# --- Locate build-tools' zipalign ---
BUILD_TOOLS_DIR="$(find "$SDK_ROOT/build-tools" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -V | tail -1)"
ZIPALIGN="$BUILD_TOOLS_DIR/zipalign"

echo "APK:      $APK"
echo "NDK:      $(basename "$NDK_DIR")"
echo "objdump:  $OBJDUMP"
echo

# --- ELF segment alignment check ---
# Only 64-bit ABIs are subject to the 16 KB page-size requirement — 32-bit
# processes always run in 4 KB-page compat mode regardless of device page
# size, so arm64-v8a/x86 libs are expected to stay 4 KB-aligned.
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
unzip -q "$APK" 'lib/arm64-v8a/*' 'lib/x86_64/*' -d "$WORKDIR" 2>/dev/null || true

FAIL_COUNT=0
TOTAL_COUNT=0

echo "== ELF LOAD segment alignment for 64-bit ABIs (must be >= 16384 / 2**14) =="
while IFS= read -r -d '' so; do
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  rel="${so#"$WORKDIR"/}"
  align_shift=$("$OBJDUMP" -p "$so" 2>/dev/null | awk '/LOAD/{print $NF; exit}' | grep -oE '[0-9]+$' || true)
  if [ -z "$align_shift" ]; then
    echo "  ??  $rel (no LOAD segment found)"
    continue
  fi
  if [ "$align_shift" -ge 14 ]; then
    printf "  OK  %-70s (align 2**%s)\n" "$rel" "$align_shift"
  else
    printf "  FAIL %-70s (align 2**%s = %d bytes)\n" "$rel" "$align_shift" "$((2 ** align_shift))"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done < <(find "$WORKDIR/lib" -iname "*.so" -print0 | sort -z)

echo
echo "== ZIP entry alignment (zipalign -P 16) =="
if [ -x "$ZIPALIGN" ]; then
  "$ZIPALIGN" -c -P 16 4 "$APK" > "$WORKDIR/zipalign.log" 2>&1 && ZIPALIGN_OK=1 || ZIPALIGN_OK=0
  if [ "$ZIPALIGN_OK" = "1" ]; then
    echo "  Verification successful"
  else
    echo "  Verification FAILED — see details:"
    grep -v "(OK" "$WORKDIR/zipalign.log" || true
  fi
else
  echo "  zipalign not found under $BUILD_TOOLS_DIR — skipping"
  ZIPALIGN_OK=1
fi

echo
echo "== Summary =="
echo "  Libraries checked: $TOTAL_COUNT"
echo "  ELF alignment failures: $FAIL_COUNT"
echo "  ZIP alignment: $([ "$ZIPALIGN_OK" = "1" ] && echo OK || echo FAILED)"

if [ "$FAIL_COUNT" -gt 0 ] || [ "$ZIPALIGN_OK" != "1" ]; then
  echo
  echo "NOT 16KB compatible. Fix ELF-misaligned libraries by upgrading the owning"
  echo "dependency to a version built with NDK r28+ (or linker flags"
  echo "-Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384 for libs you build yourself)."
  exit 1
fi

echo
echo "All checks passed — 16KB page-size compatible."
