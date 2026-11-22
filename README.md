# React Native Nexconn

[![npm](https://img.shields.io/npm/v/@subramanyarao11/react-native-nexconn?label=npm)](https://www.npmjs.com/package/@subramanyarao11/react-native-nexconn)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![docs](https://img.shields.io/badge/docs-site-1565c0)](https://subramanyarao11.github.io/react-native-nexconn/)
![platforms](https://img.shields.io/badge/platforms-android%20%7C%20ios-lightgrey)

A community React Native SDK for [Nexconn](https://docs.nexconn.ai) Chat. It
bridges the official Nexconn native SDKs (Android `ai.nexconn.chat:chat`,
iOS `NexconnChat`, both 26.4.2) through one New Architecture TurboModule.
On top of that it gives you:

- a typed headless client covering the full native API surface (159 bridge
  methods, 18 paged queries, 67 events);
- React hooks for messages, channels, groups, friends, drafts, mentions,
  search, open channels and push taps;
- an Expo config plugin for development builds;
- a mock transport for testing your app without a device.

> **Beta, community project.** Not affiliated with or endorsed by Nexconn or
> RongCloud. Core messaging is verified live on Android emulators and iOS
> simulators. Push delivery on physical devices and several newer hooks are
> not verified yet. See [verification status](docs/reference/status.md).
> Expo Go is not supported.

**[Documentation →](https://subramanyarao11.github.io/react-native-nexconn/)** · [Project overview](docs/overview.md)

## Install

```sh
npm install @subramanyarao11/react-native-nexconn
cd ios && pod install            # Community CLI
```

For Expo (SDK 58 development builds), add the plugin and prebuild:

```json
{ "expo": { "plugins": ["@subramanyarao11/react-native-nexconn"] } }
```

```sh
npx expo prebuild && npx expo run:android   # or run:ios
```

Requirements: React Native 0.88 (New Architecture), React 19.3, Android API
24+, and a Nexconn App Key. The App Secret must stay on your backend; see
[`examples/token-server`](examples/token-server).

## Usage

```tsx
import { AreaCode, ChannelType, getNexconnClient } from '@subramanyarao11/react-native-nexconn';
import { NexconnProvider, useMessages } from '@subramanyarao11/react-native-nexconn/react';

const client = getNexconnClient();

await client.initialize({ appKey: 'YOUR_APP_KEY', areaCode: AreaCode.sg });
await client.connectWithTokenProvider({ tokenProvider: fetchTokenFromYourBackend });

function Chat({ peer }: { peer: string }) {
  const { messages, send, sendState, retry, readState } = useMessages({
    channelType: ChannelType.direct,
    channelId: peer,
  });
  // render messages; send({ type: 'text', text }) to send;
  // sendState(m).canRetry ? retry(m) : ...; readState(m).read for receipts
}

export default function App() {
  return (
    <NexconnProvider client={client}>
      <Chat peer="bob" />
    </NexconnProvider>
  );
}
```

The [quickstart](docs/guide/quickstart.md) goes from an empty app to a
working chat. The [demo app](examples/shared/DemoApp.tsx) shows
conversations, groups, contacts, media, receipts, mentions and search.

## Documentation

| Guide | Reference |
| --- | --- |
| [Quickstart](docs/guide/quickstart.md) | [Platform parity](docs/reference/parity.md) |
| [Client API](docs/guide/api.md) | [Compared with the Flutter SDK](docs/reference/flutter.md) |
| [React hooks](docs/guide/react.md) | [Bridge protocol](docs/reference/bridge-protocol.md) |
| [Push notifications](docs/guide/push.md) | [Verification status](docs/reference/status.md) |
| [Troubleshooting](docs/guide/troubleshooting.md) | [Changelog](CHANGELOG.md) |

## Development

```sh
yarn install
yarn check            # unit tests, hook tests, typecheck, lint, build
yarn docs:dev         # documentation site
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately
([SECURITY.md](SECURITY.md)).

## Known limitations

- Location messages fail inside the vendor SDK on both platforms (native
  code 31610). This needs a fix from Nexconn.
- A few APIs exist on one platform only (for example group managers on
  Android). They reject with `unsupported` on the other; see the
  [parity matrix](docs/reference/parity.md).
- Push needs your own FCM project and APNs key, and physical devices to test.

## License

[MIT](LICENSE) for this library's code. The Nexconn native SDKs are fetched
by your app's Gradle and CocoaPods builds. They are not part of this package
and remain under Nexconn's terms ([third-party notices](THIRD_PARTY_NOTICES.md)).
"Nexconn" is a trademark of its owner and is used here only to describe
compatibility.
