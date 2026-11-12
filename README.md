# react-native-nexconn

Private development of a community React Native Chat SDK for Nexconn.
The goal is one typed library for Android/iOS consumers using either
React Native Community CLI or Expo development builds.

**Status: first native integration, not yet exercised against the service.**
The library links the official Nexconn Chat SDK `26.4.2` on Android and iOS and
exposes initialization, connection, connection status, direct text send and
receive, and disconnect. No message has been exchanged with real Nexconn
credentials yet; see docs/STATUS.md for exactly what has been built and run.
Conversations, history, groups, media, receipts and push are not implemented.
The package is private and is not ready for application use or publication.

## Usage

```ts
import { NexconnChat, NexconnError } from 'react-native-nexconn';

await NexconnChat.initialize({ appKey: 'your-app-key', areaCode: 'SG' });

// Subscribe before connecting so offline messages are not missed.
const subscription = NexconnChat.addMessageListener(({ message }) => {
  if (message.content.type === 'text') {
    console.log(message.senderUserId, message.content.text);
  }
});
NexconnChat.addConnectionStatusListener(({ status }) => console.log(status));

try {
  // The token comes from your authenticated backend. The App Secret never
  // belongs in the app.
  const { userId } = await NexconnChat.connect({ token, timeoutSeconds: 20 });
  await NexconnChat.sendDirectText({ targetUserId: 'bob', text: 'Hello' });
} catch (error) {
  if (error instanceof NexconnError) {
    console.warn(error.category, error.nativeCode, error.message);
  }
}

subscription.remove();
await NexconnChat.disconnect(); // { disablePush: true } to log out of push
```

The native engine is one per process. `initialize` may be repeated with the
same configuration but rejects a different App Key or area (`alreadyInitialized`).
One session exists at a time: call `disconnect()` before connecting another
user. Events from a previous session are never delivered to the next one.
Message content other than text arrives as `{ type: 'unsupported' }`.

### Android repository

The Nexconn Android SDK is hosted on Nexconn's Maven repository, which the
application has to declare.

- Expo: add `"plugins": ["react-native-nexconn"]` to the app config and
  prebuild. The plugin adds the repository.
- Community CLI: add to `android/build.gradle`:

  ```gradle
  allprojects {
      repositories {
          maven { url "https://maven.nexconn.ai/repository/maven-releases/" }
      }
  }
  ```

iOS needs no extra setup beyond `pod install`.

## Development

Use Node 24 and the Yarn version committed in .yarn/releases:

```sh
yarn install
yarn check
yarn example:expo start
yarn example:cli start
```

See docs/BUILD_PLAN.md for the complete plan, docs/CLOUD_SETUP.md for remote
setup, docs/API_EVIDENCE.md for the native API inventory, and docs/STATUS.md
for actual verification. For the generated development
workflow read CONTRIBUTING.md. There is no Expo dependency in the core library.

## Compatibility targets

| Consumer | Target | Current evidence |
| --- | --- | --- |
| Community CLI | RN 0.88.1 / React 19.3.0, Android and iOS | See docs/STATUS.md |
| Expo | SDK 58 development builds, Android and iOS | See docs/STATUS.md |
| Expo Go | Unsupported custom native SDK | Not a target |

This is an independent community project and is not endorsed by Nexconn or
RongCloud. Original-source licensing is pending; upstream rights remain intact.
