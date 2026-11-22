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

_Not run yet._
