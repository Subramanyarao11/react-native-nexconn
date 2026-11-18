# Cloud session 2 — test plan

Branch: `fix/session-restore-recall-release` (merge to `main` once green).
Record every result in a new `docs/STATUS_SESSION_2.md` using the tables
below, then update `docs/STATUS.md`. Never paste tokens or the App Secret.

## What changed since session 1

| Area | Change | Fixes |
| --- | --- | --- |
| JS reload | New bridge method `engine.getSessionState` (Android + iOS). `client.restoreSession()` adopts the native session (initialized, status, user, generation); `NexconnProvider` calls it on mount and `initialize()` calls it when the SDK was already initialized. | iOS L11 partial: app fell back to Sign in with generation 0 after reload |
| Recall | `useMessages` asks the SDK for the current copy of each deleted message and shows a `recallNotification` only when the SDK actually returns one; otherwise the message is removed. New `recall()` in `useMessages` shows the sender's recall notice immediately. The demo uses it. | iOS L7 partial: no recall notice displayed |
| Packed consumers | `verify-packed-consumers.sh` now builds `lib/` before packing and fails if the tarball lacks `lib/module/index.js`. | TS2307 on clean checkout |
| Release builds | `verify-android.sh expo-release` (R8 forced on, fails if no mapping file or if SDK classes were renamed) and `verify-ios.sh expo-release` (Release simulator build, fails without embedded `main.jsbundle`). | Expo release builds were untested |

Native changes are small (one new method per platform), but both bridges must
be rebuilt.

## 1. Builds (both VMs) — run first

| # | VM | Command | Pass criteria |
| --- | --- | --- | --- |
| B1 | any | `bash scripts/cloud/verify-js.sh` | 53 tests pass; Codegen and pack OK |
| B2 | Ubuntu | `bash scripts/cloud/verify-android.sh cli` | Debug + release (R8) APKs |
| B3 | Ubuntu | `bash scripts/cloud/verify-android.sh expo` | Prebuild idempotent, debug APK |
| B4 | Ubuntu | `bash scripts/cloud/verify-android.sh expo-release` | Release APK, mapping present, `ai.nexconn.chat` names kept |
| B5 | macOS | `LANG=en_US.UTF-8 bash scripts/cloud/verify-ios.sh cli` | Debug simulator build |
| B6 | macOS | `LANG=en_US.UTF-8 bash scripts/cloud/verify-ios.sh expo` | Prebuild x2, debug simulator build |
| B7 | macOS | `LANG=en_US.UTF-8 bash scripts/cloud/verify-ios.sh expo-release` | Release `.app` with `main.jsbundle` |
| B8 | Ubuntu | `BUILD_NATIVE=android bash scripts/cloud/verify-packed-consumers.sh` | Works on a clean checkout without a manual build |
| B9 | macOS | `LANG=en_US.UTF-8 BUILD_NATIVE=ios bash scripts/cloud/verify-packed-consumers.sh` | Same |

## 2. Token server

Both VMs can each run their own token server with the **same** App Key and
Secret; tokens from either server connect to the same Nexconn app, so users
on different VMs can chat without any networking between the VMs.

```sh
export NEXCONN_APP_KEY=... NEXCONN_APP_SECRET=... NEXCONN_API_BASE=https://api.sg-light-api.com
export DEMO_USERS="alice:<pw>,bob:<pw>,carol:<pw>"
node examples/token-server/server.mjs          # :8787
node .yarn/releases/yarn-4.18.1.cjs test:live  # optional re-check
```

App connection: Android emulator → `adb reverse tcp:8787 tcp:8787` and use
`http://localhost:8787` (or `http://10.0.2.2:8787`); iOS simulator →
`http://localhost:8787`.

## 3. Fix verification (same platform, two users)

Run on iOS (2 simulators) and on Android (2 emulators, or emulator + device).

| # | Steps | Expected |
| --- | --- | --- |
| F1 (L11) | Sign in as alice, open Chats, then reload JS (Metro `r` / dev menu Reload) | App comes back on Chats as alice without signing in; Playground shows `connected`, same user and same generation as before the reload |
| F2 (L11) | After F1, have bob send 3 messages | alice gets each message exactly once (event log + chat list) |
| F3 (L11) | After F1, Playground → Disconnect, then sign in as bob | No alice data or events remain |
| F4 (L7) | alice long-presses her own message → recall | alice immediately sees `[message recalled]` in place of the message |
| F5 (L7) | bob has that chat open during F4 | Message disappears or becomes `[message recalled]`; record which, and whether `messagesDeleted` or `messagesUpdated` arrived |
| F6 (L7) | Edit via SDK: `client.messages.update(channel, messageId, {type:'text', text:'edited'})` from the Playground/console | bob sees the new text with "edited"; `messagesUpdated` once |

## 4. Expo release builds (installed and run, not just compiled)

Install the B4 APK and B7 `.app`, sign in through the token server (release
builds embed JS; no Metro needed).

| # | Platform | Steps | Expected |
| --- | --- | --- | --- |
| R1 | Android release | Sign in, Playground → Capabilities, App settings | Methods listed; settings JSON has real fields (proves R8 kept the reflected getters) |
| R2 | Android release | Send text and an image to a debug/other client | Delivered; message objects in the event log have content |
| R3 | iOS release | Same as R1 | Same |
| R4 | iOS release | Same as R2 | Same |
| R5 | both | Kill and relaunch the release app while signed in | Signs in again cleanly (session restore is per process; a cold start needs sign-in) |

## 5. Android ↔ iOS chat (cross-platform)

Preferred: one macOS VM running both an Android emulator (arm64 image) and an
iOS simulator, with one token server. Alternative: alice on the Ubuntu VM's
Android emulator and bob on the macOS VM's iOS simulator, each VM with its own
token server (same App Key/Secret).

| # | Steps | Expected |
| --- | --- | --- |
| X1 | alice (Android) → bob (iOS) text; then bob → alice | Each side receives once; ordering correct; sent status reaches `sent` |
| X2 | Typing both directions | "typing…" shows on the other platform |
| X3 | Read receipt: bob opens the chat | alice gets `readReceiptResponse` |
| X4 | Image and file both directions (`Send file` with a local path on each device) | Progress to 100%; receiver can download; sizes match |
| X5 | Recall from Android, then from iOS | Behaviour matches F4/F5 on both sides |
| X6 | Edit from iOS | Android receives `messagesUpdated` with the new text |
| X7 | Group: alice creates group with bob and carol; each platform sends one message | Group appears on both; all messages delivered once |
| X8 | Custom message `app:poll` registered on both, sent each direction | Receiver gets `custom` content with identical `messageType` and fields (checks Kotlin ↔ Swift field JSON) |
| X9 | Offline: bob (iOS) disconnects, alice (Android) sends 3, bob reconnects | 3 messages once, then `offlineMessageSyncCompleted` |
| X10 | Location and voice/video if test files are available | Content type and fields match on both platforms |

Getting local files onto devices for X4/X10: Android `adb push file /sdcard/Download/`
(use `/sdcard/Download/<name>` as the path); iOS simulator
`xcrun simctl addmedia booted <image>` for photos, or copy into the app
container (`xcrun simctl get_app_container booted <bundle id> data`) and use
that absolute path.

## 6. Still out of scope for this session

- Physical-device push (FCM/APNs) — needs devices and console credentials.
- Interop with an official Nexconn client (L14) — needs an official sample app
  configured with the test App Key.

## Report format

For each row: ID, platform(s), pass / partial / fail / blocked, one-line
observation, and for failures the exact error (`category`, `nativeCode`,
`method`) from the Playground plus native log lines.
