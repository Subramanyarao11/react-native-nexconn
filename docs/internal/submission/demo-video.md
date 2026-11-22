# Demo video script (about 3 minutes)

Record two Android emulators side by side: judge1 on the left, judge2 on
the right. Use the demo APK, or `yarn example:expo android` with Metro.
Turn on "Show taps" in the emulators' developer options. Use any screen
recorder (QuickTime: File > New Screen Recording; or Loom). Never show the
App Secret or a terminal with tokens.

| # | Time | On screen | Say |
| --- | --- | --- | --- |
| 1 | 0:00 | The docs home page, then the npm page | "Nexconn has no React Native SDK. This is an open-source one: `npm install @subramanyarao11/react-native-nexconn`. It bridges Nexconn's official Android and iOS SDKs." |
| 2 | 0:15 | Both emulators: sign in as judge1 and judge2 | "Sign-in goes through our token server, so the App Secret never touches the phone." |
| 3 | 0:30 | judge1: Chats, type `judge2`, tap **Chat**, send "hi" | "Messages arrive live." Show judge2 typing: "typing…" appears on judge1 |
| 4 | 0:50 | judge2 opens the chat; judge1's bubble changes from "sent" to "read" | "Read receipts come from the SDK's receipt counts, live." |
| 5 | 1:05 | judge1 sends an image (Send file with an image path) | Point out "sending 37%" on the bubble, then judge2 receiving it |
| 6 | 1:25 | judge2 taps judge1's message, **Reply** "agreed"; judge1 taps their own message, **Edit**, then **Recall** | "Replies, edits and recalls update on both sides without a refresh." |
| 7 | 1:50 | judge1: Chats, create a group `demo` with member `judge2`; send "@judge2 standup"; judge2 sees "1 unread mention of you"; tap **Members** | "Groups, mentions and live member lists." |
| 8 | 2:15 | judge1: airplane mode on, send "offline test", see `failed · tap to act`; airplane mode off, tap, **Retry** | "A failed send stays visible. Retry is only offered once the SDK says it failed, so it can't duplicate." judge2 receives it once |
| 9 | 2:40 | **Contacts** tab (friends, requests, block list), then **Playground** with its event log | "Friends, presence and a live, redacted SDK event log." |
| 10 | 2:55 | The docs Project overview page | "Typed client, React hooks, Expo plugin, tests in CI. Links are in the write-up." |

Upload as Unlisted (YouTube) or with "anyone with the link" access (Loom or
Drive), then check the link in a private browser window.
