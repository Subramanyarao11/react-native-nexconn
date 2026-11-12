# react-native-nexconn — project handover

Verified on **10 November 2026**. The project is a **private React Native library scaffold**, with a native bridge diagnostic and separate Community CLI and Expo examples. It does not yet connect to Nexconn Chat or send messages.

| Item | Verified state |
| --- | --- |
| Repository | [Subramanyarao11/react-native-nexconn](https://github.com/Subramanyarao11/react-native-nexconn), private, `main` |
| Latest commit | [`16fe573`](https://github.com/Subramanyarao11/react-native-nexconn/commit/16fe573a562551c96228748b3d9f0137a25aa4e0), verified against GitHub |
| Package | `react-native-nexconn`, `0.0.0-development`, `private: true`, `UNLICENSED` |
| Usable public API | `getIntegrationStatus()` and its `IntegrationStatus` type |
| Local validation | Both diagnostic unit tests passed again on 10 November |
| Earlier cloud validation | Dependency install, both unit tests, TypeScript, ESLint and Bob package build passed during setup on 2 November |
| Cloud execution | Saved environment exists; `runnable: false` on 10 November. A separate cloud coding chat was approved but has not started |
| Native and live validation | Four native build/run combinations, vendor SDK integration and real messaging are pending |

## Why we started it

You wanted to enter the Nexconn Build Challenge with an independent SDK that lets React Native developers use Nexconn Chat on Android and iOS. Supporting both Community CLI and Expo development builds was a requirement from the start. The project is meant to be reusable beyond the hackathon. Chat was the scope; a Calls SDK would be a separate decision.

The idea was to build privately, demonstrate a real app, and show Nexconn the work once it was ready. We did not contact Nexconn, release an npm package or make the repository public. Our research found official Web, Android, iOS and Flutter Chat SDKs, but no official React Native Chat package. This made a community bridge a plausible project, subject to real native builds and messaging tests.

## Feasibility and the routes we considered

| Route | What we found | Decision |
| --- | --- | --- |
| Direct native bridge | Nexconn documents an Android Gradle dependency (`ai.nexconn.chat:chat`) and iOS installation through `NexconnChat/Chat` in CocoaPods or its Swift Package repository. The native SDKs expose initialization, connection, event handlers and messaging. | Default implementation direction: call the official Android and iOS SDKs from one React Native TurboModule. Pin and verify the actual versions before writing the integration. |
| Adapter over RongCloud | The official Nexconn Flutter package depended on `rongcloud_im_wrapper_plugin` and instantiated `RCIMIWEngine`. RongCloud's React Native wrapper `@rongcloud/react-native-im-wrapper` version `5.34.0` had Codegen and New Architecture implementation paths when inspected. | Promising fallback or comparison. It has not been installed in this project or tested with a real Nexconn App Key, region, user token or message. It cannot yet be treated as a supported Nexconn integration. |
| Web SDK inside React Native | We inspected the published Web packages and found browser assumptions, including browser storage and DOM-related APIs. | Not the first implementation route. Running it in a browser or WebView would not establish native behavior, lifecycle or push support. |

Sources: [Nexconn Android installation](https://docs.nexconn.ai/chatsdk-android/import), [Nexconn iOS installation](https://docs.nexconn.ai/chatsdk-ios/import), [Flutter dependencies](https://github.com/NexconnAI-Dev/nexconn-chat-sdk-flutter/blob/main/pubspec.yaml), [Flutter engine](https://github.com/NexconnAI-Dev/nexconn-chat-sdk-flutter/blob/main/lib/src/engine/nc_engine.dart), [RongCloud React Native wrapper](https://www.npmjs.com/package/@rongcloud/react-native-im-wrapper).

## What we actually built and how

1. **Scaffolded the package.** Used Callstack's `create-react-native-library@0.64.0` with the TurboModule template, Kotlin and Objective-C, the Expo example and React Native `0.88.1`. The generated iOS bridge is Objective-C++. We generated a second CLI example and added it as its own workspace. Both examples depend on the root package via `workspace:*`.
2. **Replaced the generator's arithmetic demo.** Added `getIntegrationStatus()` to the React Native Codegen spec. The Kotlin and Objective-C++ implementations return a small JSON payload. The TypeScript boundary checks its fields and rejects malformed or internally inconsistent results. Non-native resolution returns a clear unsupported state.
3. **Added two diagnostic apps.** `example/` is the Expo SDK 58 fixture, and `example-cli/` is the Community CLI fixture. They import the same package API and display the result and the current limitation. Neither example is a chat app yet.
4. **Set up the package workflow.** The package targets React Native `0.88.x` and React `^19.3.0`; the fixtures use `0.88.1` and `19.3.0`. The Expo fixture pins `expo` to `~58.0.22`. The repo uses Node 24, the committed Yarn `4.18.1` launcher, Yarn workspaces, ESLint, TypeScript and React Native Builder Bob (`^0.44.1`). Bob builds the JS module and TypeScript declarations into `lib/`.
5. **Added checks and working instructions.** `check` runs the two Node tests, type checking, lint and the Bob build. A manual GitHub Actions workflow, **Package checks**, runs the install and check on Ubuntu. It is configured, but this chat did not verify an Actions run. The repo has `AGENTS.md`, build, cloud setup, status, and implementation milestone docs.
6. **Preserved the work privately.** The generator scaffold is [`969588b`](https://github.com/Subramanyarao11/react-native-nexconn/commit/969588b), the project bootstrap is [`ab59569`](https://github.com/Subramanyarao11/react-native-nexconn/commit/ab59569adf00cdec6a5ae2eafd5266d0368164fa), and the documentation checkpoint is [`16fe573`](https://github.com/Subramanyarao11/react-native-nexconn/commit/16fe573a562551c96228748b3d9f0137a25aa4e0). There is no vendor SDK binary, app secret or test user token in the package.

| Path in the repository | Purpose |
| --- | --- |
| `src/index.tsx` | Public exports |
| `src/NativeNexconn.ts` | TurboModule contract and registry lookup for `Nexconn` |
| `src/getIntegrationStatus.native.ts` | Calls the native method and validates the response |
| `src/getIntegrationStatus.ts` | Non-native fallback |
| `src/diagnostics.ts` | Public type and payload validation |
| `android/src/main/java/com/nexconn/NexconnModule.kt` | Android diagnostic implementation |
| `ios/Nexconn.mm` and `Nexconn.podspec` | iOS implementation and pod integration scaffold |
| `example/`, `example-cli/` | Independent Expo and bare React Native fixture projects |
| `tests/diagnostics.test.mjs` | Validates the JS/native payload boundary |
| `.agents/skills/`, `AGENTS.md` | Project-local guidance and working constraints |
| `docs/STATUS.md`, `docs/CLOUD_MILESTONE_1.md` | Verified progress and the first implementation task |

The repo contains five skills from the maintainers' repositories: Callstack's **create-react-native-library**, **react-native-best-practices**, **react-native-testing** and **github-actions**, plus Expo's **expo-module**. They guide scaffolding, native lifecycle and performance, testing, CI, and Expo integration respectively. We installed them inside `.agents/skills/` so a cloud checkout can use them. The [skill source record](https://github.com/Subramanyarao11/react-native-nexconn/blob/main/.agents/skills/SOURCES.md) records the exact pinned revisions and retained license notices.

## Usage today

This is private source. There is no npm release to install. Use the existing authorized checkout, or clone the private repo with your GitHub account:

```sh
gh repo clone Subramanyarao11/react-native-nexconn
cd react-native-nexconn
node --version                         # use Node 24
node .yarn/releases/yarn-4.18.1.cjs install
node .yarn/releases/yarn-4.18.1.cjs check
```

Use the committed Yarn launcher instead of relying on a globally installed Yarn. No `yarn.lock` is committed at this checkpoint. The first install can generate one. The earlier cloud setup generated an untracked lockfile; recover and review it if available, otherwise generate and review a new one. Commit the reviewed lockfile before using `install --immutable` as the normal reproducible workflow.

To run the two diagnostic tests without installing the workspace dependencies:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/diagnostics.test.mjs
```

In a native app built with the workspace package linked, the current API is:

```ts
import { getIntegrationStatus } from 'react-native-nexconn';

async function checkNexconnBridge() {
  const status = await getIntegrationStatus();
  console.log(status);
}
```

The intended response from a correctly linked Android build is:

```json
{
  "platform": "android",
  "nativeModuleLinked": true,
  "sdkIntegrated": false
}
```

iOS reports `"ios"`. A non-native build resolves the fallback with `"unsupported"` and both flags `false`. On mobile, the TurboModule is looked up with `getEnforcing`, so a missing native registration can fail at import time. Build and install the correct native app before using the API. `nativeModuleLinked` says the native function responded; `sdkIntegrated: false` says the Nexconn Chat SDK has not been added. These return values are defined by the code, and the actual native example builds are still unverified.

### Run the fixture apps for native validation

Run from the repository root after installing JS dependencies. Use an Android emulator/device with the Android SDK and JDK set up, or an iOS Simulator on a Mac with Xcode and CocoaPods. For CLI iOS, set up the bundle from `example-cli/Gemfile` and install the pods for `example-cli/ios/Podfile` before the first build.

```sh
# Choose one CLI target at a time.
node .yarn/releases/yarn-4.18.1.cjs example:cli android
node .yarn/releases/yarn-4.18.1.cjs example:cli ios

# Prepare a development client for the Expo fixture.
# The dependency is not yet recorded in example/package.json.
node .yarn/releases/yarn-4.18.1.cjs workspace react-native-nexconn-example exec expo install expo-dev-client

# Choose one Expo target at a time; these build a native app.
node .yarn/releases/yarn-4.18.1.cjs example:expo android
node .yarn/releases/yarn-4.18.1.cjs example:expo ios
```

After a development binary is installed, `example:cli start` and `example:expo start` start their respective development servers. The Expo start script uses `--dev-client`. Starting a server alone does not compile the native bridge. Expo Go does not include this custom module, so use a new development build after native changes. [Expo custom native code documentation](https://docs.expo.dev/workflow/customizing/).

These are the paths to validate, not verified build results. The current app screens show the bridge status and a notice that Chat is not integrated. They cannot sign in, load conversations or send messages. Workspace consumption has been set up; clean installations from a packed tarball have not been tested.

## Cloud and Mac workflow

You authorized creation of a private repository, connecting it to Codex Cloud, and later starting a separate cloud coding chat. We completed the GitHub connection with access scoped to this repository. The environment, also called `react-native-nexconn`, is configured for `main`, owner-only access, package-manager network domains, and no app credentials.

The onboarding VM installed the dependencies and passed both unit tests, TypeScript, lint and the package build on 2 November. It saved the install script and startup guidance and produced an untracked lockfile. Peer-dependency warnings were left to investigate. Environment publication then returned “Couldn't publish environment”; the settings were saved. A later attempt to reopen its settings showed “Environment unavailable.” The latest read on 10 November still reports `runnable: false`. This is why cloud implementation did not begin. The repository stayed private, and no npm release was made.

The documented Plus VM defaults we used for planning were **2 vCPUs, 8 GiB RAM and 8 GiB disk**. These were plan defaults, not measurements of the setup instance. The intended split is cloud coding and JS/package checks, with periodic native builds and tests on your Mac. Xcode/iOS Simulator requires macOS; accelerated Android emulator support was not established in this managed VM. A separate macOS runner or mobile build service is an option for remote builds. Building a binary and running tests on it are separate checks. [Codex Cloud environment documentation](https://learn.chatgpt.com/docs/environments/cloud-environments), [Android emulator acceleration](https://developer.android.com/studio/run/emulator-acceleration).

## Ownership, licensing and the hackathon

Your goal was to show source while retaining a say in commercial reuse. The options discussed were a **source-available evaluation or noncommercial grant plus a separate commercial license**, or a stricter evaluation grant if narrower permission is needed. PolyForm Noncommercial was one candidate, not the selected license. A license sets permission and conditions; it does not alert you when code is copied or give you control over independently written implementations.

The implemented choice was to keep the repository private, set `private: true` and `UNLICENSED`, and reserve rights to your original work in `LICENSE`. The generator template and borrowed skills retain their upstream notices. Nexconn and RongCloud SDKs have their own terms. Those terms and the hackathon's submission conditions need review before a public release or wrapper distribution. We did not select a final license or grant a separate commercial license as part of this work.

When we reviewed the challenge, the submission called for **real Nexconn Chat SDK usage, a runnable app, a public repository, a demo video and a write-up with the App Key**. The stated deadline was **22 November 2026 at 23:59 Anywhere on Earth**, corresponding to **23 November at 5:29 PM IST**. The public page described participants retaining IP while granting exhibition/promotion rights. The submission page and final terms should be checked before release; the current private scaffold is not a qualifying submission by itself. [Challenge page](https://reskilll.com/hack/nexconn/).

## Planned API, security and next work

The intended design is a headless typed package, with optional React provider/hooks and an Expo config plugin. React Native Codegen connects TypeScript to one native module on each platform. Native SDKs should own the connection, local history and reconnect behavior. The wrapper should normalize results and errors, register handlers before connecting, allow subscriptions to be removed, and ignore stale callbacks after account changes.

The planned auth flow is **app sign-in → authenticated backend → per-user Nexconn token → SDK connect**. App Secret stays on the backend. The backend must issue tokens for the authenticated user rather than an arbitrary user ID submitted by the client. No backend or credentialed demo was built in this chat.

| Order | Work | Evidence needed |
| --- | --- | --- |
| 1 | Restore or publish the environment, review the Yarn lockfile, resolve peer warnings and establish the baseline. | A runnable cloud chat or an agreed alternative, reproducible dependency install and passing package checks. |
| 2 | Pin the real Nexconn Gradle/CocoaPods SDKs; check their headers, method signatures and startup requirements. | Actual SDK resolution and recorded Android/iOS API versions. |
| 3 | Implement initialization, connection state, token-based connect, direct text send/receive, disconnect and cleanup. | Compile both platforms and exchange text between two real test users, including receipt after reconnect. |
| 4 | Validate the packed package in the CLI and Expo fixtures on Android and iOS. | Four independent build/run results, not merely workspace imports. |
| 5 | Add conversations/history/unread state, groups, media, receipts, typing, reliable offline handling, push, and React hooks in tested increments. | Platform-by-platform capability evidence, with physical-device push testing. |
| 6 | Add an authenticated token-server example and a runnable demo app; complete docs, packaging and licensing review. | Reproducible clean installs, documented supported versions/features, and submission artifacts. |

The original build plan also tracks later features such as open/community channels, profiles, blocking, custom messages and moderation, subject to actual upstream support. None of these features is implemented in the current scaffold. The first milestone is deliberately narrow: a real, tested text message through Nexconn on the two native platforms.

Project references: [Build plan](https://github.com/Subramanyarao11/react-native-nexconn/blob/main/docs/BUILD_PLAN.md) · [Status](https://github.com/Subramanyarao11/react-native-nexconn/blob/main/docs/STATUS.md) · [Cloud setup](https://github.com/Subramanyarao11/react-native-nexconn/blob/main/docs/CLOUD_SETUP.md) · [First implementation milestone](https://github.com/Subramanyarao11/react-native-nexconn/blob/main/docs/CLOUD_MILESTONE_1.md).
