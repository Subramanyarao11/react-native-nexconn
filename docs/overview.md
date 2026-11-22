# Project overview

**React Native Nexconn** is a community React Native SDK for
[Nexconn Chat](https://docs.nexconn.ai). It lets a React Native app use
Nexconn's messaging, groups, open channels, friends, presence and push from
TypeScript. It bridges Nexconn's official Android and iOS SDKs, covers
their full public surface, and adds React hooks that handle the parts of a
chat UI that are easy to get wrong.

It's MIT licensed and published as `@subramanyarao11/react-native-nexconn`
(`0.1.0-beta.0`). It isn't affiliated with or endorsed by Nexconn.

## The problem

Nexconn ships native SDKs for Android, iOS, the Web and Flutter, but nothing
for React Native. A React Native team today has to write and maintain two
native bridges themselves. Each one has the same traps:
- delivering SDK callbacks on the right thread;
- keeping one user's late callbacks out of the next user's session;
- matching local echoes to server acknowledgements without duplicates;
- surviving JS reloads without double-registering handlers;
- smoothing over the places where the two SDKs behave differently.

## What we built

| Layer | What you get |
| --- | --- |
| **Headless client** | Typed TypeScript API over **159 bridge methods, 18 paged query kinds and 67 events**: lifecycle, direct, group, open and community channels, all message types (text, media with progress and cancel, references, combine, streams, custom), edit, recall, receipts, metadata, translation, tags, users, friends, presence, block list, do-not-disturb and push. Structured `NexconnError`s keep the native code |
| **React hooks** | `useMessages` (history, live updates, send state, retry, cancel, reply, read state), `useChannelList`, `useDraft`, `useUnreadMentions`, `useMessageSearch`, `useGroup`, `useGroupMembers`, `useJoinedGroups`, `useUsers`, `useOnlineStatus`, `useFriends`, `useBlockedUsers`, `useOpenChannel`, `useCommunitySubChannels`, `useNotificationOpened` and more |
| **Push** | Permission, tokens, and notification-tap routing on both platforms, including the tap that cold-starts the app |
| **Expo config plugin** | Maven repository, optional FCM wiring, notification-tap intents, APNs entitlement, SDK version pin. Idempotent across `prebuild` runs |
| **Testing** | `react-native-nexconn/testing`: a mock transport and fixtures, so apps can unit-test chat screens without a device |
| **Examples** | A Community CLI app and an Expo app sharing one demo: conversations, chat with media, receipts, replies, mentions, drafts and search, a group member panel, a contacts tab, and a developer playground. Plus a token server that keeps the App Secret off the device |

## Architecture

```text
 React components
   │  hooks (src/react): session-scoped stores, outbox, receipts, profile cache
   ▼
 NexconnClient (src/core): typed modules, normalisation, errors, paged queries
   │  one JSON protocol: invoke(method, argsJson) + onNativeEvent(envelope)
   ▼
 TurboModule "Nexconn" (Codegen, New Architecture)
   ├─ Android: Kotlin bridge ──► ai.nexconn.chat:chat 26.4.2 (Maven)
   └─ iOS:     Swift bridge  ──► NexconnChat/Chat 26.4.2 (CocoaPods)
```

- **One small native interface.** The TurboModule exposes three members,
  and every SDK call goes through `invoke`. Both bridges serialize SDK
  objects generically (reflection on Android, the Objective-C runtime on
  iOS), so adding an API doesn't mean a new Codegen signature.
- **Session generations.** Every connect and disconnect bumps a generation
  number carried by every event. Late callbacks from a previous user are
  dropped before they reach JS, and paged queries from an old session reject
  with `stale_session`.
- **Handlers registered once, at initialize.** Offline messages that arrive
  during connect aren't missed. A JS reload re-attaches to the existing
  handlers instead of adding duplicates.
- **Contract tests across languages.** A test parses the Kotlin and Swift
  sources and fails if a method or event exists on only one side, or if a
  fix lands on one platform only.

The full wire format is in [Bridge protocol](/reference/bridge-protocol).

## Decisions worth highlighting

- **No fake success.** If a platform's SDK has no equivalent for an API, the
  call rejects with `unsupported`. It never returns empty data. A
  [parity matrix](/reference/parity), generated from the sources, lists every
  method per platform.
- **Retry that can't duplicate.** `useMessages` shows a failed message with
  its error and upload progress. Retry is offered only once the SDK's own
  stored copy says the send failed or was canceled. An "uncertain" rejection
  (still `sending` in the SDK) gets no retry button, because resending it
  could create a second copy on the server.
- **Read state from real receipts.** Live testing found that the Android SDK
  reports read receipts but keeps the stored message at "Sent". The hook
  keeps the SDK's receipt counts and shows Read (or "read 2/5" in groups)
  from them, never assuming a read.
- **Data survives network drops.** Hooks reset on an account switch but keep
  their data through a dropped connection, then revalidate after
  reconnecting. Missed messages, edits and deletions are reconciled into
  the list.
- **Push listener installed at process start (Android).** The SDK has a
  single global push listener, and taps can arrive before JS exists. The
  bridge installs a forwarding listener from a `ContentProvider`, stores a
  cold-start tap until JS asks for it, and passes every callback on to the
  SDK's own handler.
- **Measured performance.** A benchmark against the mock transport found the
  message list re-sorting on every incoming message. A persistent index and
  an in-order append path made live appends **about 80 times faster**
  (379 µs → 4.5 µs per message in a 2,000-message list, in Node on an M-series
  Mac).

## How it was verified

Evidence is recorded per revision in [Verification status](/reference/status)
and the cloud session records in the repository.

**Automated (CI on every pull request):**
- 81 unit and wire-protocol contract tests and 20 rendered hook tests
  (React Native Testing Library 14).
- Typecheck, lint, the library build, the benchmark's correctness checks,
  and the docs build.

**Builds and packaging (cloud VMs):**
- Codegen spec generation for both platforms.
- Clean installs of the packed tarball into fresh Community CLI and Expo
  apps, outside the workspace.
- Android Community CLI and Expo builds, Debug and Release with R8 (keep
  rules checked).
- 16 KB ELF page alignment on all packaged native libraries.
- iOS CLI and Expo builds, Debug and Release, with Xcode 26.6.

**Live, two users, against the real Nexconn service** (Android emulators and
iOS simulators), including Android ↔ iOS pairs:

| Area | Result |
| --- | --- |
| Connect, capabilities, direct text, typing | Pass |
| Read receipts, both directions, live without refresh | Pass (Android needed the receipt-count fix above) |
| Images and files, with byte-identical downloads (SHA-1 compared) | Pass |
| Edit and recall, live on the recipient, including after an account switch | Pass |
| Offline delivery: each message once, in order, then sync completion | Pass |
| Account switch and JS reload without cross-user data | Pass |
| Kicked by another login | Pass |
| Groups and custom message types | Pass |
| Release builds: sign-in, text, image, cold relaunch | Pass |
| Push permission and token on both platforms; warm and cold notification-tap routing on the iOS simulator | Pass |

## Not verified yet

We list these rather than hide them:
- **Push delivery on physical devices.** This needs an FCM project, an APNs
  key and signed device builds. Emulator and simulator results don't count
  as delivery evidence.
- **Newest work, unit-tested only.** The newest hooks (groups, friends,
  search, drafts, mentions, open channels) and the send-state and retry flow
  are covered by rendered tests against the mock transport, not on devices.
  The latest iOS fix (keeping a member's nickname on an extra-only update)
  hasn't been compiled or run yet.
- **Interop with an official Nexconn client.** Blocked: the public web demo
  can't join a test app.
- **Location messages.** These fail inside the vendor SDK on both platforms
  (native code 31610) because of an encoder defect we can't work around
  through the public API.

## Try it

```sh
npm install @subramanyarao11/react-native-nexconn
```

The [Quickstart](/guide/quickstart) goes from an empty Community CLI or
Expo app to a working chat, including the token server. To run the full
demo, clone the repository and run `yarn example:cli android` or
`yarn example:expo ios`.

## Compared with the Flutter SDK

Nexconn's Flutter SDK wraps RongCloud's IM wrapper plugin. This package
bridges the Nexconn 26.4.2 native SDKs directly. Every Flutter handler
callback maps to an event here, and nearly all Flutter methods have a
counterpart. This package adds push routing, React hooks and a mock
transport. See [Compared with Flutter](/reference/flutter).

## What's next

1. Verify push delivery and the newest hooks on physical devices.
2. Test interop with an official Nexconn client.
3. Report the location-message defect upstream.
4. Move to `1.0` once the verification matrix passes on devices.

## How it was built

The library was designed and built by Subramanya, with AI coding agents:
Claude Code for implementation, and Devin for native builds and two-user
testing on cloud Ubuntu and macOS VMs. Every result above comes from those
recorded runs, not from code review alone.
