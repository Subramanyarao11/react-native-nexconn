# Changelog

Native results are listed only where a cloud test session verified them
(see docs/reference/status.md). Before 0.1.0-beta.0 the project was developed
privately, so earlier entries are grouped by milestone.

## Unreleased

## 0.1.0-beta.0

First public release, published to npm as
`@subramanyarao11/react-native-nexconn` under the MIT license.

### Push notifications (PR #5)

- `client.push`: permission, token, initial notification, tap routing
  (`onNotificationOpened`, `useNotificationOpened`), clearing notifications.
  Android installs its listener at process start; iOS has AppDelegate
  helpers. Builds pass on both platforms, and simulator taps route warm and
  cold. Delivery on physical devices has not been tested.
- `refreshReferenceMessages` times out (`timedOut: true`). Android
  `openChannels.enter` resolves with the enter response. Android accepts
  `file://` paths and copies `content://` URIs. An extra-only
  `setMemberInfo` keeps the nickname (verified on Android; the iOS fix needs
  re-verification).

### React layer (PR #6)

#### Added

- React hooks:
  - Groups: `useGroup`, `useGroupMembers` and `useJoinedGroups`.
  - Users: `useUsers`/`useUser` (a batched, session-scoped profile cache),
    `useOnlineStatus`, `useFriends`, `useFriendApplications` and
    `useBlockedUsers`.
  - Messages and channels: `useMessageSearch`, `useDraft` and
    `useUnreadMentions`.
  - Open and community channels: `useOpenChannel` and
    `useCommunitySubChannels`.
  - `useSession`.
- `useMessages` now tracks sends:
  - `sendState`: sending, failed, canceled or sent, with upload progress.
  - `retry`, allowed only when the SDK's copy says the send failed or was
    canceled.
  - `cancel`, `discard`, `reply` and `outbox`.
- Content helpers: `replyTo`, `withMentions` and `mentionsUser`.
- `client.listenerCount()` for leak checks.
- Rendered hook tests (React Native Testing Library 14, Jest 29) under
  `tests/react`, run with `yarn test:react`.
- Demo app:
  - Chat: message actions (reply, edit, recall, retry, cancel, discard),
    mentions, saved drafts, in-chat search and an unread-mention banner.
  - A group member panel.
  - A Contacts tab with friends, requests and the block list.
- Docs: QUICKSTART, REACT (hooks reference), TROUBLESHOOTING, SECURITY and
  this changelog.

#### Changed

- `useMessages` and `useChannelList` keep their data through a network drop
  and revalidate after reconnecting. `useMessages` also revalidates when
  offline sync completes. Previously both lists were cleared whenever the
  connection dropped.
- `useChannelList().refresh()` keeps the current channels until the new
  first page arrives.

## Session 2 fixes (PR #4, merged as 82eb8d0)

### Fixed

- Read status on Android: the sender's bubble now shows Read from the SDK's
  receipt counts. The Android SDK keeps the stored message at Sent (X3,
  verified live).
- The sender's own media, edits and receipts update in `useMessages`.
  Android image downloads have a fallback path (X4 and X6 verified; the
  fallback itself has not been exercised).
- iOS re-initializes the SDK before reconnecting after a disconnect, which
  fixes recalls after an account switch.
- The session is restored after a JS reload, and recall notices are shown.
  The Nexconn SDK classes are kept under R8 in release builds.
- `useMessages().refresh()` recovers recalls the app missed.

## Native bring-up

- Android cloud builds fixed and verified (PR #1). iOS simulator builds
  verified afterwards, with live two-user chat on emulators and simulators.

## Initial implementation (PR #2)

- Full bridge over the official Nexconn native SDKs (Android
  `ai.nexconn.chat:chat` 26.4.2, iOS `NexconnChat` 26.4.2): lifecycle,
  channels, messages, groups, open and community channels, users, translation,
  tags, settings, typed events, paged queries and structured errors.
- React provider and core hooks, Expo config plugin, test doubles, example
  apps for Community CLI and Expo, and an example token server.
