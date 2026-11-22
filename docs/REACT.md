# React hooks

`react-native-nexconn/react` wraps the headless client in hooks. React is a
peer dependency; nothing here depends on Expo.

```tsx
import { getNexconnClient } from 'react-native-nexconn';
import { NexconnProvider } from 'react-native-nexconn/react';

<NexconnProvider client={getNexconnClient()}>
  <App />
</NexconnProvider>;
```

`NexconnProvider` re-reads the native session on mount (`restoreSession`,
default true), so a JS reload while the native SDK stays connected keeps the
user signed in.

## Rules every hook follows

- **No cross-account data.** Each hook resets when the session changes
  (connect, disconnect, account switch). The session key is the client's
  `generation` plus the user id.
- **Network drops keep data.** An automatic reconnect is the same session, so
  loaded lists stay on screen and are revalidated when the SDK reconnects.
  Loading starts once the SDK reports `connected`.
- **Clean unmounts.** Every event subscription is removed and every native
  paged query is released on unmount. The one exception is the session's
  shared profile cache, which keeps one `subscriptionChanged` listener per
  client per session. `client.listenerCount()` reports the current total, so
  you can check for leaks.
- **No invented state.** Hooks show what the SDK reports. For example, a
  failed send can only be retried once the SDK's own copy says it failed.
- Hooks with an `AsyncState` return `loading` and `error` (the last
  rejection, usually a `NexconnError`).
- Paged hooks return `UsePagedListResult<T>`:
  `{ items, hasMore, loadMore, refresh, loading, error }`. `refresh` keeps the
  current items visible until the new first page arrives.

## Connection and events

| Hook | Returns |
| --- | --- |
| `useNexconnClient()` | The client from the provider |
| `useConnection()` | `{ initialized, connectionStatus, userId, generation, isConnecting }` |
| `useSession()` | `{ key, connected, userId }` |
| `useNexconnEvent(name, handler)` | Subscribes for the component's lifetime |
| `useTotalUnreadCount()` | Total unread count |
| `useTypingUsers(channel)` | Users the SDK reports as typing |

## Channel list

`useChannelList(params?)` (default: direct and group channels) gives
`{ channels, hasMore, loadMore, refresh, loading, error }`. Pinned channels
come first, then the most recent activity. A channel is re-read on new
messages and on pin, no-disturb and unread syncs. The list reloads when
remote channel sync completes.

## Messages

```tsx
const {
  messages, // ascending by sentTime, de-duplicated by clientId/messageId
  loadOlder, hasMore, refresh,
  send, reply, edit, recall,
  sendState, retry, cancel, discard, outbox,
  readState, receipts,
} = useMessages(channel, { pageSize: 30 });
```

- **History and live updates.** New, updated, edited, recalled, deleted and
  expired messages are applied as the SDK reports them. `refresh()` re-reads
  the newest page and reconciles it: messages removed elsewhere disappear and
  edits are applied. It runs automatically after a reconnect and when offline
  message sync completes.
- **Sending.** `send(content, options)` picks `send` or `sendMedia`. The
  message appears as soon as the SDK stores it, before the server
  acknowledges it.
- **Send state.** `sendState(message)` returns
  `{ status, progress?, error?, canRetry }`:
  - `status` is `sending`, `failed`, `canceled` or `sent`.
  - `progress` is the upload percentage.
  - `canRetry` is true only when the SDK's stored copy has
    `sentStatus` failed or canceled. If the promise rejected but the SDK
    still says "sending", the outcome is uncertain and no retry is offered,
    so the server can't end up with a duplicate.
- **`retry(message)`** sends the same content (and options, for this
  session's sends) again. It deletes the failed local copy once the new one
  is stored. Stored messages can be retried after an app restart, except
  combine messages, which need their original message references.
- **`cancel(message)`** cancels an in-flight media upload.
  **`discard(message)`** deletes a failed or canceled message from this
  device.
- **`reply(target, text, { mentionSender? })`** sends a quoted reply (a
  reference message). The target needs a `messageId`.
- **Read state.** `readState(message)` returns `{ read, readCount?,
  totalCount? }` from `sentStatus` plus the SDK's receipt counts. Use it
  instead of `sentStatus` alone: the Android SDK delivers receipts without
  updating the stored message's `sentStatus`.

Mentions and replies can also be built with core helpers:

```ts
import { mentionsUser, replyTo, withMentions } from 'react-native-nexconn';

send(withMentions({ type: 'text', text: '@bob @carol ship it' }, ['bob', 'carol']));
send(withMentions({ type: 'text', text: 'standup now' }, 'all'));
send(replyTo(target, 'agreed', { mentionSender: true }));
mentionsUser(message, myUserId); // direct or @all
```

## Drafts, mentions and search

| Hook | Behaviour |
| --- | --- |
| `useDraft(channel, { debounceMs = 500 })` | `{ draft, loaded, setDraft, flush, clear }`. Reads the stored draft and saves changes after the debounce. Empty text clears the draft. Pending text is saved when the channel changes or the component unmounts, but never into a different session |
| `useUnreadMentions(channel)` | `{ messages, refresh }`: unread messages that mention the current user. It re-reads when a mentioning message arrives or the channel's unread state syncs. Call `refresh()` after clearing the unread count yourself |
| `useMessageSearch(keyword, { channel?, channelTypes?, senderUserIds?, messageTypes?, debounceMs = 300, pageSize })` | Paged local search, newest first. It waits `debounceMs` after the last keyword change. An empty keyword makes no SDK call. `keyword` in the result is the term the results belong to |

## Groups

| Hook | Behaviour |
| --- | --- |
| `useGroup(groupId)` | `{ group, refresh }`. Re-read on info changes and membership operations |
| `useGroupMembers(groupId, { role?, pageSize, filterRobotType? })` | Paged members: owner first, then admins, then members by join time. Joins add members, kicks and quits remove them, role changes and owner transfers re-read the affected members, and a dismiss empties the list |
| `useJoinedGroups({ role?, pageSize })` | Paged groups the user has joined, newest first. Groups the user leaves, is kicked from, or that are dismissed are removed. Groups the user creates or joins are added |

## Users and friends

| Hook | Behaviour |
| --- | --- |
| `useUsers(ids)` / `useUser(id)` | Profiles from a session-wide cache. Requests made in the same tick are batched into `getProfiles` calls of up to 20 ids and shared across components. Ids with no profile are remembered as missing. Failures are not cached. Profile-subscription events update the cache. A new session starts with an empty cache |
| `useOnlineStatus(ids, { subscribe?, expiry? })` | Online status per user. It is re-read when the SDK reports a change for one of them. With `subscribe: true` it also subscribes. Subscriptions are server-side and expire, and they are not removed on unmount |
| `useFriends()` | `{ friends, refresh }`, sorted by remark, then name. Kept current from add, remove, clear and info-sync events |
| `useFriendApplications({ applicationTypes?, applicationStatuses?, pageSize })` | Paged applications, re-read on status changes |
| `useBlockedUsers()` | `{ userIds, block, unblock, refresh }`. The SDK has no block-list event, so the list is re-read after each change |

## Open and community channels

| Hook | Behaviour |
| --- | --- |
| `useOpenChannel(channelId, { autoEnter = true, messageCount?, extra? })` | `{ status, info, participantCount, error, enter, exit }`. Enters on mount and exits on unmount. The enter response comes from `enter()` (iOS) or `openChannelEntered` (Android). Status changes come from participant, reset, exit and destroy events. Read messages with `useMessages({ channelType: ChannelType.open, channelId })` |
| `useCommunitySubChannels(channelId)` | `{ subChannels, unread, refresh }`, with unread info keyed by `subChannelId`. Re-read on sub-channel type changes, deletions, community sync and new messages |

## Testing components that use these hooks

The hooks run against `createMockClient()` from `react-native-nexconn/testing`.
This repository's own rendered tests (`tests/react`) use React Native
Testing Library 14 with Jest 29 and `@react-native/jest-preset`, and
`tests/react/harness.tsx` shows how to script paged queries and connection
changes.

```tsx
import { renderHook } from '@testing-library/react-native';
import { createMockClient } from 'react-native-nexconn/testing';
import { NexconnProvider, useMessages } from 'react-native-nexconn/react';

const { client, transport } = createMockClient();
const wrapper = ({ children }) => (
  <NexconnProvider client={client} restoreSession={false}>{children}</NexconnProvider>
);
const { result } = await renderHook(() => useMessages(channel), { wrapper });
```
