#!/usr/bin/env bash
# JavaScript/package checks. Runs on Ubuntu or macOS (Node 24).
# Usage: scripts/cloud/verify-js.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

YARN="node .yarn/releases/yarn-4.18.1.cjs"

echo "== Toolchain"
node --version
$YARN --version

echo "== Install (immutable lockfile)"
$YARN install --immutable

echo "== Unit, contract and plugin tests"
$YARN test

echo "== Rendered hook tests (Jest + React Native Testing Library)"
$YARN test:react

echo "== JS performance and leak checks (mock transport)"
$YARN bench

echo "== TypeScript"
$YARN typecheck

echo "== ESLint"
$YARN lint

echo "== Package build (Bob)"
$YARN build

echo "== Codegen schema"
OUT="$(mktemp -d)"
node node_modules/@react-native/codegen/lib/cli/combine/combine-js-to-schema-cli.js "$OUT/schema.json" src/NativeNexconn.ts
for platform in android ios; do
  node node_modules/react-native/scripts/generate-specs-cli.js \
    --platform "$platform" --schemaPath "$OUT/schema.json" --outputDir "$OUT/$platform" \
    --libraryName NexconnSpec --javaPackageName com.nexconn
done
grep -q "public abstract void invoke(String method, String argsJson, Promise promise)" -r "$OUT/android"
grep -q "emitOnNativeEvent" -r "$OUT/ios"
echo "Codegen OK ($OUT)"

echo "== Pack"
$YARN pack --out "$OUT/react-native-nexconn.tgz"
tar -tzf "$OUT/react-native-nexconn.tgz" | grep -E "\.(aar|xcframework|jar)$" && { echo "Vendor binaries must not be packed"; exit 1; } || true
echo "Tarball: $OUT/react-native-nexconn.tgz"
echo "All JavaScript checks passed."
