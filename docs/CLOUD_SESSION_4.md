# Cloud session 4: test plan (React hooks and demo)

Branch: `feat/react-hooks`, based on `main` (`82eb8d0`). It's independent of
the push branch (PR #5). Record results under "Results", then update
`docs/STATUS.md`. Never paste tokens, the App Secret, or message contents
beyond the test strings below.

## What changed

All changes are JavaScript and TypeScript: no Kotlin, Swift or Gradle
changes. One JS bundle per app is enough; a native rebuild is not required
if the installed app is from `main`.

| Area | Change |
| --- | --- |
| New hooks | Groups, users and friends, search, drafts, mentions, open and community channels. See [REACT.md](REACT.md) |
| `useMessages` | Send state with upload progress, `retry` (only after an SDK-reported failure), `cancel`, `discard`, `reply`. Keeps history through network drops and revalidates after reconnecting |
| `useChannelList` | Keeps channels through network drops and revalidates after reconnecting |
| `MessageListStore` | Indexed updates. Live append is about 75 times faster (JS benchmark) |
| Demo | Tap a message for actions (Reply, Edit, Recall, Retry, Cancel upload, Discard), `@userId` mentions, saved drafts, in-chat Search, a Members panel for groups, and a Contacts tab |

## 1. Checks (both VMs)

| # | Command | Pass |
| --- | --- | --- |
| B1 | `bash scripts/cloud/verify-js.sh` | 81/81 unit tests, 20/20 hook tests (`test:react`), the bench prints its table without assertion failures, typecheck, lint 0 errors, build, Codegen |
| B2 | `bash scripts/cloud/verify-packed-consumers.sh` | Pass. The consumer check now imports every new hook and helper from the tarball |
| B3 (Ubuntu) | `bash scripts/cloud/verify-android.sh cli` | Builds and the R8 checks pass (expected to be unchanged) |
| B4 (Mac) | `bash scripts/cloud/verify-ios.sh cli` | Builds (expected to be unchanged) |

## 2. Device rows (two users, A and B; emulator or simulator)

| # | Steps | Pass when |
| --- | --- | --- |
| H1 | A opens B's chat. Turn networking off on A's device (airplane mode), wait for the status to leave connected, then turn it back on | A's messages stay on screen the whole time. After reconnecting, a text B sent while A was offline appears once, in order, without pressing Refresh |
| H2 | A, offline: send "h2-offline" | The bubble shows `sending`, then `failed · tap to act` once the SDK reports the failure. Tapping it shows **Retry** and **Discard**. Back online, **Retry** gives exactly one `sent` copy, and B receives it once. Record whether the SDK reported `failed` (20), or whether it stayed at `sending` (so no Retry was offered) |
| H3 | A sends an image of at least 1 MB, then taps the bubble and taps **Cancel upload** | The bubble shows `sending NN%` while uploading. After cancel it shows `canceled`, and **Retry** sends it again. B receives exactly one image |
| H4 | B taps A's message and taps **Reply**, typing "h4-reply" | A sees the quoted line above "h4-reply" |
| H5 | Group with A, B and C. A sends "@B h5" | B's chat shows "1 unread mention of you" until B opens it; C sees no banner |
| H6 | A types "h6-draft" without sending, goes back, kills and relaunches the app, and reopens the chat | The composer shows "h6-draft". Sending it clears the draft |
| H7 | A: **Search** "h4" | The reply from H4 is listed. An empty keyword lists nothing |
| H8 | Group: open **Members**. B leaves the group from B's device; A invites C; A (owner) taps **Make admin** for C | A's list removes B, then adds C, then shows C as admin, each without Refresh |
| H9 | Contacts: A adds B as a friend; B accepts under **Pending requests** | Both friend lists show the other without reload. B shows `· online` on A's list while B is connected |
| H10 | Contacts: A blocks B, then unblocks B | The blocked list updates after each action. While blocked, B's message to A is rejected (record the native code) |
| H11 | Account switch: A signs out (Playground → Disconnect) and signs in as C | No A conversations, messages, friends or profile names appear for C |

Emulators and simulators are fine for H1–H11.

## Devin handoff

- Ubuntu: B1, B2, B3, then H1–H11 on two Android emulators.
- Mac: B1, B2, B4, then H1–H11 on two iOS simulators. If time is short,
  prioritize H1, H2, H3 and H11.
- If a row fails, report exactly what's on screen and the event-log lines,
  and stop. Don't patch code on the VM.

## Results

_Not run yet._
