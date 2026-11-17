# Cloud test runbook

Run these checks on cloud VMs (Ubuntu for JS and Android, macOS for iOS).
See [implementation status](STATUS.md) for verified results. A green build
is not evidence that messaging works; the live checklist at the end is.

## 0. Prerequisites

| Item | Ubuntu VM | macOS VM |
| --- | --- | --- |
| Node | 24.x (`.nvmrc`) | 24.x |
| Yarn | committed `.yarn/releases/yarn-4.18.1.cjs` (no global yarn needed) | same |
| Java | JDK 17 | JDK 17 (only for Android on Mac) |
| Android | SDK platforms `android-36` + `android-37.0`, build-tools 37.0.0, NDK 27.1.12297006, `ANDROID_HOME` set | optional |
| iOS | — | Xcode 26.x, iOS 26 simulator runtime, CocoaPods ≥ 1.16 |
| Network | registry.npmjs.org, dl.google.com, maven.google.com, repo.maven.apache.org, plugins.gradle.org, services.gradle.org, **maven.nexconn.ai**, cdn.cocoapods.org, **downloads.nexconn.ai** | same |

With Android SDK Command-line Tools on `PATH` and `ANDROID_HOME` pointing to
the SDK directory, review and accept the SDK licenses, then install the packages:

```sh
sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "platforms;android-37.0" \
  "build-tools;37.0.0" "ndk;27.1.12297006" "cmake;3.22.1"
```

For live tests you also need: a Nexconn test App Key (+ data center), its App
Secret on the token server only, two test user ids, and (for push) FCM/APNs
credentials and physical devices.

## 1. JavaScript and package (Ubuntu or macOS) — ~2 min

```sh
bash scripts/cloud/verify-js.sh
```

Runs: immutable install, 49 unit/contract/plugin tests, TypeScript, ESLint,
Bob build, Codegen schema + spec generation for both platforms, `yarn pack`
(fails if vendor binaries are packed). Already passing on the dev Mac except
the Codegen-generation and pack steps, which were run separately and passed.

## 2. Android native builds (Ubuntu)

```sh
bash scripts/cloud/verify-android.sh cli    # Community CLI fixture debug + release (R8)
bash scripts/cloud/verify-android.sh expo   # Expo prebuild (x2, idempotency) + debug build
```

When upgrading the Nexconn SDK, check Kotlin property names, nullability,
and the `NexconnCustomSlot.decodeFields` override against the pinned AAR.
The CLI release build runs R8 with `android/consumer-rules.pro` to keep
SDK getters used by the reflection serializer.

Run on an emulator after the build:

```sh
cd example-cli && npx react-native start &   # Metro
adb install android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8787 tcp:8787   # Metro + token server
```

## 3. iOS native builds (macOS) — first compile of the Swift bridge

```sh
bash scripts/cloud/verify-ios.sh cli
bash scripts/cloud/verify-ios.sh expo
```

Expected first-compile risks:

- Swift call sites against `NexconnChatSDK` 26.4.2 (taken from its
  `.swiftinterface`; e.g. `loadNextPage` generics, failable channel inits).
- `Nexconn-Swift.h` import from `Nexconn.mm` (static-library pods). If Xcode
  cannot find it, check `DEFINES_MODULE` and the `__has_include` branch.
- Custom message slot overrides of `NCCustomMessageContent` class methods.

Run on a simulator: `cd example-cli && npx react-native run-ios` (or install the
built `.app` with `xcrun simctl install booted <path>.app`).

## 4. Packed-tarball consumers (outside the workspace)

```sh
bash scripts/cloud/verify-packed-consumers.sh                     # JS-level checks
BUILD_NATIVE=android bash scripts/cloud/verify-packed-consumers.sh   # Ubuntu
BUILD_NATIVE=ios bash scripts/cloud/verify-packed-consumers.sh       # macOS
```

Creates a fresh RN 0.88.1 CLI app and a fresh Expo SDK 58 app, installs the
`.tgz` with npm, type-checks imports of all entry points, runs Expo prebuild
with the plugin, and optionally builds natively.

## 5. GitHub Actions (optional)

`.github/workflows/native-builds.yml` (manual `workflow_dispatch`) runs steps
1–3 and uploads debug APKs / simulator `.app` archives. Check runner minutes
before use.

## 5b. Live token test (needs credentials, any VM with Node 24)

```sh
export NEXCONN_APP_KEY=...  NEXCONN_APP_SECRET=...      # set in the VM, never commit
export NEXCONN_API_BASE=https://api.sg-light-api.com     # your data center
export NEXCONN_TEST_USERS=alice,bob                      # optional test user ids
node .yarn/releases/yarn-4.18.1.cjs test:live
```

Starts `examples/token-server`, checks that unauthenticated or wrong-password
requests get 401, that each signed-in user receives a real Nexconn token bound
to their own id, and that logout invalidates the session. Prints only token
lengths. Skipped automatically when the variables are missing.

## 5c. Expo release builds

Debug builds alone do not prove release behavior (R8 keep rules on Android,
Release Swift optimization on iOS).

```sh
# Android (Ubuntu)
(cd example && npx expo prebuild --platform android --clean --no-install)
(cd example/android && ./gradlew --no-daemon --console=plain \
   -PreactNativeArchitectures=arm64-v8a,x86_64 assembleRelease)
ls -la example/android/app/build/outputs/apk/release/

# iOS (macOS)
(cd example && npx expo prebuild --platform ios --clean)
WS="$(ls -d example/ios/*.xcworkspace | head -1)"
xcodebuild -workspace "$WS" -scheme "$(basename "$WS" .xcworkspace)" -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build | tail -40
```

Then install the release build on an emulator/simulator and run L1, L3 and
L16 from the live checklist against it.

## Next cloud session (planned)

Status at handover (18 November 2026): JS, Android CLI/Expo debug + CLI
release, packed consumers on Android and the live token test have passed on
Ubuntu (see STATUS.md). iOS (`verify-ios.sh`) is running on the macOS VM.

Run, in this order, and record each result in STATUS.md:

1. Finish iOS: `bash scripts/cloud/verify-ios.sh all`, then
   `BUILD_NATIVE=ios bash scripts/cloud/verify-packed-consumers.sh`.
   Report Swift compile errors with the full `xcodebuild` error lines.
2. Expo release builds: section 5c (Android and iOS).
3. Two-user live check: start the token server with two demo users (5b env
   vars plus `DEMO_USERS="alice:…,bob:…"`), run the example app on two
   devices/simulators (e.g. Android emulator = alice, iOS simulator = bob),
   and execute live checklist rows L1–L13 and L16 below. Use
   `adb reverse tcp:8787 tcp:8787` on Android and `http://localhost:8787`
   on the iOS simulator.
4. Cross-platform: repeat L3 (text), L6 (media) and L8 (group) between the
   Android and iOS apps, and L14 against an official Nexconn client.
5. Push (L15) only on physical devices with FCM/APNs configured.

## 6. Live checklist (needs credentials; simulator/emulator is fine unless noted)

Start the token server first (`examples/token-server/README.md`), then sign in
as user A on one device/simulator and user B on another.

| # | Scenario | Expected | Platform(s) |
| --- | --- | --- | --- |
| L1 | Initialize + connect A | Playground shows `connected`, user A, generation ≥ 1 | Android, iOS |
| L2 | `getCapabilities` | Lists methods; platform-only rows match docs/PARITY.md | both |
| L3 | A → B text in direct channel | B receives `messageReceived`; both lists update without duplicates | both, and cross-platform |
| L4 | Read receipt | B opens chat → A gets `readReceiptResponse` | both |
| L5 | Typing | B types → A sees "typing…" | both |
| L6 | Image + file send with progress | progress events then sent; B can `downloadMedia` | both |
| L7 | Recall (long-press) and edit (`messages.update`) | B sees recall notification / `messagesUpdated` | both |
| L8 | Create group with A, B; send in group | group appears in both lists; `groupOperation` event | both |
| L9 | Offline delivery | B disconnects, A sends 3 messages, B reconnects → messages + `offlineMessageSyncCompleted` | both |
| L10 | Account switch | Disconnect A, connect B on same device → no A data/events remain | both |
| L11 | JS reload while connected | No duplicate events; `initialize` returns `alreadyInitialized: true` | both |
| L12 | Kicked by other client | Connect A on two devices → first gets `kickedOfflineByOtherClient` | both |
| L13 | Custom message | Register `app:poll` on both, send, receive `custom` content | both |
| L14 | Interop with official client | Exchange with a Nexconn sample app or Web demo | one platform |
| L15 | Push (physical devices) | Background/killed app receives push; tap opens app | Android (FCM), iOS (APNs) |
| L16 | Release build | Android `assembleRelease` app connects and sends (R8 keep rules) | Android |

Report failures with the Playground output (no tokens), the native log and the
step number.
