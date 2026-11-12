# Native API evidence

Inventory of the official Nexconn Chat SDK APIs this wrapper calls, taken on
12 November 2026. Signatures were read from the published artifacts, not from
the quickstart. Where the documentation and the artifact disagreed, the
artifact was used and the difference is listed below.

## Pinned artifacts

| Platform | Coordinates | Version | Source | SHA-256 of inspected file |
| --- | --- | --- | --- | --- |
| Android | `ai.nexconn.chat:chat` | `26.4.2` (latest in `maven-metadata.xml`) | `https://maven.nexconn.ai/repository/maven-releases/` | `893d544f…0b225f43` (`chat-26.4.2.aar`) |
| iOS | `NexconnChat/Chat` | `26.4.2` (latest stable on CocoaPods trunk) | Podspec source `https://downloads.nexconn.ai/release/chat/ios/26.4.2/NexconnChatSDK_26.4.2.zip` | `f103a12f…dde268a5` |

- Android: `minSdkVersion 21`; POM depends on `kotlin-stdlib 2.2.21`,
  `androidx.core:core-ktx 1.9.0`, `androidx.appcompat 1.6.1`. Ships
  `libNexConnIMLib.so` for `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`, and
  consumer ProGuard rules. Its manifest adds `INTERNET`,
  `ACCESS_NETWORK_STATE` and `POST_NOTIFICATIONS`, and a push receiver.
  POM license: "Commercial License".
- iOS: platform `13.0`; vendors `NexconnChatSDK.xcframework`,
  `RongIMLibCore.xcframework` and `RSIMLib.xcframework` (device and simulator
  slices; `NexconnChatSDK` is a dynamic library) and sets `OTHER_LDFLAGS -ObjC`.
  The SDK is written in Swift and exposes an Objective-C interface through
  `NexconnChatSDK-Swift.h`, imported via `<NexconnChatSDK/NexconnChatSDK.h>`.
  Podspec license: "Proprietary". CocoaPods trunk also lists `0.100.x`
  versions newer by date; they are not used.
- The Swift Package repository tags `v26.4.2` as well. CocoaPods is used.
- 16 KB page-size alignment of the Android `.so` files has not been checked.

## API matrix

| Capability | Android (`ai.nexconn.chat.*`) | iOS (Objective-C names) |
| --- | --- | --- |
| Version | `NCEngine.getVersion()` | `+[NCEngine getVersion]` |
| Initialize | `NCEngine.initialize(params.InitParams(context, appKey))`, `areaCode: params.AreaCode` (`BJ, SG, NA, SA, OM`) | `+[NCEngine initializeWithParams:]`, `NCInitParams initWithAppKey:`, `areaCode: NCAreaCode` (`Bj=1, Sg=2, Na=3, Sa=5, Om=6`) |
| Connect | `NCEngine.connect(params.ConnectParams(token), handler.ConnectHandler)`; `onResult(String?, NCError?)`, optional `onDatabaseOpened(Boolean, NCError?)`; `timeout: Int` | `+[NCEngine connectWithParams:databaseOpenedHandler:completionHandler:]`; completion `(NSString *_Nullable, NCError *_Nullable)`; `timeout: int32_t` |
| Disconnect | `NCEngine.disconnect(disablePush: Boolean)` | `+[NCEngine disconnect:]` |
| Status | `NCEngine.getConnectionStatus(): model.ConnectionStatus`; `add/removeConnectionStatusHandler(id, handler.ConnectionStatusHandler)` | `+[NCEngine getConnectionStatus]`; `add…HandlerWithIdentifier:handler:` / `remove…HandlerForIdentifier:`; `NCConnectionStatusHandler` |
| Receive | `NCEngine.add/removeMessageHandler(id, handler.MessageHandler)`; `onMessageReceived(message.model.MessageReceivedEvent)` with `message`, `left: Int?`, `offline: Boolean?`, `hasPackage: Boolean?` | `+[NCEngine addMessageHandlerWithIdentifier:handler:]` / `removeMessageHandlerForIdentifier:`; `NCMessageHandler onMessageReceived:` with `message` (nullable), `left`, `offline`, `hasPackage` |
| Send text | `channel.DirectChannel(userId).sendMessage(params.SendMessageParams(message.TextMessage(text)), handler.SendMessageHandler)`; `onAttached(Message)`, `onResult(Message?, NCError?)` | `-[NCDirectChannel initWithChannelId:]` (nullable), `-[NCBaseChannel sendMessageWithParams:attachedHandler:completionHandler:]`; completion `(NCMessage *_Nullable, NCError *_Nullable)` |
| Errors | `error.NCError`: `code: Int`, `message` | `NCError : NSError`: `code`, `message` |

Connection status integers are identical on both platforms in the artifacts:
`-1` network unavailable, `0` connected, `1` connecting, `2` unconnected,
`3` kicked offline by other client, `4` token incorrect, `6` user blocked,
`12` signed out, `13` suspended, `14` timeout, `17` proxy unavailable,
`19` user abandon. The wrapper passes the integer to JavaScript and names it
there.

## Documentation differences and open points

- The iOS "monitor status" page lists different integers (for example
  connecting `10`, unconnected `11`). `NCConnectionStatus.h` in 26.4.2 uses the
  values above; the header was followed.
- The Android send page and quickstart disagree on whether `onResult` receives
  a nullable `Message`. The Kotlin compiler requires
  `onResult(message: Message?, error: NCError?)` for 26.4.2, as in the
  quickstart; the wrapper treats a missing message as a failure.
- Initialization: both quickstarts place `initialize` in
  `Application.onCreate` / `application:didFinishLaunchingWithOptions:`, once
  per process. The wrapper calls it later, on the main thread, when JavaScript
  calls `initialize()`, and refuses a second configuration in the same
  process. Whether late initialization affects push registration or cold-start
  offline delivery is **not verified**; it needs a device test.
- The docs say handlers are held weakly on iOS. The adapter is retained by the
  TurboModule for that reason.
- The iOS connect page says callbacks arrive on the configured callback queue
  (main by default) while the status page mentions an internal queue. The
  wrapper does not depend on the callback thread.
- Error codes mapped to wrapper categories come from the Android connect page
  (`31004`, `31020` token; `33001` not initialized; `34001` connection exists;
  `34006` timeout). Other codes are passed through as `native` with the code.
- Rate limit stated in the docs: 5 messages per second per client. The wrapper
  does not queue or throttle.

## Terms

The SDK artifacts are fetched by Gradle and CocoaPods at build time; nothing
from them is stored in this repository or in the package. The artifacts are
commercially licensed, and the Nexconn SDK agreement restricts modification
and standalone distribution. Whether publishing a wrapper that depends on them
is permitted has not been reviewed and must be before any public release.

Documentation read: `docs.nexconn.ai/chatsdk-android/{import,init,connection/connect,connection/disconnect,connection/monitor-status,event-handlers/overview,message/send,message/receive}`
and `docs.nexconn.ai/chatsdk-ios/{import,init,connection/connect,connection/monitor-status,message/send,event-delegation/overview}`.
