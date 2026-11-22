# iOS Cloud verification

18 November 2026 · `feat/ios-cloud-verify`

The CLI and Expo fixtures and both fresh tarball consumers built for the iOS
Simulator against `NexconnChat/Chat 26.4.2`. The live CLI checklist had 11
passes, two partial results and one blocked result.

## Environment and builds

macOS 26.6.2 (arm64), Node 24.21.0, Yarn 4.18.1, Xcode 26.6 (17F113), iOS
Simulator 26.5 and CocoaPods 1.17.0 (Homebrew; ran with `LANG=en_US.UTF-8`).
The iOS 27.0 runtime was also installed but not used for live checks.

| Check | Result |
| --- | --- |
| `bash scripts/cloud/verify-ios.sh cli` | Pass: Debug simulator build for arm64 and x86_64; Codegen, Swift bridge, custom-message overrides and Objective-C++ Swift-header import compiled. |
| `bash scripts/cloud/verify-ios.sh expo` | Pass: both prebuild invocations and Debug simulator build for arm64 and x86_64. |
| `BUILD_NATIVE=ios bash scripts/cloud/verify-packed-consumers.sh` | Pass after generating the library output. Fresh RN 0.88.1 CLI and Expo SDK 58 consumers installed the tarball outside the workspace, type-checked all three entry points, and built for iOS Simulator. Expo prebuild also passed. |
| `node .yarn/releases/yarn-4.18.1.cjs test` | Pass: 49 tests, no failures or skips. |

CocoaPods rejected the local development pod because npm version
`0.0.0-development` sorts below the autolinker's `>= 0` requirement. The iOS
podspec now exposes pod version `0.0.0` while preserving the npm version and
Git tag. No Swift or Objective-C++ source changes were needed.

On a clean checkout, the packed script initially created a tarball without the
`lib/` output and stopped with TypeScript `TS2307`. Run the build first; the
shared verifier was not changed:

```sh
node .yarn/releases/yarn-4.18.1.cjs build
LANG=en_US.UTF-8 BUILD_NATIVE=ios bash scripts/cloud/verify-packed-consumers.sh
```

## Live simulator checklist

Used the CLI Debug fixture on an iPhone 17 and an iPhone 17 Pro Max, both on
iOS 26.5. The example token server served two test accounts against the live
Nexconn Singapore service. `npx react-native run-ios` built the fixture, but
its install step looked in the default DerivedData directory instead of the
requested directory. A `--binary-path` retry failed on missing
`PLATFORM_NAME`. The runbook's `xcrun simctl install` fallback launched the
unchanged fixture on both simulators.

B initially failed twice on the Pro Max with SDK error `30024` (native status
`4`, `tokenIncorrect`). B connected on the iPhone 17 after swapping devices
and later also connected on the Pro Max. The cause was not established. Both
accounts were connected before two-user messaging checks. Direct SDK checks
used the existing fixture through Metro/Hermes, not a mock or a modified app.
An annotated recording in the verification session shows live direct text
delivery and typing.

| ID | Result | Observation |
| --- | --- | --- |
| L1 — Initialize and connect | Pass after recovery | A's Playground showed connected at generation 1; B subsequently connected independently. |
| L2 — Capabilities | Pass | SDK 26.4.2, bridge 1.0.0, 146 methods. Three iOS-only entries present; five Android-only entries absent. |
| L3 — Direct text | Pass | B received one `messageReceived` event. Both chats displayed one copy of the test message. |
| L4 — Read receipt | Pass | B opened the unread chat; A received `readReceiptResponse`. |
| L5 — Typing | Pass | B typed; A displayed the typing indicator and received `typingStatusChanged`. |
| L6 — Image and file | Pass via SDK | Both sends reported progress to 100%. B downloaded both; on-disk sizes matched the 6,237-byte PNG and 1,260,000-byte text file. |
| L7 — Recall and edit | Partial | UI recall removed the original and B received `messagesDeleted`, but no recall notification was displayed. SDK edit kept the same message ID; B received `messagesUpdated` and saw the new text and edited label. |
| L8 — Group | Pass via SDK | Creation returned process code 0; the group send was acknowledged. B received `groupOperation` and the message. Both lists showed the group after A reopened Chats. UI creation was not tested. |
| L9 — Offline delivery | Pass | After reconnecting, B received each of three messages once, followed by `offlineMessageSyncCompleted`. |
| L10 — Account switch | Pass | On the same simulator, A's peer channel and draft were absent after switching to B. B's own peer channel synced and Playground had a fresh event log. |
| L11 — JS reload | Partial | Native connection survived and reinitialization returned `alreadyInitialized: true`. One later kick produced one callback. The fixture returned to Sign in with no JS user and generation 0; other event types were not checked for duplicates after reload. |
| L12 — Kicked by other client | Pass | A connected on the second simulator; the first received exactly one status 3 (`kickedOfflineByOtherClient`). |
| L13 — Custom message | Pass via SDK | After registering `app:poll` on both devices, B received `custom` content with the expected type and synthetic field. |
| L14 — Official Web interop | Blocked | The [official Web demo](https://www.nexconn.ai/demos/chat) opened with a sandbox user and no visible way to join the test app or data center. No credentials were entered and no message exchange was attempted. |

Expo Release, physical-device APNs and Android-to-iOS interop were not tested
in this run.
