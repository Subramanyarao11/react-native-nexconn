# Implementation status

Last updated 22 November 2026.

## Summary

The SDK is **implemented at source level for the full public surface of the
pinned Nexconn native SDKs** (Android `ai.nexconn.chat:chat:26.4.2`, iOS
`NexconnChat/Chat 26.4.2`): 151 bridge methods, 18 paged query kinds and 62
SDK event types, with 6 documented platform-only gaps (docs/PARITY.md).

Both native bridges have connected to Nexconn from the CLI fixtures on
Android emulators and an iOS simulator. The Android CLI and Expo fixtures
also build with R8. See [the session 2 results](STATUS_SESSION_2.md) for the
tested revisions, runtime checks, and limits, and the
[cloud runbook](CLOUD_TEST_RUNBOOK.md) for how to repeat them.

## Route decision

Direct bridge over the official Nexconn native SDKs (no RongCloud wrapper).
Both SDKs expose the same high-level `NCEngine`/channel/handler API, enum raw
values match across platforms, and the official artifacts are publicly
installable (Maven + CocoaPods trunk), so a single TurboModule with a shared
JSON protocol was chosen (docs/BRIDGE_PROTOCOL.md).

## Completed (source)

- Public TypeScript API: lifecycle, channels, messages (all content types,
  media with progress/cancel, edit, recall, receipts, metadata, speech to
  text, streams, references, combine, insert), groups, open channels,
  community channels, users/friends/presence/block list, translation, tags,
  do-not-disturb/push settings, capabilities, custom messages, typed events,
  paged queries, structured errors.
- React entry point: provider and hooks (`useConnection`, `useNexconnEvent`,
  `useChannelList`, `useMessages`, `useTotalUnreadCount`, `useTypingUsers`),
  with per-session reset and local-echo de-duplication.
- Testing entry point: `MockTransport`, `createMockClient`, fixtures.
- Android Kotlin bridge (`android/src/main/java/com/nexconn/bridge`):
  dispatcher, reflection serializer, event forwarder for all handler
  callbacks, custom message slots, query registry, message cache, consumer
  ProGuard rules, Nexconn Maven repository wiring.
- iOS Swift bridge (`ios/*.swift`) + ObjC++ TurboModule shell, ObjC-runtime
  serializer, event forwarder, custom message slots, APNs token entry point;
  podspec depends on `NexconnChat/Chat`.
- Lifecycle safety: handlers registered at initialize (before connect),
  idempotent initialize across JS reloads, de-duplicated connect, `busy` for
  concurrent native connects, session generation filtering, query/message
  handles cleared per session, emitter detached on module invalidation.
- Expo config plugin (Maven repo, optional FCM wiring, notification-tap
  intent filters, optional APNs entitlement/background mode, SDK version pin),
  idempotent edits.
- Example apps (CLI and Expo) share `examples/shared/DemoApp.tsx`: sign-in via
  token server, conversation list, chat (text, file/image by path, typing,
  receipts, recall), group creation, developer playground with redacted event
  log. Example token server binds tokens to the authenticated user.
- Docs: API guide, parity matrix (generated), bridge protocol, cloud runbook,
  third-party notices. Committed `yarn.lock`.
- Cloud scripts (`scripts/cloud/*.sh`) and a manual native-build workflow.

## Verified on the dev Mac (JavaScript only)

| Check | Result |
| --- | --- |
| `yarn install --immutable` (Yarn 4.18.1, Node 24.22.2) | pass |
| `yarn test` — 49 tests (normalization, client lifecycle, stores, plugin, wire-protocol contract that parses the Kotlin and Swift sources) | pass |
| `yarn typecheck` (library, examples, shared demo) | pass |
| `yarn lint` | 0 errors, 6 `no-void` warnings |
| `yarn build` (Bob module + typings, `.ts` imports rewritten) | pass |
| Codegen schema parse + Android/iOS spec generation | pass; generated signatures match the Kotlin/ObjC++ overrides |
| `yarn pack --dry-run` | sources, lib, plugin, native sources only; no vendor binaries |
| Config-plugin helper idempotency | pass |
| API inventory from pinned artifacts (javap of the AAR, iOS `.swiftinterface`, enum raw values) | done (scratch only; not committed) |

## Verified on Ubuntu (JavaScript and Android)

Ubuntu 22.04.5 LTS with Node 24.22.2, Yarn 4.18.1, OpenJDK 17.0.20.1 and
Gradle 9.4.1. Set `ANDROID_HOME=/home/ubuntu/android-sdk`. Verified via
`sdkmanager`: platforms `android-36` and `android-37.0` (both revision 2),
build-tools 36.0.0 and 37.0.0, platform-tools 37.0.1, NDK 27.1.12297006 and
CMake 3.22.1.

| Check | Result |
| --- | --- |
| `bash scripts/cloud/verify-js.sh` | Pass: immutable install (peer warnings), 49/49 tests, typecheck, ESLint (0 errors, 6 `no-void` warnings), Bob build, Android/iOS Codegen and tarball check. |
| `bash scripts/cloud/verify-android.sh cli` | Pass: debug APK (`arm64-v8a`, `x86_64`), release APK (`arm64-v8a`), and `:app:minifyReleaseWithR8`. Both variants compiled the Kotlin bridge. |
| `bash scripts/cloud/verify-android.sh expo` | Pass: clean Android prebuild, unchanged project/app Gradle files and manifest after non-clean prebuild, and debug APK (`arm64-v8a`, `x86_64`). The generated project contains the Nexconn Maven repository and both notification-tap intent filters. |
| `BUILD_NATIVE=android bash scripts/cloud/verify-packed-consumers.sh` | Pass: fresh CLI (RN 0.88.1) and Expo (SDK 58.0.26, RN 0.88.1) apps outside the workspace installed the `0.0.0-development` tarball. TypeScript 6.0.3 checked all three entry points. Expo prebuild passed; both debug APKs compiled the bridge and packaged the Nexconn native library for `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64`. |
| `node .yarn/releases/yarn-4.18.1.cjs test:live` | Pass: 1 test, 0 skipped. The example server issued distinct Nexconn tokens bound to two signed-in users via `/v4/auth/access-token/issue`. Unauthenticated requests, wrong passwords, and sessions invalidated by logout received HTTP 401. |
| CLI debug APK alignment | All 22 packaged libraries (including `libNexConnIMLib.so` on both ABIs) had `0x4000` alignment on every ELF LOAD segment. `zipalign -P 16 -c -v 4` passed. |

Maven Central initially returned HTTP 429; Gradle used Google's Maven Central
mirror via a VM-local init script. The Nexconn AAR still came from the official
Nexconn Maven repository.

The consumer npm installs reported advisories before and after tarball
installation: CLI 67 → 68 high; Expo 25 → 26 high, 2 moderate throughout.
These are build and typecheck results, not a dependency security audit.

## Changes and verification after iOS session 1

Branch `fix/session-restore-recall-release`; test plan in
[cloud session 2](CLOUD_SESSION_2.md).

- JS reload: new `engine.getSessionState` on both bridges;
  `client.restoreSession()` (called by `NexconnProvider` and by
  `initialize()` when already initialized) restores status, user and
  generation. Addresses iOS L11 partial.
- Recall: `useMessages` shows an SDK-provided recall notice when one exists
  (otherwise removes the message) and gains `recall()`. Addresses iOS L7 partial.
- `verify-packed-consumers.sh` builds before packing; new `expo-release`
  targets in `verify-android.sh` / `verify-ios.sh`.
- JS checks on the dev Mac: 53/53 tests, typecheck, lint (0 errors), build.
- The Ubuntu run at `dce119b` exposed release sign-in and message
  registration failures, a live recall issue, and two incorrect verifier
  checks. `5ce885f` broadened the R8 keep rules, corrected the verifiers, and
  switched recall reconciliation to a fresh SDK lookup.
- Ubuntu retest at `5ce885f` passed:
  - the Expo R8 release build and its runtime (sign-in, text, PNG, history,
    cold re-sign-in);
  - the verifiers;
  - 16 KB runtime on API 35;
  - the sender side of recall.

  In that run, the recipient's open chat stayed stale and received no JS
  recall event.
- At `eb3cb59`, Ubuntu passed all 55 JS tests, Codegen and pack, and both
  Android fixtures' debug and R8 builds. The live recall failure did not
  recur: Android → Android, Android → iOS, and iOS → Android each delivered
  a native callback and a JS delete event and removed the original text
  while the recipient stayed in the chat. Recall before opening the
  Android chat also passed. Refresh was exercised, but stale-message
  catch-up remains unverified because the live callback removed the text
  first.
- The paired CLI checks passed two-way text, typing, custom messages, group
  chat, iOS-to-Android edit delivery, and offline delivery to iOS. The
  receipt reached the SDK and JS but the demo label lagged. Android did not
  complete the incoming PNG download, and location sends failed on both
  platforms (`31610`).
- The `eb3cb59` Expo R8 APK passed HTTPS sign-in, capabilities and settings,
  two-way text with a CLI peer, and decoded history on the 16 KB Android
  emulator without Metro. Release image and cold restart were not repeated
  on this revision.

- macOS run at `eb3cb59` (see STATUS_SESSION_2.md):
  - iOS CLI, Expo Debug and Release builds and packed consumers pass.
  - Android ↔ iOS chat passes except X4 (PNG download stall), X6 (sender
    edit refresh) and X10 (location 31610).
  - iOS recipient recall failed after an account switch in the same
    process.

  The fix is not yet verified natively: the iOS bridge re-initializes the
  SDK before a connect that follows a disconnect. Static trace and retest
  rows T9–T12 are in [cloud session 2](CLOUD_SESSION_2.md).

- At `d2d667f`, Ubuntu passed JavaScript verification, fresh CLI debug and
  Expo R8 builds, Android T11 account-switch recall, and an exact byte
  comparison of an Android → Android PNG downloaded without the fallback.
  Paired X3 receipt delivery passes, but the Android bubble still stays Sent
  beyond one second and needs a further fix. The paired iOS → Android
  original PNG matched the source bytes through the native SDK download
  without the fallback; iOS edits reached Android once and appeared live.
  A post-receipt SDK lookup still returns `sentStatus=30` despite read count
  1, so the hook needs receipt-aware state rather than only rereading status.
  No new Android Expo release runtime claim was made. See the
  [follow-up results](STATUS_SESSION_2.md#android-follow-up-at-d2d667f-november-2122-utc).

- At `ec16c9f` (`3c8c76c` X3 fix plus docs), the paired X3 retest passed:
  Android received exactly one matching iOS read receipt and the open bubble
  changed from Sent to Read within one second without Refresh, reconnecting
  or reopening, and stayed Read after reopening. The SDK still reports
  `sentStatus=30`, so Read comes from stored receipt counts. See the
  [X3 retest](STATUS_SESSION_2.md#x3-retest-at-ec16c9f-november-22-utc).

- At `a7b4b31`, the Mac reran the iOS regressions on the X3 fix. All of them passed: T9/T10 recall, X6, R4 in Debug and Release, T12, R3–R5, and iOS receipts. See the
  [iOS pre-merge regression](STATUS_SESSION_2.md#ios-pre-merge-regression-at-a7b4b31-november-22-utc).

- At `d2d667f`, the Mac passed the iOS CLI and Expo Release builds, T9/T10
  account-switch recall, T12 (typing, JS reload, live and offline delivery),
  the iOS sender edit, and Release R3–R5. The Release sender image now appears
  during upload without Refresh. See the
  [iOS follow-up](STATUS_SESSION_2.md#ios-follow-up-at-d2d667f-november-2122-utc).

## Pending verification (cloud VMs / devices)

The [session 2 results](STATUS_SESSION_2.md) distinguish what's verified
in this run from previous revisions. They do not establish full
L1–L16 device coverage, official-client interoperability, or physical-device
push; FCM and physical push were out of scope.

## Known limits and assumptions

- **Location messages (X10) fail in the vendor SDK on both platforms** with
  31610 `JsonParserFailed`. The bridge passes valid latitude, longitude and
  POI. The vendor encoders write the core's `type` (location type) field
  themselves:
  - iOS `MessageMappings.rsimContent` sets `locationType = "2"`.
  - Android's converter never sets it, so `LocationMessage.encode` writes
    `""`.

  The core models `location_type` as an enum (`Unknown`/`Wgs84`/`Gcj02`/`Bd09`).
  Neither SDK exposes the field, so it can't be corrected through the public
  API. This needs a vendor fix; it was not reported (no vendor contact).

- `ErrorHandler`/`OperationHandler` success is assumed to be `error == null`
  or `error.code == 0`.
- Android delivers the open-channel enter response only via the
  `openChannelEntered` event; iOS also resolves `enter()` with it.
- `refreshReferenceMessages` resolves when the remote result arrives; if the
  SDK never calls the remote handler the promise stays pending.
- Group `setMemberInfo` on Android requires a nickname; the bridge passes `""`
  when none is given, which may clear an existing nickname.
- Media `localPath` is passed through; the SDKs' accepted path/URI forms must
  be confirmed on devices (`file://` is stripped on iOS).
- Hooks are covered through their pure stores; React Native Testing Library
  is not installed, so rendered hook tests are not included.
- Licensing, SDK redistribution terms and publication remain unresolved; the
  package stays private.
