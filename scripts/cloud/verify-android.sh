#!/usr/bin/env bash
# Android native builds for both fixtures. Ubuntu or macOS with JDK 17 and an
# Android SDK (ANDROID_HOME) containing platform 36/37 and build-tools 37.
# Usage: scripts/cloud/verify-android.sh [cli|expo|all]
set -euo pipefail
cd "$(dirname "$0")/../.."
TARGET="${1:-all}"
YARN="node .yarn/releases/yarn-4.18.1.cjs"

: "${ANDROID_HOME:?Set ANDROID_HOME to your Android SDK}"
java -version 2>&1 | head -1
$YARN install --immutable

if [[ "$TARGET" == "cli" || "$TARGET" == "all" ]]; then
  echo "== Community CLI fixture: assembleDebug (compiles Kotlin bridge + Codegen)"
  (cd example-cli/android && ./gradlew --no-daemon --console=plain \
     -PreactNativeArchitectures=x86_64,arm64-v8a assembleDebug)
  ls -la example-cli/android/app/build/outputs/apk/debug/
  echo "== Community CLI fixture: release build with R8 shrinking"
  (cd example-cli/android && ./gradlew --no-daemon --console=plain \
     -PreactNativeArchitectures=arm64-v8a assembleRelease) || {
       echo "Release build failed (check consumer-rules.pro / signing config)"; exit 1; }
fi

if [[ "$TARGET" == "expo" || "$TARGET" == "all" ]]; then
  echo "== Expo fixture: prebuild (config plugin) + assembleDebug"
  (cd example && npx expo prebuild --platform android --clean --no-install)
  # Second prebuild must be a no-op for plugin edits (idempotency).
  (cd example && npx expo prebuild --platform android --no-install)
  grep -q "maven.nexconn.ai" example/android/build.gradle
  (cd example/android && ./gradlew --no-daemon --console=plain \
     -PreactNativeArchitectures=x86_64,arm64-v8a assembleDebug)
  ls -la example/android/app/build/outputs/apk/debug/
fi

echo "== 16 KB page-size check of packaged native libraries (informational)"
APK="$(ls example-cli/android/app/build/outputs/apk/debug/*.apk 2>/dev/null | head -1 || true)"
if [[ -n "$APK" ]] && command -v unzip >/dev/null; then
  TMP="$(mktemp -d)"; unzip -q -o "$APK" 'lib/*' -d "$TMP" || true
  if command -v llvm-readelf >/dev/null || [[ -x "$ANDROID_HOME/ndk/27.1.12297006/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf" ]]; then
    READELF="$(command -v llvm-readelf || echo "$ANDROID_HOME/ndk/27.1.12297006/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf")"
    for so in $(find "$TMP/lib" -name '*.so'); do
      align="$("$READELF" -l "$so" | awk '/LOAD/ {print $NF; exit}')"
      echo "$(basename "$so"): LOAD align $align"
    done
  else
    echo "llvm-readelf not found; skipped"
  fi
fi
echo "Android builds finished."
