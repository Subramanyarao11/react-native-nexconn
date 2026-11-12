# Implementation status

Last updated 12 November 2026, from a local checkout on the Mac
(Node 24.22.2, Yarn 4.18.1, Java 17.0.17, Xcode 26.1.1, CocoaPods 1.15.2 via
the example Gemfile).

## What exists

- Official Nexconn Chat SDK `26.4.2` declared as a Gradle dependency
  (`ai.nexconn.chat:chat`) and a CocoaPods dependency (`NexconnChat/Chat`).
  Signatures were read from the artifacts; see `docs/API_EVIDENCE.md`.
- One TurboModule (`Nexconn`) on each platform with: `initialize`, `connect`,
  `disconnect`, `getConnectionStatus`, `sendDirectText`, and two Codegen event
  emitters for connection status and received messages.
  - Android: `android/src/main/java/com/nexconn/NexconnModule.kt`.
  - iOS: `ios/NexconnChatAdapter.m` (Objective-C, the only file importing the
    SDK) behind `ios/Nexconn.mm`.
- Typed JavaScript client `NexconnChat` in `src/core.ts`: validates every
  native payload, maps errors to `NexconnError` (category, operation, native
  code), allows one session at a time, registers listeners before connecting
  and drops events tagged with a previous session.
- `getIntegrationStatus()` now reports `sdkIntegrated: true` and the native
  `sdkVersion`.
- Expo config plugin `app.plugin.js` adds Nexconn's Maven repository to the
  generated Android project. Community CLI apps add it by hand (README).
- Both examples show the same diagnostic screen driving the public API.
  Credentials are typed at runtime; none are stored in the repository.
- `yarn.lock` is committed; `install --immutable` succeeds.

## Verified on 12 November 2026

| Check | Result |
| --- | --- |
| `yarn check` (13 Node tests, TypeScript, ESLint, Bob build) | Pass |
| Community CLI, Android: `./gradlew assembleDebug` (arm64-v8a) | Pass; debug APK produced. Kotlin compiled against the SDK |
| Community CLI, iOS: `pod install` + `xcodebuild` Debug, simulator arm64 | Pass |
| Community CLI, iOS: launch on iPhone 17 Pro simulator | App starts; bridge reports `{"platform":"ios","nativeModuleLinked":true,"sdkIntegrated":true,"sdkVersion":"26.4.2"}` |
| Expo: `expo-dev-client` installed, `expo prebuild` | Pass; plugin wrote the Maven repository into `android/build.gradle` |
| Expo, Android: `./gradlew assembleDebug` | **Not completed**: the first attempt ran out of disk space and the second was stopped before finishing. No compile error from this package appeared in either |
| Expo, iOS: `pod install` | Pass; `NexconnChat 26.4.2` installed |
| Expo, iOS: `xcodebuild` Debug, simulator | **Fails in Expo's own code**: `expo-modules-jsi` 58.0.23 (`JavaScriptObject.swift:946`, "sending 'slot' risks causing data races") under Xcode 26.1.1 / Swift 6.2.1. This package's files reported no errors |
| `yarn pack` contents | Native sources, `lib/`, `src/`, podspec and plugin present; no vendor binaries |

The tests use a controllable fake transport. They cover the wrapper's own
contracts (ordering, session isolation, error mapping, payload validation) and
say nothing about the Nexconn service.

## Not verified

- **No call has reached the Nexconn service.** `initialize`, `connect`, send
  and receive have never run with a real App Key or token. Nothing here is
  evidence that messaging works.
- Both Expo native builds. Android needs several GB of free disk. iOS needs
  an Xcode that Expo SDK 58 compiles with; its changelog is written against
  Xcode 27.
- Android has only been compiled. No emulator or device was available, so the
  Android app has not been launched.
- Initialization from JavaScript instead of application startup (see
  `docs/API_EVIDENCE.md`), reconnect behaviour, offline delivery after
  reconnect, account switching on a device, and JS reload behaviour.
- Release builds (R8 shrinking, iOS Release), physical devices, push.
- Installing the packed tarball into consumers outside this workspace.
- Android 16 KB page-size compatibility of the vendor native libraries.
- SDK publication terms and the final project license.
- The GitHub Actions workflow has still never been run.

## Known issues

- Yarn reports unmet peer requirements that come from
  `@react-native/eslint-config`: `eslint-plugin-ft-flow` asks for ESLint
  `^8.57.0` and `hermes-eslint` while the generated scaffold uses ESLint 9.
  Lint runs and passes. Left as generated rather than downgrading ESLint.
- CocoaPods could not resolve the library pod at version `0.0.0-development`
  once it depended on a trunk pod, so the podspec uses the base version
  (`0.0.0`). The npm version is unchanged.
- The cloud environment from the earlier setup was not used for this work and
  was still reported as not runnable on 10 November.

## Paused

Work on the SDK is paused as of 12 November 2026 because the Mac is short on
disk space. Resume from "Not verified" and "Next" below. The earlier planning
documents are in this folder, including `PROJECT_HANDOVER.md`.

## Needed for live verification

A Nexconn test application (App Key and its data-center area code) and tokens
for two test users issued server-side. With those, on the Mac:

```sh
node .yarn/releases/yarn-4.18.1.cjs install --immutable

# Community CLI
(cd example-cli && bundle install && cd ios && bundle exec pod install)
node .yarn/releases/yarn-4.18.1.cjs example:cli ios
node .yarn/releases/yarn-4.18.1.cjs example:cli android   # needs an emulator or device

# Expo development build
(cd example && npx expo prebuild)
node .yarn/releases/yarn-4.18.1.cjs example:expo ios
node .yarn/releases/yarn-4.18.1.cjs example:expo android
```

In each app: enter the App Key and area, Initialize, paste a user token,
Connect, then send text between the two users in both directions. Repeat after
killing and reopening one app to check offline delivery, and after Disconnect
and Connect as the other user to check account switching.

## Next

1. Live two-user text exchange on both platforms; record the results here.
2. Launch and exercise the Android builds.
3. Packed-tarball installs in independent CLI and Expo consumers.
4. Token-server example, then conversations, history and unread state.
