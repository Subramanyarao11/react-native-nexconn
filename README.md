# react-native-nexconn

Private development of a community React Native Chat SDK for Nexconn, for
Android and iOS apps built with React Native Community CLI or Expo development
builds. It bridges the official Nexconn native SDKs (Android
`ai.nexconn.chat:chat`, iOS `NexconnChat`) through one TurboModule and exposes
a typed headless client, React hooks, an Expo config plugin and test doubles.

**Status: feature-complete at source level, not yet verified natively.**
151 bridge methods, 18 paged queries and 62 SDK events are implemented for
both platforms (docs/PARITY.md). Native compilation, device runs and live
messaging are pending on the cloud VMs (docs/STATUS.md,
docs/CLOUD_TEST_RUNBOOK.md). Do not use in production. Expo Go is not supported.

```ts
import { AreaCode, ChannelType, getNexconnClient } from 'react-native-nexconn';

const client = getNexconnClient();
await client.initialize({ appKey: 'YOUR_APP_KEY', areaCode: AreaCode.sg });
await client.connectWithTokenProvider({ tokenProvider: fetchTokenFromYourBackend });
client.on('messageReceived', ({ message }) => console.log(message.content));
await client.messages.send(
  { channelType: ChannelType.direct, channelId: 'bob' },
  { type: 'text', text: 'Hello' }
);
```

The App Secret belongs on your backend only (see `examples/token-server`).

## Documentation

- docs/API.md — installation (CLI and Expo), lifecycle, every module, hooks, push
- docs/PARITY.md — generated capability matrix per platform
- docs/BRIDGE_PROTOCOL.md — native wire protocol, threading, session rules
- docs/CLOUD_TEST_RUNBOOK.md — what to run on the cloud VMs and the live checklist
- docs/STATUS.md — verified results and open items
- docs/BUILD_PLAN.md — plan and decisions

## Development

Use Node 24 and the Yarn version committed in .yarn/releases:

```sh
yarn install
yarn check                # tests, typecheck, lint, build
yarn example:expo start
yarn example:cli start
node scripts/generate-parity.mjs   # refresh docs/PARITY.md after API changes
```

## Compatibility targets

| Consumer | Target | Current evidence |
| --- | --- | --- |
| Community CLI | RN 0.88.1 / React 19.3.0, Android and iOS | JS checks pass; native builds pending |
| Expo | SDK 58 development builds, Android and iOS | JS checks pass; prebuild and native builds pending |
| Expo Go | Unsupported (custom native SDK) | Not a target |

This is an independent community project and is not endorsed by Nexconn or
RongCloud. Original-source licensing is pending; upstream rights remain intact.
See THIRD_PARTY_NOTICES.md for the native SDK dependencies' terms.
