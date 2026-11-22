# Quickstart

From an empty app to a working one-to-one chat, for a Community CLI app or an
Expo development build. The package is private: install it from a packed
tarball, not from npm.

You need:
- A Nexconn App Key, and the App Secret kept on a backend.
- Node 24.
- For Android, JDK 17 and an emulator or device with Android 7 (API 24) or
  later.
- For iOS, a Mac with Xcode and CocoaPods.

## 1. Pack the library

In this repository:

```sh
yarn install
yarn build
yarn pack --out /tmp/react-native-nexconn.tgz
```

## 2. Run a token server

Clients never see the App Secret. They get user tokens from your backend,
which must authenticate the user first. For development, use the example
server:

```sh
export NEXCONN_APP_KEY=...        # from the Nexconn console
export NEXCONN_APP_SECRET=...     # server only, never in the app
export NEXCONN_API_BASE=https://api.sg-light-api.com   # your data center
export DEMO_USERS="alice:alicepass,bob:bobpass"
node examples/token-server/server.mjs   # listens on :8787
```

From an Android emulator the host is `http://10.0.2.2:8787`; from the iOS
simulator it is `http://localhost:8787`. See
[examples/token-server/README.md](../examples/token-server/README.md).

## 3a. Community CLI app (React Native 0.88, New Architecture)

```sh
npx @react-native-community/cli@20.2.0 init ChatApp --version 0.88.1
cd ChatApp
npm install /tmp/react-native-nexconn.tgz
cd ios && pod install && cd ..
```

Autolinking registers the TurboModule. The Android library adds Nexconn's
Maven repository automatically; see [API.md](API.md#install) to opt out or
pin SDK versions.

```sh
npx react-native run-android   # or run-ios
```

## 3b. Expo development build (SDK 58)

Expo Go can't load the native SDK, so use a development build.

```sh
npx create-expo-app@latest ChatApp
cd ChatApp
npm install /tmp/react-native-nexconn.tgz
```

Add the config plugin to `app.json`:

```json
{
  "expo": {
    "plugins": [
      ["react-native-nexconn", {
        "android": { "fcm": false, "notificationIntentFilters": true },
        "ios": { "pushNotifications": false }
      }]
    ]
  }
}
```

```sh
npx expo prebuild
npx expo run:android   # or run:ios
```

Re-running `prebuild` is safe: the plugin's edits are idempotent.

## 4. Connect and chat

Your login screen gets the app's own session for the user. The token
provider then trades it for a Nexconn token:

```tsx
import { useState } from 'react';
import { Button, FlatList, Text, TextInput, View } from 'react-native';
import { AreaCode, ChannelType, getNexconnClient } from 'react-native-nexconn';
import {
  NexconnProvider,
  useConnection,
  useMessages,
} from 'react-native-nexconn/react';

const client = getNexconnClient();
const TOKEN_SERVER = 'http://10.0.2.2:8787';

export async function signIn(userId: string, password: string) {
  const login = await fetch(`${TOKEN_SERVER}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, password }),
  });
  const { sessionToken } = await login.json();
  await client.initialize({ appKey: 'YOUR_APP_KEY', areaCode: AreaCode.sg });
  await client.connectWithTokenProvider({
    // Called again with a fresh token if the first one is rejected.
    tokenProvider: async () => {
      const res = await fetch(`${TOKEN_SERVER}/nexconn/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      return (await res.json()).accessToken;
    },
  });
}

function Chat({ peer }: { peer: string }) {
  const { messages, send, sendState, retry } = useMessages({
    channelType: ChannelType.direct,
    channelId: peer,
  });
  const [text, setText] = useState('');
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={messages}
        keyExtractor={(m) => String(m.clientId)}
        renderItem={({ item }) => {
          const state = sendState(item);
          return (
            <Text onPress={state.canRetry ? () => retry(item) : undefined}>
              {item.content.type === 'text' ? item.content.text : `[${item.content.type}]`}
              {state.status === 'failed' ? '  (failed, tap to retry)' : ''}
            </Text>
          );
        }}
      />
      <TextInput value={text} onChangeText={setText} />
      <Button
        title="Send"
        onPress={() => {
          send({ type: 'text', text }).catch(() => undefined);
          setText('');
        }}
      />
    </View>
  );
}

function Root() {
  const { userId } = useConnection();
  return userId ? <Chat peer="bob" /> : null; // show your sign-in screen here
}

export default function App() {
  return (
    <NexconnProvider client={client}>
      <Root />
    </NexconnProvider>
  );
}
```

Sign in as `alice` on one device and `bob` on another to exchange messages.
For a complete app (conversations, groups, contacts, media, receipts,
mentions and search), see `examples/shared/DemoApp.tsx`, which both example
apps use.

## Next steps

- [REACT.md](REACT.md): every hook and how it stays current.
- [API.md](API.md): the headless client, modules, events and errors.
- [Push notifications](API.md#push-notifications): FCM and APNs setup. Push
  needs physical devices to verify.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md): common build and runtime errors.
