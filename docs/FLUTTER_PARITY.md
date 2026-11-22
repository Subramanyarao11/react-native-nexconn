# Comparison with the Nexconn Flutter SDK

Compared on 22 November 2026: `nexconn-chat-sdk-flutter` `main` (pubspec
version 26.2.11, last pushed 17 September 2026) against this package at the
`feat/push-and-sdk-fixes` branch. Only public method and handler names were
compared; no Flutter source was copied.

## Different foundations

- **Flutter** wraps RongCloud's IM wrapper plugin
  (`rongcloud_im_wrapper_plugin` 5.32.8, `RCIMIWEngine`) and presents
  Nexconn-style class names on top of it.
- **This package** bridges the official Nexconn native SDKs directly:
  Android `ai.nexconn.chat:chat` 26.4.2 and iOS `NexconnChat` 26.4.2.

Both talk to the same Nexconn service. A Flutter app and an app built on this
package should therefore interoperate. That has not been tested yet: it is
runbook row L14, chatting against an official Nexconn client.

"Compatible" here means **feature coverage**, not a drop-in API:

- This package uses Promises and `client.on(...)` unsubscribe functions where
  Flutter uses callback handlers and `add…Handler`/`remove…Handler`.
- `registerCustomMessages` covers Flutter's `registerCustomMessage` and
  `registerCustomMediaMessage`.
- Our `connectionStatusChanged` corresponds to Flutter's `onStatusChanged`.

## Result

Of the 139 public Flutter methods compared, nearly all have a counterpart
here; those that differ are listed below. All 43 Flutter handler callbacks map
to events here. The 3 Flutter features with no Nexconn native API, and so no
counterpart here, are listed after the name differences.

| Flutter | Here |
| --- | --- |
| `BaseChannel.cancelSendingMessage` | `messages.cancelSendMedia` (the native SDKs only cancel media sends) |
| `NCEngine.add…Handler` / `remove…Handler` | `client.on(event, listener)` → unsubscribe |
| `registerCustomMessage` / `registerCustomMediaMessage` | `registerCustomMessages` |

**Present in Flutter, absent from the pinned native SDKs** (so not in this
package; adding them would mean using RongCloud's SDK instead of Nexconn's):

- `NCEngine.destroy()`: native 26.4.2 has no destroy. Use `disconnect()`.
- `NCEngine.setLogLevel()` at runtime: native only takes `logLevel` at
  `initialize`, which is supported.
- `GroupChannel.setRemark()` (group remark): native 26.4.2 only has friend
  remarks (`users.setFriendInfo`).
- Android vendor push options in Flutter's enums (OPPO, vivo, Honor): native
  26.4.2 `AndroidPushConfig` exposes only Huawei and FCM fields, and all of
  those are supported.

**Present here, not in Flutter 26.2.11** (from the newer native SDK or this
bridge):

- Push permission, token and notification-tap routing (`client.push`,
  `useNotificationOpened`).
- Paged queries for local messages by time and for channels with unread
  mentions.
- Community-channel unread info (`community.getChannelsUnreadInfo`).
- React hooks and a mock transport for tests.

Flutter 26.2.11 already has stream messages, speech to text, message
metadata and read receipts by users; this package has them too.

See [PARITY.md](PARITY.md) for the full native method matrix.
