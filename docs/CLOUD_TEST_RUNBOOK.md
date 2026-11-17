# Cloud test runbook

Everything below still needs running on the cloud VMs (Ubuntu for JS and
Android, macOS for iOS). Record results in docs/STATUS.md. A green build is
not evidence that messaging works; the live checklist at the end is.

## 0. Prerequisites

| Item | Ubuntu VM | macOS VM |
| --- | --- | --- |
| Node | 24.x (`.nvmrc`) | 24.x |
| Yarn | committed `.yarn/releases/yarn-4.18.1.cjs` (no global yarn needed) | same |
| Java | JDK 17 | JDK 17 (only for Android on Mac) |
| Android | SDK platform 36 + 37, build-tools 37.0.0, NDK 27.1.12297006, `ANDROID_HOME` set | optional |
| iOS | — | Xcode 26.x, iOS 26 simulator runtime, CocoaPods ≥ 1.16 |
| Network | registry.npmjs.org, maven.google.com, repo.maven.apache.org, **maven.nexconn.ai**, cdn.cocoapods.org, **downloads.nexconn.ai** | same |

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

## 2. Android native builds (Ubuntu) — first compile of the Kotlin bridge

```sh
bash scripts/cloud/verify-android.sh cli    # Community CLI fixture debug + release (R8)
bash scripts/cloud/verify-android.sh expo   # Expo prebuild (x2, idempotency) + debug build
```

Expected first-compile risks (none could be compiled locally):

- Kotlin property names on SDK classes (taken from bytecode field names) and
  nullability of SDK parameters (taken from `@Nullable/@NotNull` annotations).
- `NexconnCustomSlot.decodeFields(fields: Map<String, Any?>)` override
  signature (taken from the official custom-message docs).
- Release build: R8 with `android/consumer-rules.pro` (keeps SDK getters for
  the reflection serializer).

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
