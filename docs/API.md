# API guide

Community React Native SDK for the Nexconn Chat SDK. Not affiliated with or
endorsed by Nexconn. It wraps the official native SDKs (Android
`ai.nexconn.chat:chat:26.4.2`, iOS `NexconnChat/Chat 26.4.2`) through one
TurboModule and exposes a typed, platform-neutral API.

Entry points:

| Import | Contents |
| --- | --- |
| `react-native-nexconn` | Headless client, enums, models, errors |
| `react-native-nexconn/react` | `NexconnProvider` and hooks |
| `react-native-nexconn/testing` | `MockTransport`, `createMockClient`, fixtures |
| `react-native-nexconn/app.plugin.js` | Expo config plugin (development builds) |

## Install

Community CLI (RN 0.88, New Architecture):

```sh
npm install react-native-nexconn   # private package: install from the packed .tgz
cd ios && pod install              # pulls NexconnChat/Chat from CocoaPods trunk
```

The Android library adds Nexconn's Maven repository
(`https://maven.nexconn.ai/repository/maven-releases/`) to all projects
automatically. If your build forbids project repositories, set
`ext.nexconnSkipRepository = true` in `android/build.gradle` and declare the
repository yourself. Pin SDK versions with `ext.nexconnSdkVersion` (Android)
and `$NexconnChatVersion` or `NEXCONN_CHAT_VERSION` (iOS).

Expo (SDK 58 development build; Expo Go is not supported):

```json
{ "expo": { "plugins": [["react-native-nexconn", {
  "android": { "fcm": false, "notificationIntentFilters": true },
  "ios": { "pushNotifications": false },
  "sdkVersion": "26.4.2"
}]] } }
```

Then `npx expo prebuild` and `npx expo run:android` / `npx expo run:ios`.

## Lifecycle

```ts
import { AreaCode, getNexconnClient } from 'react-native-nexconn';

const client = getNexconnClient();         // process-wide (the native SDK is a singleton)
await client.initialize({ appKey, areaCode: AreaCode.sg });
await client.registerCustomMessages([...]); // optional, before connect
await client.connectWithTokenProvider({
  tokenProvider: () => myBackend.fetchNexconnToken(), // never ship the App Secret
});
// ...
await client.disconnect();                 // or { disablePush: true } to log out fully
```

- `initialize` registers every native event handler before `connect`, so
  offline messages delivered during connect are not missed. Calling it again
  with the same App Key is a no-op (safe after a JS reload); a different App
  Key rejects with `already_initialized`.
- `connect` calls are de-duplicated; a second concurrent call shares the first
  attempt. Each connect/disconnect advances `generation`: SDK events and paged
  queries from an older generation are discarded/rejected (`stale_session`), so
  a previous user's late callbacks never reach the next user.
- `client.getSnapshot()` / `client.subscribe()` expose
  `{ initialized, connectionStatus, userId, generation, isConnecting }`.
- Android: the docs recommend initializing in `Application.onCreate`; calling
  `initialize` from JS later is the documented privacy-consent pattern and is
  supported. iOS: initialize before any other SDK use.

## Channels — `client.channels`

`createChannelsQuery`, `createUnreadMentionMeChannelsQuery`, `getChannels`,
`getChannel`, `reload`, `getUnreadChannels`, `getPinnedChannels`, `search`,
`syncRemoteChannels`, `delete`, `deleteChannels`, `pin`, `unpin`,
`setNoDisturbLevel`, `setChannelTypeNoDisturbLevel`,
`getChannelTypeNoDisturbLevel`, `clearUnreadCount`, `getTotalUnreadCount`,
`getUnreadCountByNoDisturbLevel`, `getFirstUnreadMessage`,
`getUnreadMentionedMessages`, `getTags`, `deleteTags`, `saveDraft`,
`clearDraft`, `saveEditedMessageDraft`, `clearEditedMessageDraft`,
`setAttributes`, `removeAttributes`, `sendTypingStatus` (direct channels),
`syncReadStatus` (Android only).

Channels are identified by `{ channelType, channelId, subChannelId? }`
(`subChannelId` for community sub-channels).

## Messages — `client.messages`

```ts
const sent = await client.messages.send(channel, { type: 'text', text: 'Hi' }, {
  needReceipt: true,
  pushConfig: { pushContent: 'New message' },
  onAttached: (local) => showPending(local),     // stored locally, clientId assigned
});
await client.messages.sendMedia(channel, { type: 'image', localPath }, {
  onProgress: (percent) => setProgress(percent),
});
```

- Content types: `text`, `image`, `file`, `voice`, `gif`, `video`,
  `location`, `reference` (reply/quote), `combine` (forward), `custom`.
  Received-only: `stream`, `recallNotification`, `unknown` (preserves the
  native type and raw fields).
- `clientId` (local) and `messageId` (server) are separate; a message is
  addressed by either (`MessageRef`). Failed sends reject with the native code
  and the failed message in `error.detail`.
- iOS requires `thumbnailPath` (a local image) for `video`; `location`
  uses `thumbnailPath` when given.
- Also: `cancelSendMedia`, `insert`, `update` (edit), `deleteForMe`,
  `deleteForAll` (recall), `deleteForMeByTimestamp`, `deleteLocal`,
  `getAroundTime`, `getById`, history and search queries
  (`createMessagesQuery`, `createLocalMessagesByTimeQuery`,
  `createSearchMessagesQuery`, `createSearchMessagesByUserQuery`,
  `createSearchMessagesByTimeRangeQuery`), read receipts
  (`sendReadReceiptResponse`, `getReadReceiptInfo`,
  `getReadReceiptInfoByIdentifiers`, `getReadReceiptByUsers`,
  `createReadReceiptUsersQuery`), metadata (`setMetadata`, `deleteMetadata`),
  `setReceivedStatus`, speech to text, stream messages, media download
  (`downloadMedia`, `pauseDownloadMedia`, `cancelDownloadMedia`,
  `getMediaDownloadInfo`, `downloadMediaUrl`, `cancelDownloadMediaUrl`; on
  Android the URL download is implemented by the bridge, and `downloadMedia`
  of an image falls back to it when the SDK reports nothing for 20 s),
  `refreshReferenceMessages`.

### Custom messages

```ts
await client.registerCustomMessages([
  { messageType: 'app:poll', persistentFlag: MessagePersistent.counted, searchableFields: ['question'] },
]);
await client.messages.send(channel, { type: 'custom', messageType: 'app:poll', fields: { question: 'Lunch?' } });
```

The SDKs register custom messages by native class. The bridge ships 16 plain
and 16 media generic slot classes per platform and binds each registered type
to a slot; fields travel as JSON. Keep field names consistent across platforms.

## Groups, open and community channels

- `client.groups`: `create`, `getGroupsInfo`, `getJoinedGroups`,
  `updateInfo`, `join`, `leave`, `dismiss`, `transferOwner`, `inviteUsers`,
  `kickMembers`, `addAdmins`, `removeAdmins`, `addManagers`/`removeManagers`
  (Android only), `acceptInvite`, `refuseInvite`, `acceptApplication`,
  `refuseApplication`, `getMembers`, `setMemberInfo`, favorites, and queries
  for applications, joined groups by role, search, members by role.
- `client.openChannels`: `enter` (iOS resolves with the enter response; Android
  delivers it via `openChannelEntered`), `exit`, metadata get/set/delete,
  `createMessagesQuery`.
- `client.community`: `getSubChannels`, `getUnreadCount`,
  `getChannelsUnreadInfo`, totals, `checkRemoteMessages`.

## Users, translation, tags, notifications

- `client.users`: presence subscriptions and query, online status, block list,
  profiles and visibility, friends (add/remove/accept/refuse/info/check/search,
  applications query, add permission).
- `client.translation`: translate messages/texts (results arrive as
  `translationCompleted`), language, auto-translate, per-channel strategy.
- `client.tags`: create, list, get, delete, rename, add/remove channels, unread
  count, clear, tagged/untagged channel queries.
- `client.notifications`: do-not-disturb schedule, push-content visibility
  (Android), APNs token (`setDeviceToken(hex)` on iOS; or call
  `NexconnBridge.registerDeviceToken(deviceToken)` from the AppDelegate).

## Paged queries

```ts
const query = client.messages.createMessagesQuery({ channel, pageSize: 30 });
const page = await query.loadNextPage();   // { items, hasMore?, totalCount? }
await query.release();                      // free the native query
```

Concurrent `loadNextPage` calls share one request. At most 64 native queries
can be live; queries end with the session.

## Events

`client.on(name, listener)` returns an idempotent unsubscribe. 62 native
handler callbacks map to typed events (see `NexconnEventMap` and
docs/PARITY.md), e.g. `connectionStatusChanged`, `messageReceived`,
`offlineMessageSyncCompleted`, `messagesUpdated`, `messagesDeleted`,
`readReceiptResponse`, `typingStatusChanged`, `channelPinnedSync`,
`groupOperation`, `openChannelEntered`, `translationCompleted`,
`subscriptionChanged`, `friendAdded`. Native events this JS version does not
model arrive as `unknownNativeEvent` rather than being dropped.

## React

```tsx
<NexconnProvider client={getNexconnClient()}>
  <App />
</NexconnProvider>
```

`useConnection`, `useNexconnEvent`, `useChannelList`, `useMessages`
(history + live updates + `send`), `useTotalUnreadCount`, `useTypingUsers`.
Hooks reset their state when the user or session generation changes.

## Errors

All failures are `NexconnError` with `category` (`not_linked`,
`not_initialized`, `already_initialized`, `invalid_argument`, `unsupported`,
`busy`, `canceled`, `not_found`, `limit_exceeded`, `stale_session`, `native`,
`internal`), `nativeCode` (vendor status code) and `method`.

## Capabilities

`await client.getCapabilities()` lists the bridge methods implemented on the
running platform; `client.supports('group.addManagers')` checks one.

## Testing your app

```ts
import { createMockClient, fixtures } from 'react-native-nexconn/testing';
const { client, transport } = createMockClient();
transport.on('engine.initialize', () => ({ alreadyInitialized: false, platform: 'android', sdkVersion: 'test' }));
transport.emit('MessageHandler.onMessageReceived', { message: fixtures.textMessage() });
```

## Push notifications

- Android (FCM): enable `android.fcm` in the Expo plugin, or for CLI apps add
  `implementation "ai.nexconn.chat:push-fcm:26.4.2"`, the
  `com.google.gms.google-services` plugin, `google-services.json` and
  `manifestPlaceholders = [FCM_PUSH_ENABLE: "true"]`. Upload FCM credentials in
  the Nexconn console. Notification taps fire `rong://<applicationId>/conversation`
  or `/conversationlist` intents; the Expo plugin adds matching intent filters
  so the app opens and can route with `Linking`.
- iOS (APNs): enable the Push Notifications capability (`ios.pushNotifications`
  in the Expo plugin adds the entitlement and background mode), upload a P12/P8
  to the console, and forward the device token as above.
- Physical-device verification is required; simulators/emulators are not
  sufficient evidence.
