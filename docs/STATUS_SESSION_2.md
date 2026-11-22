# Cloud session 2 — Android and iOS retests

## X3 retest at `ec16c9f` (November 22 UTC)

`ec16c9f` is `3c8c76c` ("show Read from SDK receipt counts") plus docs. The
change is JavaScript-only (`src/react`, `examples/shared/DemoApp.tsx`), so
both sides reused their unchanged `d2d667f` native apps with Metro serving
`ec16c9f`; each side confirmed the new receipt-state code was in the bundle.
Android ran the `d2d667f` CLI debug APK (SHA-256
`99fb00a91b10a28ebc9451bda11bee119f2070c4a8ec1cd83df6deea5aeff75d`).

| Case | Result |
| --- | --- |
| X3 — iOS read receipt to Android | **Pass.** Android Alice sent `EC16-X3-A2I-1401` once from the UI with `needReceipt=true`; it visibly showed Sent while Bob's chat was closed. iOS Bob received it natively at 07:38:09.856 UTC (generation 1, forwarded to JS) and opened the DM on cue between 07:39:05.612 and 07:39:11.409 UTC; the message (ID `D208-OEKC-OI04-2VDL`) appeared once, without Refresh. Android logged exactly one native `onMessageReceiptResponse gen=1 js=true` at 07:39:09.144 UTC and one matching JS `readReceiptResponse` at 07:39:09.214 (read 1, total 1, unread 0). The bubble changed from Sent to Read without Refresh, reconnecting or reopening. The clock-calibrated upper bound from native receipt to visible Read was 968 ms (898 ms from the JS event); this bound includes capture and clock uncertainty. After the live criterion was judged, closing and reopening the DM kept Read. |

The SDK's `getById` still returns `sentStatus=30` for the same message, so
Read comes from the receipt counts the hook now stores, not from the SDK's
sent status.

The run used Android Alice and iOS Bob only; Carol was unused. Afterwards,
Alice disconnected through the UI, the Android apps were stopped and
data-cleared, and no app process, ADB reverse mapping, Metro/token service
or collector remained. All accounts were released to iOS. Other PR rows,
standalone release builds, location and push were not repeated.

## Android follow-up at `d2d667f` (November 21–22 UTC)

| Case | Result |
| --- | --- |
| B1 — JavaScript | **Pass.** All 55 tests, typecheck, lint (0 errors, 6 warnings), library build, Android/iOS Codegen, and pack. |
| B2/B4 — CLI debug and Expo R8 | **Pass (build).** Rebuilt the x86_64 CLI debug APK at this revision (SHA-256 `99fb00a91b10a28ebc9451bda11bee119f2070c4a8ec1cd83df6deea5aeff75d`). Expo R8 preserved the six SDK class names and the runtime `@MessageTag(RC:TxtMsg)` annotation. The new Expo APK was not tested at runtime. |
| T11 — Android account switch | **Pass.** Recipient Alice disconnected and signed in as Bob in the same process, generations 1 → 2 → 3. Fresh baseline and post-switch messages each had one JS receive and one matching `messagesDeleted` (`content.type=text`). Bob's native delete callback logged `gen=3 js=true`; the bubble disappeared live without Refresh or reopening. |
| X4 — Android → Android original PNG | **Pass.** Real SDK upload and download with `original:true`: source and downloaded files were both 2,625 bytes and SHA-1 `f9d3171f15fc55680419ff648863a993b1d61248`. The SDK downloaded in 1,283 ms, reporting progress 0 → 100 without the fallback. The demo's default upload also downloaded, but the SDK converted the PNG to JPEG, so it is not a source-byte integrity check. |
| X3 — iOS read receipt to Android | **Fail (live UI); receipt delivery passes.** Bob's chat was closed before Android sent the saved text with `needReceipt=true`, and opened only on cue. Android logged native `onMessageReceiptResponse gen=1 js=true` at 06:49:33.837 UTC on November 22, then exactly one matching JS `readReceiptResponse` at 06:49:33.853. The SDK reported read count 1, total 1, unread 0, but the open bubble still showed Sent approximately 1.3 seconds later and at 06:50:27, without Refresh or reopening. The updated hook does not meet the one-second Sent → Read criterion. |
| X4 — iOS → Android original PNG | **Pass.** iOS sent the 128×96 PNG with the real SDK and `original:true`. Android's real `message.downloadMedia` resolved in 2,693 ms with progress 0 → 27 → 57 → 61 → 100. The file at the returned local path was a PNG, 27,326 bytes, SHA-1 `6c3855e59e98ff85f2468a38f68bf5846cc7de24`, matching iOS's SDK-local source exactly. The result had no `fallback` key (`false`); no watchdog or error occurred, so the new watchdog fallback itself was not exercised. |
| X6 — Edit from iOS | **Pass (Android recipient).** With the chat kept open, Android logged exactly one native `onMessagesUpdated gen=1 js=true` at 06:53:06.557 UTC on November 22, then exactly one matching JS `messagesUpdated` at 06:53:06.559. The saved ID stayed the same, `D2IOSX6AFTER1304 · edited` appeared once, and the original text disappeared without Refresh or reopening. The Mac separately verified the sender's immediate update. |

### X3 fix handoff (fixed in `3c8c76c`; see the `ec16c9f` retest above)

The post-receipt real SDK `getById` still returned `sentStatus=30` (Sent),
although the receipt reported `readCount=1`, `totalCount=1`, `unreadCount=0`.
The receipt's message ID and channel matched the outgoing message and open
DM. The demo renders only `message.sentStatus`, and the new hook merely
replaces the bubble with the SDK's stored copy, so that lookup cannot make
this message display Read.

Reconcile the genuine receipt counts into receipt-aware message state and
render Read from that state (or a bridge mapping backed by actual SDK read
state). Do not mark every outgoing message Read or treat a partial group
receipt as all-read. Retest from a visibly Sent message while the peer chat
is closed; after the peer opens it, the matching bubble must become Read
within one second without Refresh, reconnecting, or reopening. Keep the
existing native/JS event de-duplication and account/channel isolation.

The November 22 paired retry used Android Alice and iOS Bob only. After
these rows, Alice disconnected through the UI (Sign in, generation 2,
no user, not connected). Both Android CLI clients and the installed Expo
client were stopped and data-cleared; no test app process remained on
either emulator, and all ADB reverse mappings were removed. All three
accounts were released exclusively to iOS. Location and push were not
retested.

## iOS follow-up at `d2d667f` (November 21–22 UTC)

Built on Xcode 26.6 and tested on two iOS 26.5 simulators. The Ubuntu
docs-only follow-up did not change the code under test.

| Case | Result |
| --- | --- |
| B5 — CLI Debug | **Pass (build).** `LANG=en_US.UTF-8 bash scripts/cloud/verify-ios.sh cli`. |
| B7 — Expo Release | **Pass (build).** `LANG=en_US.UTF-8 bash scripts/cloud/verify-ios.sh expo-release` verified the embedded `main.jsbundle`. |
| X4 — iOS PNG sender | Sent the synthetic fixture via `messages.sendMedia` with `original:true` (ID `D208-2P85-TVM4-J5K0`). Android returned matching original bytes using the native SDK path, as recorded above. |
| X6 — iOS sender edit | **Pass.** With the chat open, Bob typed the replacement and long-pressed his own message. The sender saw `D2IOSX6AFTER1304 · edited` immediately, without Refresh or reopening. The SDK retained ID `D208-3154-S244-J5K0` and reported `hasChanged=true`. |
| T9 — Alice → Bob recall | **Pass.** Carol sent; the recipient process switched Alice → Bob (generation 3). Native order: re-initialize 06:58:20.948 → receive 06:58:40.534 → `onMessageDeleted js=yes` 06:58:46.503 UTC for `D208-6C5M-E9A4-2VDL`. One matching JS `messagesDeleted` (`content.type=text`); the bubble disappeared without Refresh or reopening. Fresh Alice baseline `D208-5UE8-SE04-J5K0` also passed. |
| T10 — Bob → Alice recall | **Pass.** Same recipient process at generation 7: re-initialize 07:02:08.401 → receive 07:02:34.347 → delete `js=yes` 07:02:46.853 UTC for `D208-858A-FAA4-J5K0`; one matching JS text deletion and live removal. |
| T12 — Bob regressions | **Pass.** One typing start and one expiry. A real JS reload kept Bob connected at generation 5, and three post-reload texts each arrived once. Three texts sent while Bob was disconnected arrived once, in order, at 07:17:21.521–.522 UTC (`D208-EOAC-0QE4-2VDL`, `D208-EOG6-0V84-2VDL`, `D208-EOMM-H4C4-2VDL`; `left` 2, 1, 0), followed by one sync completion. No native `-1` connect error. |
| R3 — Release sign-in | **Pass.** Standalone Expo Release, Metro off: HTTPS sign-in, SDK 26.4.2 capabilities, and real app settings. The first sign-in after a VM restart returned native `30024`; restarting the app recovered it. |
| R4 — Release text and image | **Pass.** Alice's `[image]` bubble appeared during upload, then showed `sent`, without Refresh. Bob received text `D208-97HR-MKK4-2VDL` (07:04:55.033 UTC) and image `D208-9D82-2E04-2VDL` (07:05:18.232 UTC) live in the open chat. The demo renders `[image]`; Release pixels and bytes were not checked. |
| R5 — Release cold relaunch | **Pass.** Relaunch started a new process at 07:14:34 UTC, showed Sign in, and reconnected Alice at generation 1. |
| X10 — Location | **Known vendor limitation, not retested.** Earlier live sends on both platforms failed with native code `31610`; this revision did not change the location path. |

## Earlier verification at `eb3cb59`

Live checks took place on November 19–20, 2026 UTC.
Tested [PR #4](https://github.com/Subramanyarao11/react-native-nexconn/pull/4)
at `eb3cb5914a488022b767eebd42550bcf588218de`. Case identifiers follow
[the test plan](CLOUD_SESSION_2.md). No older APKs were used for this retest.

## Builds

Ubuntu 22.04.5 LTS, Node 24.22.2, Yarn 4.18.1, JDK 17, Android SDK 36/37,
NDK 27.1.12297006. Ran `bash scripts/cloud/verify-js.sh` first, then
`env -u JDK_JAVA_OPTIONS bash scripts/cloud/verify-android.sh all`; the latter
avoids the VM's global JVM options reported as a CMake failure on the prior run.

| Case | Result |
| --- | --- |
| B1 — JavaScript | Pass: 55 tests, no failures or skips; typecheck, lint (0 errors), library build, Codegen, and pack. |
| B2 — CLI | Pass: debug and minified release APKs built with the new native bridge. |
| B3 — Expo debug | Pass: debug APK built; non-clean prebuild left the checked Gradle and manifest files unchanged. |
| B4 — Expo R8 | Pass: release APK built, all six SDK classes kept their names, and DEX retained runtime `@MessageTag(RC:TxtMsg)`. |

B8 (fresh packed Android consumers) passed on `5ce885f` and was not rerun
on this revision. FCM and physical push were excluded.

## Android live checks

| Case | Result |
| --- | --- |
| T5 — Alice → Carol (CLI debug, both chats open) | **Pass.** Recipient native log at 17:19:57.170 UTC: `sdk event MessageHandler.onMessageDeleted gen=1 js=true`. Recipient JS at 17:19:57.173 UTC: `messagesDeleted`, `content.type=text`. The original text disappeared from both open chats without reopening. |
| T6 — Refresh in Carol's chat | **Partial.** The button ran in the open chat, but the message was already gone after T5. This does not prove that Refresh catches a missed live callback. |
| T8 — Recall before recipient opens the incoming message | **Pass.** The recalled message did not appear when the recipient opened the chat after the recall. |

## Expo R8 release runtime

After the initial test-agent quota interruption, the November 20 retry
passed on the exact `eb3cb59` APK (SHA-256
`d9150ef87863640b8127db39b7446d72c1c8e146683b0107857283880914b3fe`).
The API 35 emulator reported `PAGE_SIZE=16384`. Metro was stopped before the
Expo release launched and stayed off; the already-loaded CLI fixture on
the other emulator served as the peer. The release signed in via trusted
loopback HTTPS without changing the APK.

| Case | Result |
| --- | --- |
| R1 — HTTPS sign-in, capabilities and app settings | **Pass.** The release reached Chats, returned SDK version 26.4.2 in Capabilities, and returned real App settings fields, including GIF size limit (2,097,152 bytes) and maximum video duration (120 seconds). |
| R2 — Two-way text and decoded history (quick regression) | **Pass.** CLI and Expo R8 each received the other's text once. After reopening both chats, both original texts decoded correctly and appeared once, with no `[unknown]` placeholder. Release image delivery and R5 cold restart were not repeated on this revision. |

## Cross-platform checks

Alice and Carol used the Ubuntu token server; Bob used the Mac token server.
Both servers used the same Nexconn application credentials. The two-way
cases pair the Ubuntu and Mac CLI debug builds at `eb3cb59`.

| Case | Result |
| --- | --- |
| X1 — Two-way text | **Pass.** Each peer received the other's text once, with a saved sender message and the matching native and JS receive events. |
| X2 — Two-way typing | **Pass.** Each recipient's open chat showed the other user's typing indicator, with matching native and JS event evidence. |
| X3 — iOS read receipt to Android | **Pass (receipt).** Bob's chat was already open and sent the receipt automatically. Alice logged the native receipt at 04:37:12.664 UTC, then one JS `readReceiptResponse`. The saved message had read count 1 and unread count 0; its bubble still said Sent and only showed Read after reconnecting and reopening the chat. |
| X4 — Image and file | **Partial.** Both platforms uploaded a PNG and text file to 100% and decoded both incoming types. iOS downloaded both Android files with matching SHA-256 and byte lengths (1,455-byte PNG and 2,048-byte text); Android downloaded the iOS text file with matching SHA-256 and byte length (2,048 bytes). The Android download of the 983-byte iOS PNG did not report progress or complete during observation; the direct-URL SDK method reported unsupported on Android. |
| T7 / X5 Android → iOS | **Pass.** Alice's native trace showed `MessageHandler.onMessageDeleted gen=1 js=true` at 17:31:26.326 UTC; her open chat showed Recalled and removed the text. Bob's native trace showed `MessageHandler.onMessageDeleted gen=1 js=yes` at 17:31:26.805 UTC; one JS `messagesDeleted` followed, with `content.type=text`. Bob's chat removed the text live; no `messagesUpdated` was observed. |
| X5 iOS → Android | **Pass.** Bob recalled the saved text while both chats stayed open. Alice logged `MessageHandler.onMessageDeleted gen=1 js=true` at 04:35:52.460 UTC, then one JS `messagesDeleted` with `content.type=text`. The message disappeared live, before any Refresh. Bob's native and JS observers also reported the deletion as text. |
| X6 — Edit from iOS | **Pass (recipient).** Alice's native observer logged `onMessagesUpdated` at 04:39:59.226 UTC, followed by exactly one JS `messagesUpdated`. The same message ID appeared with the new text and an Edited label in the open chat. The sender's SDK resolved with the edited text, but the sender's open chat stayed stale. |
| X7 — Three-user group | **Pass.** Alice created the group with Bob and Carol (process code 0). Each user sent a text; all three chats displayed each label once. Group membership was available through the SDK before the first message populated the conversation on iOS. |
| X8 — Custom messages | **Pass both ways.** After registering counted `app:poll` with searchable field `question` while disconnected, each client reconnected and received one `custom` event preserving the exact `messageType` and the peer's `question` value. |
| X9 — Offline delivery to iOS | **Pass.** With Bob confirmed disconnected, Alice sent three texts. On reconnection Bob received them once each and in order (`offline=true`, `left=2,1,0`), then one `offlineMessageSyncCompleted`. Native callbacks matched, and the chat showed each text once. |
| X10 — Location | **Fail both ways.** Android failed with and without a valid PNG thumbnail; iOS failed with a thumbnail. All failed with `category=native`, `nativeCode=31610` (`JsonParserFailed` on Android), `method=message.send`. No location was delivered. |
| X10 — Voice and video | **Pass Android → iOS (delivery).** Both uploads reached 100%; iOS received each once with the right content type and one-second duration. Video size matched (1,881 bytes); normalized voice had no size field. This does not cover reverse delivery or playback. |

After the release retry, both Android clients signed out and were stopped
before Alice and Carol were returned to the iOS session. Temporary servers,
ADB mappings, CA trust, and keys were removed. This report does not include
same-platform iOS release or official-client interoperability checks.
