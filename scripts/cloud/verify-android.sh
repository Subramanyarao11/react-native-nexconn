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
  (
    cd example
    npx expo prebuild --platform android --clean --no-install
    BEFORE="$(mktemp -d)"
    trap 'rm -rf "$BEFORE"' EXIT
    files=(android/build.gradle android/app/build.gradle android/app/src/main/AndroidManifest.xml)
    for i in "${!files[@]}"; do cp "${files[i]}" "$BEFORE/$i"; done
    npx expo prebuild --platform android --no-clean --no-install
    for i in "${!files[@]}"; do diff -u "$BEFORE/$i" "${files[i]}"; done
    grep -q "maven.nexconn.ai" android/build.gradle
    echo "Expo Android plugin output unchanged after non-clean prebuild."
  )
  (cd example/android && ./gradlew --no-daemon --console=plain \
     -PreactNativeArchitectures=x86_64,arm64-v8a assembleDebug)
  ls -la example/android/app/build/outputs/apk/debug/
fi

echo "== 16 KB page-size check of packaged native libraries (informational)"
APK="$(ls example-cli/android/app/build/outputs/apk/debug/*.apk 2>/dev/null | head -1 || true)"
if [[ -n "$APK" ]] && command -v unzip >/dev/null; then
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  unzip -q "$APK" 'lib/*' -d "$TMP"
  if command -v llvm-readelf >/dev/null || [[ -x "$ANDROID_HOME/ndk/27.1.12297006/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf" ]]; then
    READELF="$(command -v llvm-readelf || echo "$ANDROID_HOME/ndk/27.1.12297006/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf")"
    while IFS= read -r -d '' so; do
      align="$("$READELF" -Wl "$so" | awk '/^[[:space:]]*LOAD[[:space:]]/ {print $NF}' | paste -sd, -)"
      echo "${so#"$TMP"/}: LOAD align $align"
    done < <(find "$TMP/lib" -name '*.so' -print0)
  else
    echo "llvm-readelf not found; skipped"
  fi
fi
echo "Android builds finished."
