# Cloud session 2 — Ubuntu Android retest

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
