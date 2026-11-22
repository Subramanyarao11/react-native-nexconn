# Cloud session 3: test plan

Branch: `feat/push-and-sdk-fixes`, on `main` after PR #4 (`82eb8d0`).
Record results in this file under
"Results", then update `docs/STATUS.md`. Never paste tokens, the App Secret,
push tokens or `google-services.json`.

## What changed

| Area | Change | Native code |
| --- | --- | --- |
| Push | New `push.*` bridge methods, push events, `client.push`, `useNotificationOpened`, and the Android `NexconnPushInitProvider`. iOS adds `NexconnPush.swift` and AppDelegate helpers; the CLI example AppDelegate is wired. See [PUSH.md](PUSH.md) | New Kotlin and Swift files; manifest provider |
| Reply refresh | `message.refreshReference` times out (default 15 s) with `timedOut: true` | Both |
| Group nickname | Android `group.setMemberInfo` without a nickname keeps the current one | Android |
| Open channel | `openChannels.enter` resolves with the enter response on Android too (JS waits for `onEntered`) | None |
| Media paths | Android accepts `file://` and copies `content://` into the cache | Android |

**None of this native code has been compiled.** Expect possible Kotlin or
Swift compile errors. Report the exact compiler output and stop; don't patch
code on the VM.

## 1. Builds (both VMs)

| # | Command | Pass |
| --- | --- | --- |
| B1 | `bash scripts/cloud/verify-js.sh` | 71/71 tests, typecheck, lint 0 errors |
| B2 (Ubuntu) | `bash scripts/cloud/verify-android.sh cli` and `expo-release` | Builds; R8 mapping checks pass; merged manifest contains `NexconnPushInitProvider` (`grep -r NexconnPushInitProvider android/app/build/intermediates/merged_manifests`) |
| B3 (Mac) | `bash scripts/cloud/verify-ios.sh cli` and `expo-release` | Builds with `NexconnPush.swift`; the CLI AppDelegate compiles inside `#if canImport(Nexconn)` and the import resolves (check the build log for "Nexconn" module import) |
| B4 | `bash scripts/cloud/verify-packed-consumers.sh` | Pass |

## 2. Code-fix rows (emulator/simulator, two users)

| # | Steps | Pass when |
| --- | --- | --- |
| C1 | Playground → **Push permission** | Android 13+: system dialog, then `granted`/`denied` matches the choice. iOS simulator: dialog, then `granted`. Re-pressing returns the stored state without a dialog |
| C2 | Playground → **Push token?** | Emulator without FCM: `null`, no crash. iOS simulator: either `{pushType:"apns", length:64}` or a `pushTokenError` line in the event log. Don't paste token values |
| C3 | iOS simulator: drag an `.apns` file onto the simulator, with payload `{"aps":{"alert":{"title":"T","body":"B"}},"rc":{"cType":"PR","tId":"<peer userId>","fId":"<peer>"}}` and `"Simulator Target Bundle"` set; tap it with the app in the background, then again after killing the app | The event log shows `notificationOpened`, and the demo opens the chat with that peer: warm once, and cold once via the initial notification. No double open |
| C4 | Group of A and B. In the Playground (or a debugger), call `client.groups.setMemberInfo(groupId, {userId: B, extra: 'x'})` after setting B's nickname to `nick` | Android: B's nickname is still `nick` (`getMembers`); iOS behaves the same |
| C5 | Open channel: `client.openChannels.enter('<room>')` | Android and iOS both resolve with `{participantCount, ...}`; previously Android resolved `undefined` |
| C6 | Android: send an image picked as a `content://` URI (a document-picker URI), and one as `file:///...` | Both send and the peer downloads the image; `adb shell ls <cache>/nexconn-upload` shows the copy for the `content://` case |

## 3. Push on physical devices (only if available)

Rows P1–P7 in [PUSH.md](PUSH.md). These need an FCM project with
`google-services.json`, APNs keys uploaded to the Nexconn console, and a
signed iOS build on a device. Skip them and record "not run" if any of that is
missing; emulators are not evidence of delivery.

## Devin handoff (both VMs, in parallel, separate Nexconn users)

- Ubuntu: B1, B2, B4, then C1, C2, C4–C6 on Android emulators.
- Mac: B1, B3, B4, then C1–C5 on two iOS simulators, plus C3. C6 is Android
  only; run it on the Mac emulator if Ubuntu can't.

## Results

### Android (Ubuntu)

Ubuntu 22.04, Node 24.22.2, Yarn 4.18.1, JDK 17, Android SDK 36/37, NDK
27.1.12297006. Builds and C rows ran at `b025132`; `3fe30a3` changes only iOS
files and `docs/STATUS.md`, so the Android results apply to it unchanged.
Emulators: API 36 and API 35 (16 KB). Runtime rows used fresh CLI Debug APKs
built from this branch (both installs SHA-256 `53138d62…7bf9c`) with Metro
serving this branch, and two real Nexconn users. No source was changed.

| Row | Result | Evidence |
| --- | --- | --- |
| B1 | Pass | 71/71 tests, typecheck, lint 0 errors (6 warnings), package build |
| B2 CLI | Pass | Debug and Release build; R8 keeps SDK class names and `@MessageTag`; 16 KB alignment; `NexconnPushInitProvider` (not exported) in Debug and Release merged manifests |
| B2 Expo release | Pass | R8 checks pass; `NexconnPushInitProvider` in the Release merged manifest |
| B4 | Pass | `BUILD_NATIVE=android` packed CLI and Expo consumers build |
| C1 | **Fail (as written)** | Allow → `granted`; a repeat returns `granted` with no dialog. Deny → `denied`, but the second request shows the system dialog again; after a second denial the third request returns `denied` with no dialog. This is Android's one-retry denial policy (`PermissionsAndroid`), but it contradicts the row's "no second dialog" criterion. Fix the code or the criterion. |
| C2 | Pass | `getToken()` returns `null` on both emulators (no FCM); no crash, clients stay connected |
| C4 | Pass | Fresh group, Alice and Bob on separate emulators. Bob's nickname set to `nick`; Alice calls `setMemberInfo(groupId, {userId: bob, extra: 'x'})` with no nickname (resolves, no rejected keys). `getMembers` reads `nick`/`x` on Alice's client and on Bob's own client, and again on Bob's after a UI disconnect/reconnect. Bob's client gets the member-change event with `nick`/`x`. The Android bridge reads the current nickname and resends it |
| C5 | **Blocked** | `openChannels.enter('qa-pr5-c5')` rejects in 279 ms with `ChatroomNotExist` (native 23410) and a matching failure event. No existing room ID; the SDK cannot create or list rooms. Needs a room ID from the console |
| C6 | Pass | Both sent through the demo's Send file UI and received once by the peer; peer `downloadMedia` resolved for both (1,714 ms and 649 ms). The `content://` URI came from `ACTION_OPEN_DOCUMENT` launched in the app's UID; its copy in `<cache>/nexconn-upload` is byte-identical to the 1,370-byte source (SHA-1 `607fb6de…61d5`). Downloads are the SDK's default 180×120 JPEG (no `original: true`), not the source PNG bytes |

Observation (C6 setup): a URI picked in a picker launched outside the app has
no grant for the app, so the send fails with a Permission Denial and nothing is
copied. This is expected Android behaviour, not a bridge failure.

Paired Android Alice / iOS Bob at `3fe30a3` (Android CLI Debug as above,
iOS from the Mac):

| Row | Result | Evidence |
| --- | --- | --- |
| X3 Sent → Read | Pass | `3FE-X3-A2I-0926` (ID `D20A-ANJ3-7PO4-2VDL`, `needReceipt: true`) sent at 09:28:00Z while Bob's chat was closed; bubble Sent, `sentStatus` 30. Bob opened the chat at 09:28:56.649Z. Android got one native receipt at 09:28:58.385Z (generation 1, forwarded) and one matching JS receipt at .394Z (read 1/1). The bubble showed Read by 09:28:59.016Z (under 398 ms after the native receipt), with no Refresh, reconnect or reopen. Read persisted after close/reopen |
| Image Android → iOS | Pass | Sent with the Send file UI (ID `D20A-CDE5-8MA4-2VDL`, PNG 320×180, 6,700 bytes). iOS received it once live; SDK download took 688 ms, no fallback. Without `original: true` the result is a 320×180 JPEG (20,143 bytes) |
| Image iOS → Android | Pass | Bob sent a 128×96 PNG, 27,326 bytes (ID `D20A-CRF1-R6U4-J5K0`). Android received it once (native 09:32:37.936Z, JS .943Z) as a live bubble; `downloadMedia` took 2,480 ms, no fallback. The download is byte-identical to the source (SHA-1 `6c3855e5…de24`) |

Physical-device push P1–P7 (Android): not run. No FCM project,
`google-services.json` or signed physical-device build was available;
emulator results are not evidence of push delivery.

### iOS (Mac)

macOS 26.6.2 (arm64), Xcode 26.6, iOS 26.5 simulator SDK, Node 24.21.0, Yarn
4.18.1. B1 ran at `b025132`; B3, B4 and C1–C5 ran at `3fe30a3` on two
simulators (iPhone 17 Pro Max and iPhone 17) with Metro serving this branch,
and two real Nexconn users. No source was changed on the Mac.

| Row | Result | Evidence |
| --- | --- | --- |
| B1 | Pass | At `b025132`: 71/71 tests, typecheck, lint 0 errors (6 warnings), package build |
| B3 CLI at `b025132` | **Fail** | Exit 65 compiling `ios/Nexconn.mm`: `Nexconn-Swift.h` uses `UNUserNotificationCenterDelegate` and `UNNotificationPresentationOptions` without UserNotifications imported. Fixed in `3fe30a3` |
| B3 CLI | Pass | `verify-ios.sh cli` builds with `NexconnPush.swift`. The AppDelegate's `#if canImport(Nexconn)` branch compiles: `AppDelegate.o` references `NexconnBridge.installNotificationHandler`, `registerDeviceToken` and `registerDeviceTokenFailed` |
| B3 Expo release | Pass | `verify-ios.sh expo-release` builds |
| B4 | Pass | Packed CLI and Expo consumers build. The first run failed with a code-signing internal error when the disk was full; it passed after freeing space |
| C1 | Pass | Alice allowed → `granted`; Bob denied → `denied`. Repeat requests return the stored state with no dialog |
| C2 | Pass | `getToken()` returns `null` without a crash, and the event log shows `pushTokenError` (`pushType: apns`, native code 3000). No token value was recorded |
| C3 | **Pass (routing); log criterion not met** | Warm tap: one native open callback, one JS `notificationOpened` event, and Bob's chat opened once. Cold tap (app killed): the app launched to Sign in; after sign-in the initial notification opened Bob's chat once. No double open in either case. But the Playground event log keeps no `notificationOpened` line, and the cold path reaches only `useNotificationOpened` (initial notification), with no generic `notificationOpened` event |
| C4 | **Fail** | Reproduced in two fresh groups. Both clients read Bob's nickname as `nick`; Alice's `setMemberInfo(groupId, {userId: bob, extra: 'x'})` resolves with no failed keys. Alice then reads `nick`/`x`, but Bob's own client reads an empty nickname with `x`, also 13 s later. The iOS bridge omits the nickname (`group.setMemberInfo` in `ios/NexconnBridge.swift`) and the iOS SDK clears it; Android resends the current nickname and passes |
| C5 | **Blocked** | No room ID. `openChannels.enter` on an unknown room rejects with native 23410, as on Android. No room was created |

Paired Android Alice / iOS Bob rows (X3 and one image each way): see the table
in the Android subsection; all three pass. On iOS, the X3 message arrived once
(native 09:28:00.441Z) while the chat was closed, and the read-receipt batch
resolved at 09:28:58.238Z. iOS sent its image through the Send file UI.

Physical-device push P1–P7 (iOS): not run. No APNs key uploaded to Nexconn or
signed device build was available; simulator `.apns` taps are not evidence of
push delivery.
