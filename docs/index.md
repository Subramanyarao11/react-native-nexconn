---
layout: home

hero:
  name: React Native Nexconn
  text: Nexconn Chat for React Native
  tagline: A typed client, React hooks and an Expo config plugin over the official Nexconn native SDKs. Works with Community CLI apps and Expo development builds.
  image:
    src: /logo.svg
    alt: React Native Nexconn
  actions:
    - theme: brand
      text: Get started
      link: /guide/quickstart
    - theme: alt
      text: Project overview
      link: /overview
    - theme: alt
      text: GitHub
      link: https://github.com/Subramanyarao11/react-native-nexconn

features:
  - title: The full native surface
    details: 159 bridge methods, 18 paged queries and 67 SDK events over Nexconn's Android and iOS SDKs 26.4.2. Platform gaps are reported as typed `unsupported` errors, never as fake success.
  - title: Hooks that stay correct
    details: Messages, channels, groups, friends, drafts, mentions, search and open channels. Each resets on an account switch, survives network drops, and cleans up on unmount.
  - title: Honest send state
    details: Upload progress, cancel, and a retry that's only offered once the SDK says a send failed, so a resend can't duplicate a message. Read state uses real receipt counts.
  - title: CLI and Expo
    details: One TurboModule on the New Architecture. The Expo config plugin wires the Maven repository, FCM, notification intents and APNs. Expo Go isn't supported.
  - title: Push routing
    details: Permission, tokens and notification-tap routing on both platforms, including the tap that cold-starts the app.
  - title: Testable
    details: A mock transport and fixtures in `/testing`, and hooks tested with React Native Testing Library. No device needed for app unit tests.
---

::: warning Beta
This is a community project, not affiliated with or endorsed by Nexconn.
Core messaging is verified live on Android emulators and iOS simulators.
Push delivery on physical devices and some newer hooks are not verified yet;
see [Verification status](/reference/status).
:::

```sh
npm install @subramanyarao11/react-native-nexconn
```

```tsx
import { ChannelType, getNexconnClient } from '@subramanyarao11/react-native-nexconn';
import { NexconnProvider, useMessages } from '@subramanyarao11/react-native-nexconn/react';

function Chat() {
  const { messages, send, sendState, retry } = useMessages({
    channelType: ChannelType.direct,
    channelId: 'bob',
  });
  // ...
}

export default () => (
  <NexconnProvider client={getNexconnClient()}>
    <Chat />
  </NexconnProvider>
);
```
