# Push notifications

Status: implemented at source level on 22 November 2026; **not yet built or
verified on a device**. Physical devices plus FCM/APNs credentials are needed
to verify delivery; simulators and emulators can only check permission, token
errors and tap routing from locally posted notifications.

## What the vendor SDKs do

| | Android (`ai.nexconn.chat:chat` + `push-fcm`) | iOS (`NexconnChat`) |
| --- | --- | --- |
| Token | RongPush gets the FCM token and `NCEngine` reports it automatically | App forwards the APNs token: `NCEngine.setDeviceTokenData` |
| Showing notifications | RongPush posts them (`PushMessageReceiver`) | iOS shows APNs alerts |
| Tap | RongPush opens the app (launch intent with `rong://<package>/conversation/<type>?targetId=…`) | App's `UNUserNotificationCenter` delegate |
| Listener | One global `RongPushClient` `PushEventListener`, wrapped by `NCEngine.initialize` | None |

## What the bridge adds

- **Android:** `NexconnPushInitProvider`, a `ContentProvider` merged from the
  library manifest, installs one forwarding `PushEventListener` at process
  start, before `Application.onCreate`. That way a tap that cold-starts the
  app is captured. The listener forwards every callback to the listener it
  replaced and keeps the SDK's default tap behaviour, which opens the app.
  It reports taps, arrivals, tokens, token errors and token report results.
- **iOS:** these static helpers are for the AppDelegate:
  - `NexconnBridge.registerDeviceToken(_:)`
  - `registerDeviceTokenFailed(_:)`
  - `installNotificationHandler()`: an opt-in `UNUserNotificationCenter`
    delegate that forwards to the previous delegate.
  - `handleNotificationResponse(_:)` and `handleNotificationWillPresent(_:)`,
    for apps that keep their own delegate.

  Only notifications carrying the Nexconn `rc` payload are reported.
- **JS:** `client.push`, the events below, and `useNotificationOpened`.
  - A tap is emitted live when JS is attached.
  - At cold start it is kept until JS reads it.
  - JS buffers a tap that arrives before any listener subscribes.
  - Each tap has a bridge-assigned `id`, so it is delivered once per client.
  - Push methods work before `initialize()`.

| JS | Android | iOS |
| --- | --- | --- |
| `requestPermission()` | Android 13+: `POST_NOTIFICATIONS` via `PermissionsAndroid`; older: system setting | Authorization + `registerForRemoteNotifications` |
| `getPermissionStatus()` | `granted` / `denied` | also `undetermined`, `provisional`, `ephemeral` |
| `getToken()` | Last RongPush token (e.g. FCM) | Last APNs token forwarded (hex) |
| `onNotificationOpened` / `notificationOpened` | RongPush tap | Delegate `didReceive` (Nexconn payloads only) |
| `notificationReceived` | After RongPush posts a notification | Foreground `willPresent` |
| `pushTokenReceived` / `pushTokenError` | RongPush callbacks | AppDelegate forwarding |
| `pushTokenReportResult` | Yes | — |
| `clearNotifications` / `clearNotification(id)` | RongPush | Delivered notifications |
| `getPushType()` | Yes | — (rejects `unsupported`) |

`PushNotification` fields:

- **Both platforms:** `channelType`, `channelId`, `senderId`, `pushId`,
  `objectName`, `title`, `body`, `pushData`, `notificationId` and `raw`.
- **Android only:** `senderName`, `extra` and `receivedTime`.
- **Not verified:** the iOS `rc` keys (`cType`, `tId`, `fId`, `oName`, `id`)
  follow the RongCloud APNs format and haven't been checked against a real
  Nexconn push.

## Android setup

1. Firebase project, then add `google-services.json` to `android/app`. Upload
   the FCM credentials in the Nexconn console.
2. Dependencies. The Expo plugin does this with
   `"android": { "fcm": true }`; for CLI apps add them by hand:

   ```gradle
   // android/build.gradle (buildscript dependencies)
   classpath("com.google.gms:google-services:4.4.2")
   // android/app/build.gradle
   implementation("ai.nexconn.chat:push-fcm:26.4.2")
   android { defaultConfig { manifestPlaceholders += [FCM_PUSH_ENABLE: "true"] } }
   apply plugin: "com.google.gms.google-services"
   ```
3. Call `client.push.requestPermission()` on Android 13+.
4. Initialize with `enablePush: true` (the default) and connect. The SDK
   reports the token itself.

If your app installs its own RongPush listener, install it before React
Native starts; the bridge forwards to it. To opt out of early install, remove
the provider:

```xml
<provider android:name="com.nexconn.bridge.NexconnPushInitProvider"
  android:authorities="${applicationId}.nexconn-push-init" tools:node="remove" />
```

## iOS setup

1. Enable the Push Notifications capability. In Expo, set
   `"ios": { "pushNotifications": true }`, which adds the entitlement and the
   `remote-notification` background mode. Upload a P8/P12 key in the Nexconn
   console.
2. AppDelegate (CLI apps; see `example-cli/ios/.../AppDelegate.swift`):

   ```swift
   import Nexconn

   func application(_ app: UIApplication, didFinishLaunchingWithOptions o: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
     NexconnBridge.installNotificationHandler()   // tap routing incl. cold start
     return true
   }
   func application(_ app: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
     NexconnBridge.registerDeviceToken(token)
   }
   func application(_ app: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
     NexconnBridge.registerDeviceTokenFailed(error)
   }
   ```
3. Call `client.push.requestPermission()`. It registers for remote
   notifications when granted.

**Expo apps using `expo-notifications`:** `expo-notifications` owns the
notification delegate, so don't call `installNotificationHandler`. Instead:

```ts
const { data: hex } = await Notifications.getDevicePushTokenAsync(); // iOS: APNs hex
await client.notifications.setDeviceToken(hex);
Notifications.addNotificationResponseReceivedListener((response) => {
  const { request } = response.notification;
  const n = client.push.parseNotification(request.content.data, {
    title: request.content.title ?? undefined,
    body: request.content.body ?? undefined,
    id: request.identifier,
  });
  if (n) openChat(n);
});
```

## Verification checklist (devices)

| # | Check | Pass when |
| --- | --- | --- |
| P1 | Permission | `requestPermission()` returns `granted`, and `denied` after denying in settings |
| P2 | Token | `pushTokenReceived` fires and `getToken()` has a token (Android: `pushType` `FCM`); Android `pushTokenReportResult` code 0 |
| P3 | Background delivery | App in background, peer sends: a notification shows sender/content |
| P4 | Tap, warm | Tapping opens the app and `onNotificationOpened` gets the right `channelType`/`channelId` once |
| P5 | Tap, cold | Kill the app, tap: the app starts and the demo opens that chat (initial notification) |
| P6 | User switch | Disconnect with `disablePush: true`, connect user B: user A's pushes stop |
| P7 | Clear | `clearNotifications()` removes posted notifications |
