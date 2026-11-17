# Bridge protocol (v1.0.0)

One Codegen TurboModule (`src/NativeNexconn.ts`) carries the whole SDK surface:

```ts
getIntegrationStatus(): Promise<string>;
invoke(method: string, argsJson: string): Promise<string>;
readonly onNativeEvent: CodegenTypes.EventEmitter<string>;
```

## Invocation

- `method` is a dotted name (`engine.connect`, `message.send`, ...). The full
  list is generated into docs/PARITY.md; `engine.getCapabilities` returns the
  set implemented on the running platform.
- `argsJson` is a JSON object. Absent keys mean "SDK default".
- Success resolves with `{"v": <result>}` (so `null`/primitives are explicit).
- Failure rejects with code `NEXCONN_ERROR` and a JSON message:
  `{"category":"native","code":31004,"message":"...","method":"engine.connect","detail":...}`.
- Each call resolves or rejects exactly once.

## Values

- SDK objects are serialized generically (Android: public getters via
  reflection; iOS: Objective-C runtime properties). Every object carries
  `__type` (SDK class name; iOS may prefix `NC`). `src/core/normalize.ts`
  reconciles the few platform naming differences.
- Enums are raw integers. Values were read from both pinned artifacts and match
  (Android `OpenChannelParticipantBanType` has no raw value; the bridge maps it
  to the iOS values). See `src/core/enums.ts`.
- Timestamps are milliseconds; `clientId` (local) and `messageId` (server) stay
  separate. Images/binary data are never serialized.

## Events

Envelope: `{"type","generation","opId?","payload"}`.

- `type` is `<Handler>.<callback>` for SDK handler callbacks (62 types, shared
  verbatim by both platforms), `Engine.onDatabaseOpened`, or `op.attached`,
  `op.progress` for operations that passed an `opId`.
- `generation` increments on every connect and disconnect. The JS client
  ignores handler events whose generation is older than the current one
  (connection-status events are always delivered).
- Handlers are registered once per process at `engine.initialize` with the
  identifier `react-native-nexconn`; the module only attaches/detaches the
  JS emitter, so a JS reload does not duplicate handlers.

## Resource handles

- Paged queries: `query.create {kind, params}` -> `{queryId}`,
  `query.loadNextPage {queryId}` -> `{items, totalCount?, hasMore?}`,
  `query.release {queryId}`. Max 64 live; cleared on connect/disconnect.
- Messages are resolved by `{clientId}` or `{messageId}`: from a bounded LRU
  cache of messages the bridge has serialized (512), falling back to
  `getMessageById`.

## Threading

- Android: SDK callbacks run on `NCCallbackExecutors.WORKER`
  (`InitParams.callbackExecutor`); TurboModule calls arrive on the native
  modules thread.
- iOS: SDK callbacks run on a private serial queue (`InitParams.callbackQueue`);
  TurboModule calls arrive on the module's method queue.
- Serialization and event emission happen on those callback threads, never on
  the UI thread.
