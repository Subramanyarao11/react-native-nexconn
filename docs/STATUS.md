# Implementation status

Last updated 18 November 2026.

## Summary

The SDK is **implemented at source level for the full public surface of the
pinned Nexconn native SDKs** (Android `ai.nexconn.chat:chat:26.4.2`, iOS
`NexconnChat/Chat 26.4.2`): 151 bridge methods, 18 paged query kinds and 62
SDK event types, with 8 documented platform-only gaps (docs/PARITY.md).

It has **not** been compiled natively, run on a simulator/device, or exercised
against the Nexconn service. Per the current workflow, native and live
verification run on cloud VMs (docs/CLOUD_TEST_RUNBOOK.md). Nothing below
claims messaging works; it records what the code does and what was checked.

## Route decision

Direct bridge over the official Nexconn native SDKs (no RongCloud wrapper).
Both SDKs expose the same high-level `NCEngine`/channel/handler API, enum raw
values match across platforms, and the official artifacts are publicly
installable (Maven + CocoaPods trunk), so a single TurboModule with a shared
JSON protocol was chosen (docs/BRIDGE_PROTOCOL.md).

## Completed (source)

- Public TypeScript API: lifecycle, channels, messages (all content types,
  media with progress/cancel, edit, recall, receipts, metadata, speech to
  text, streams, references, combine, insert), groups, open channels,
  community channels, users/friends/presence/block list, translation, tags,
  do-not-disturb/push settings, capabilities, custom messages, typed events,
  paged queries, structured errors.
- React entry point: provider and hooks (`useConnection`, `useNexconnEvent`,
  `useChannelList`, `useMessages`, `useTotalUnreadCount`, `useTypingUsers`),
  with per-session reset and local-echo de-duplication.
- Testing entry point: `MockTransport`, `createMockClient`, fixtures.
- Android Kotlin bridge (`android/src/main/java/com/nexconn/bridge`):
  dispatcher, reflection serializer, event forwarder for all handler
  callbacks, custom message slots, query registry, message cache, consumer
  ProGuard rules, Nexconn Maven repository wiring.
- iOS Swift bridge (`ios/*.swift`) + ObjC++ TurboModule shell, ObjC-runtime
  serializer, event forwarder, custom message slots, APNs token entry point;
  podspec depends on `NexconnChat/Chat`.
- Lifecycle safety: handlers registered at initialize (before connect),
  idempotent initialize across JS reloads, de-duplicated connect, `busy` for
  concurrent native connects, session generation filtering, query/message
  handles cleared per session, emitter detached on module invalidation.
- Expo config plugin (Maven repo, optional FCM wiring, notification-tap
  intent filters, optional APNs entitlement/background mode, SDK version pin),
  idempotent edits.
- Example apps (CLI and Expo) share `examples/shared/DemoApp.tsx`: sign-in via
  token server, conversation list, chat (text, file/image by path, typing,
  receipts, recall), group creation, developer playground with redacted event
  log. Example token server binds tokens to the authenticated user.
- Docs: API guide, parity matrix (generated), bridge protocol, cloud runbook,
  third-party notices. Committed `yarn.lock`.
- Cloud scripts (`scripts/cloud/*.sh`) and a manual native-build workflow.

## Verified on the dev Mac (JavaScript only)

| Check | Result |
| --- | --- |
| `yarn install --immutable` (Yarn 4.18.1, Node 24.22.2) | pass |
| `yarn test` — 49 tests (normalization, client lifecycle, stores, plugin, wire-protocol contract that parses the Kotlin and Swift sources) | pass |
| `yarn typecheck` (library, examples, shared demo) | pass |
| `yarn lint` | 0 errors, 6 `no-void` warnings |
| `yarn build` (Bob module + typings, `.ts` imports rewritten) | pass |
| Codegen schema parse + Android/iOS spec generation | pass; generated signatures match the Kotlin/ObjC++ overrides |
| `yarn pack --dry-run` | sources, lib, plugin, native sources only; no vendor binaries |
| Config-plugin helper idempotency | pass |
| API inventory from pinned artifacts (javap of the AAR, iOS `.swiftinterface`, enum raw values) | done (scratch only; not committed) |

## Pending verification (cloud VMs / devices)

- First native compile of the Kotlin bridge (CLI + Expo, debug + release/R8).
- First native compile of the Swift bridge and `Nexconn-Swift.h` import (CLI + Expo).
- Expo prebuild with the plugin on both platforms, repeated-prebuild stability.
- Packed-tarball installs into fresh CLI and Expo consumers.
- All live scenarios L1–L16 in docs/CLOUD_TEST_RUNBOOK.md, including
  cross-platform and official-client interop, offline sync, account switch,
  JS reload, custom messages and physical-device push.
- Token server against the real Server API (`/v4/auth/access-token/issue`).
- Android 16 KB page-size alignment of vendor `.so` files.

## Known limits and assumptions

- `ErrorHandler`/`OperationHandler` success is assumed to be `error == null`
  or `error.code == 0`.
- Android delivers the open-channel enter response only via the
  `openChannelEntered` event; iOS also resolves `enter()` with it.
- `refreshReferenceMessages` resolves when the remote result arrives; if the
  SDK never calls the remote handler the promise stays pending.
- Group `setMemberInfo` on Android requires a nickname; the bridge passes `""`
  when none is given, which may clear an existing nickname.
- Media `localPath` is passed through; the SDKs' accepted path/URI forms must
  be confirmed on devices (`file://` is stripped on iOS).
- Hooks are covered through their pure stores; React Native Testing Library
  is not installed, so rendered hook tests are not included.
- Licensing, SDK redistribution terms and publication remain unresolved; the
  package stays private.
