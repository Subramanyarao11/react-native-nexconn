#!/usr/bin/env bash
# Installs the packed tarball into fresh, independent consumer apps (outside
# the workspace, so symlinks cannot hide packaging problems) and type-checks
# the public entry points. Optional native builds with BUILD_NATIVE=android|ios.
# Usage: BUILD_NATIVE=android scripts/cloud/verify-packed-consumers.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
YARN="node $ROOT/.yarn/releases/yarn-4.18.1.cjs"
WORK="${WORK:-$(mktemp -d)}"
echo "Working in $WORK"

# Build lib/ first: a clean checkout has no compiled output to pack.
(cd "$ROOT" && $YARN install --immutable && $YARN build && $YARN pack --out "$WORK/react-native-nexconn.tgz")
tar -tzf "$WORK/react-native-nexconn.tgz" | grep -q "package/lib/module/index.js" \
  || { echo "Tarball is missing lib/module/index.js"; exit 1; }

cat > "$WORK/consumer-check.tsx" <<'EOF'
import { getNexconnClient, ChannelType, NexconnError, type Message } from 'react-native-nexconn';
import { NexconnProvider, useMessages, useChannelList } from 'react-native-nexconn/react';
import { createMockClient } from 'react-native-nexconn/testing';
const client = getNexconnClient();
const channel = { channelType: ChannelType.direct, channelId: 'bob' };
export async function demo(): Promise<Message> {
  await client.initialize({ appKey: 'k' });
  return client.messages.send(channel, { type: 'text', text: 'hi' });
}
export const refs = [NexconnProvider, useMessages, useChannelList, createMockClient, NexconnError];
EOF

cat > "$WORK/tsconfig.nexconn.json" <<'EOF'
{
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "module": "esnext",
    "target": "esnext",
    "skipLibCheck": true,
    "strict": true
  },
  "files": ["consumer-check.tsx"]
}
EOF

check_types() {
  cp "$WORK/consumer-check.tsx" "$WORK/tsconfig.nexconn.json" .
  npx tsc --project tsconfig.nexconn.json
}

echo "== Community CLI consumer (RN 0.88.1)"
cd "$WORK"
npx --yes @react-native-community/cli@20.2.0 init CliConsumer --version 0.88.1 --skip-install --skip-git-init
cd CliConsumer
npm install
npm install "$WORK/react-native-nexconn.tgz"
check_types
node -e "require.resolve('react-native-nexconn/package.json'); console.log('resolved', require('react-native-nexconn/package.json').version)"
if [[ "${BUILD_NATIVE:-}" == "android" ]]; then
  (cd android && ./gradlew --no-daemon assembleDebug)
elif [[ "${BUILD_NATIVE:-}" == "ios" ]]; then
  (cd ios && pod install && xcodebuild -workspace CliConsumer.xcworkspace -scheme CliConsumer \
     -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build | tail -20)
fi

echo "== Expo SDK 58 consumer (development build)"
cd "$WORK"
npx --yes create-expo-app@latest ExpoConsumer --template blank-typescript@sdk-58 --no-install
cd ExpoConsumer
npm install
npm install "$WORK/react-native-nexconn.tgz"
node -e "
const fs=require('fs');const p='app.json';const j=JSON.parse(fs.readFileSync(p));
j.expo.plugins=[...(j.expo.plugins||[]),['react-native-nexconn',{}]];
j.expo.android={...(j.expo.android||{}),package:'com.example.nexconnconsumer'};
j.expo.ios={...(j.expo.ios||{}),bundleIdentifier:'com.example.nexconnconsumer'};
fs.writeFileSync(p,JSON.stringify(j,null,2));"
check_types
npx expo prebuild --clean --no-install
grep -q "maven.nexconn.ai" android/build.gradle
if [[ "${BUILD_NATIVE:-}" == "android" ]]; then
  (cd android && ./gradlew --no-daemon assembleDebug)
elif [[ "${BUILD_NATIVE:-}" == "ios" ]]; then
  (cd ios && pod install && xcodebuild -workspace ExpoConsumer.xcworkspace -scheme ExpoConsumer \
     -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build | tail -20)
fi
echo "Packed consumer checks finished in $WORK"
