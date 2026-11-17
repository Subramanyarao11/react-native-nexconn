# Implementation status

Last updated 18 November 2026.

## Summary

The SDK is **implemented at source level for the full public surface of the
pinned Nexconn native SDKs** (Android `ai.nexconn.chat:chat:26.4.2`, iOS
`NexconnChat/Chat 26.4.2`): 151 bridge methods, 18 paged query kinds and 62
SDK event types, with 8 documented platform-only gaps (docs/PARITY.md).

The Android bridge has compiled against the pinned SDK in both workspace
fixtures. The example token server passed its live Nexconn API test, but the
mobile SDK has not been run on a simulator/device or connected to Nexconn.
The Swift bridge has not been compiled. See
[the cloud runbook](CLOUD_TEST_RUNBOOK.md) for the verification steps.

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

## Pending verification (cloud VMs / devices)

Plan (18–19 November 2026): the iOS run (`verify-ios.sh`) is in progress on
the macOS VM; the two-user live checklist and the Expo release builds are
scheduled for the next cloud session — see "Next cloud session" in
[the cloud runbook](CLOUD_TEST_RUNBOOK.md).

- First native compile of the Swift bridge and `Nexconn-Swift.h` import (CLI + Expo) — running.
- Expo release builds (Android `assembleRelease`, iOS Release) and iOS prebuild with the plugin.
- All live scenarios L1–L16 in docs/CLOUD_TEST_RUNBOOK.md, including
  cross-platform and official-client interop, offline sync, account switch,
  JS reload, custom messages and physical-device push.
- Android launch on a 16 KB page-size device or emulator.

## Known limits and assumptions

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
