# Troubleshooting

Errors are `NexconnError`s. Check `category` first, then `nativeCode` (the
Nexconn SDK's status code) and `method` (the bridge call that failed).

```ts
import { isNexconnError } from '@subramanyarao11/react-native-nexconn';
try { /* ... */ } catch (e) {
  if (isNexconnError(e)) console.warn(e.category, e.nativeCode, e.method);
}
```

## Setup and builds

| Symptom | Cause and fix |
| --- | --- |
| `not_linked`: "The Nexconn native module is not linked" | The running binary doesn't contain the native module. Rebuild the app after installing (`run-android`/`run-ios`, or `expo prebuild` then `expo run:*`). Expo Go is not supported |
| Android: `Could not find ai.nexconn.chat:chat` | Gradle can't reach `https://maven.nexconn.ai/repository/maven-releases/`. Check network access. If you set `ext.nexconnSkipRepository = true`, declare that repository yourself |
| Android: "Build was configured to prefer settings repositories" | Your build forbids project repositories. Set `ext.nexconnSkipRepository = true` and add the Nexconn repository in `settings.gradle` |
| iOS: `pod install` can't find `NexconnChat` | Run `pod repo update`, or check access to `cdn.cocoapods.org` and `downloads.nexconn.ai` |
| Android release (R8) build crashes or messages decode as `unknown` | The library's `consumer-rules.pro` keeps the SDK classes and message annotations. Make sure your build doesn't drop consumer rules, then rebuild without the Gradle cache |
| Expo: plugin changes don't apply | Run `npx expo prebuild` again. Config plugins only run at prebuild |

## Connecting

| Symptom | Cause and fix |
| --- | --- |
| `not_initialized` | Call `client.initialize({ appKey, areaCode })` before anything else |
| `already_initialized` | `initialize` was called again with a different App Key. The native SDK is a process-wide singleton, so restart the app to switch apps. The same key again is a no-op |
| `busy` from `connect` | A native connect is still in progress. Concurrent `connect` calls from JS are de-duplicated, so this means another code path called the native SDK directly |
| `native`, `nativeCode` 31004 (token incorrect) | The token is invalid, expired, or for another App Key or data center. `connectWithTokenProvider` fetches a new token once automatically. If it still fails, check that the token server and app use the same App Key and `areaCode` |
| Status `kickedOfflineByOtherClient` (3) | The same user connected on another device. Ask the user before reconnecting |
| `stale_session` | A query or result from before a connect, disconnect or account switch was used. Create a new query. Hooks handle this for you |
| `limit_exceeded` from a query | More than 64 native paged queries are alive. Call `query.release()` when you're done; hooks release theirs on unmount |

## Messages

| Symptom | Cause and fix |
| --- | --- |
| The sender's bubble stays on Sent after the peer read it (Android) | The Android SDK reports the receipt but keeps the stored message's `sentStatus` at Sent. Render `useMessages().readState(message)`, which uses the receipt counts |
| A send failed and there's no retry | `sendState(m).canRetry` is true only once the SDK's stored copy says failed or canceled. Until then the outcome is uncertain, and resending could duplicate the message. `refresh()` re-reads the SDK copy |
| Location messages fail with `nativeCode` 31610 (`JsonParserFailed`) | A known defect in the vendor SDK on both platforms (its encoder writes an invalid location type). There's no workaround through the public API; it needs a Nexconn fix |
| Media send: "file not found" or nothing uploads | Pass an absolute path or a `file://` URI as `localPath`. On Android, `content://` URIs (document picker) are copied into the app cache before upload. iOS video and location messages also need `thumbnailPath` |
| Duplicate messages after reconnecting | Shouldn't happen with the hooks, which de-duplicate by `clientId` and `messageId`. If you keep your own list, merge on both ids |
| `refreshReferenceMessages` returns `timedOut: true` | The SDK sometimes doesn't call back for remote references. The bridge resolves with the local results after `timeoutMs` (default 15 s); show the quoted message as unknown |

## Open channels

| Symptom | Cause and fix |
| --- | --- |
| `openChannels.enter()` rejects with `nativeCode` 23410 (`ChatroomNotExist`) | The room doesn't exist. Open-channel rooms are created in the Nexconn console or through the server API; the client SDK can't create them |
| `openChannels.enter()` resolves `undefined` on Android | The enter response didn't arrive within `responseTimeoutMs` (default 10 s). The Android SDK delivers it through `openChannelEntered`; `useOpenChannel` handles both platforms |

## Push

Push needs real credentials (FCM `google-services.json` and APNs keys
uploaded to the Nexconn console) and physical devices. Emulator results don't
count as delivery evidence. See [PUSH.md](push.md).

## Getting more detail

- `await client.getCapabilities()` lists the bridge methods on the running
  platform. `client.supports(method)` checks one.
- `client.listenerCount()` should return to its earlier value after a screen
  unmounts. If it keeps growing, something isn't unsubscribing.
- The demo's **Playground** tab logs SDK events with ids only, never message
  bodies or tokens.
- Native logs: `adb logcat | grep -i -E "nexconn|rong"` on Android, the Xcode
  console on iOS.
