#!/usr/bin/env bash
# iOS simulator builds for both fixtures. macOS with Xcode 26.x and CocoaPods.
# Usage: scripts/cloud/verify-ios.sh [cli|expo|expo-release|all]
set -euo pipefail
cd "$(dirname "$0")/../.."
TARGET="${1:-all}"
YARN="node .yarn/releases/yarn-4.18.1.cjs"

xcodebuild -version
pod --version
$YARN install --immutable

build_sim() {
  local workspace="$1" scheme="$2" derived="$3" configuration="${4:-Debug}"
  xcodebuild -workspace "$workspace" -scheme "$scheme" -configuration "$configuration" \
    -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "$derived" ONLY_ACTIVE_ARCH=NO build | tail -40
}

if [[ "$TARGET" == "cli" || "$TARGET" == "all" ]]; then
  echo "== Community CLI fixture: pod install (resolves NexconnChat/Chat 26.4.2)"
  (cd example-cli/ios && bundle install >/dev/null 2>&1 || true; (bundle exec pod install || pod install))
  grep -q "NexconnChat" example-cli/ios/Podfile.lock
  echo "== Community CLI fixture: simulator build (compiles Swift bridge + Codegen)"
  build_sim example-cli/ios/NexconnCliScaffoldExample.xcworkspace NexconnCliScaffoldExample example-cli/ios/build
fi

if [[ "$TARGET" == "expo" || "$TARGET" == "all" ]]; then
  echo "== Expo fixture: prebuild + pod install + simulator build"
  (cd example && npx expo prebuild --platform ios --clean)
  (cd example && npx expo prebuild --platform ios)   # idempotency
  WS="$(ls -d example/ios/*.xcworkspace | head -1)"
  SCHEME="$(basename "$WS" .xcworkspace)"
  build_sim "$WS" "$SCHEME" example/ios/build
fi
if [[ "$TARGET" == "expo-release" || "$TARGET" == "all" ]]; then
  echo "== Expo fixture: Release simulator build (optimized Swift bridge, bundled JS)"
  (cd example && npx expo prebuild --platform ios --clean)
  WS="$(ls -d example/ios/*.xcworkspace | head -1)"
  SCHEME="$(basename "$WS" .xcworkspace)"
  build_sim "$WS" "$SCHEME" example/ios/build-release Release
  APP="$(find example/ios/build-release -path '*Release-iphonesimulator/*.app' -maxdepth 5 -type d | head -1)"
  echo "Release app: ${APP:-not found}"
  [[ -n "$APP" && -f "$APP/main.jsbundle" ]] || { echo "Release app has no embedded main.jsbundle"; exit 1; }
fi
echo "iOS builds finished."
