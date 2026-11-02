# Nexconn React Native Chat SDK — build plan

Prepared 2 November 2026. This is a proposed implementation and release plan, based on public documentation and published package inspection. No Nexconn connectivity prototype has been run. Feature names below describe intended functionality; the implementation must use the actual APIs available in the pinned native SDKs.

## Product and delivery decision

Build a reusable React Native Chat SDK with Android and iOS implementations, a typed JavaScript API, React hooks, Expo configuration support, documentation, and a working application that demonstrates a real communication scenario.

Use the official Nexconn native SDKs as the default implementation. Evaluate the existing RongCloud React Native wrapper during the first two days as a possible accelerator. Freeze one implementation route after that evaluation; do not build two complete transports for the first release.

The hackathon release is the first milestone of the full package. A complete, tested release candidate is the target for the challenge; comprehensive native feature parity remains a tracked goal after it. Do not label the package production ready or feature complete unless its published acceptance criteria have passed.

Keep the work private while developing, then prepare the public repository required for submission. Present it as a community SDK with clear authorship and third-party attribution. Do not claim Nexconn endorsement.

The public challenge page requires real Nexconn Chat SDK usage, a runnable application, a public repository, a demo video, and a write-up PDF with the App Key. It gives 50% of the score to completeness and user experience. Its deadline is 22 November 2026 at 23:59 AoE, which is 23 November at 17:29 IST. Aim to complete submission materials on 21 November. [Challenge requirements](https://reskilll.com/hack/nexconn/).

An SDK could make the submission distinctive, but it does not guarantee a judging advantage. The demonstration must show why React Native support helps users and developers.

## Ownership and licensing direction

The stated priority is to retain control over commercial incorporation and redistribution while making the work visible. That points to a source-available license with a separate commercial agreement, rather than a permissive open-source license.

Open-source licensing allows use, modification, and redistribution under its terms, including commercial use. A requirement that a particular company obtain permission first is incompatible with that general model. [Open Source Initiative](https://opensource.org/osd).

| Model | What it offers | What it does not offer |
| --- | --- | --- |
| MIT or Apache-2.0 | Broad adoption and reuse, subject to the license conditions | A requirement to contact the author before commercial reuse |
| GPL/AGPL with a commercial alternative | Copyleft obligations in applicable circumstances, with a negotiated alternative for other uses | Guaranteed notification, or a prohibition on companies using the compliant open-source route |
| Source-available evaluation/noncommercial terms with a commercial alternative | Permission can be required for commercial uses outside the public grant | OSI open-source status, automatic detection of copying, or control over independently authored implementations |

Copyleft is not a notification system. Linking a copyleft wrapper to proprietary SDKs also needs a compatibility analysis and potentially an explicit exception. Alternative licensing requires rights to the relevant code. [GNU licensing FAQ](https://www.gnu.org/licenses/gpl-faq.en.html).

Recommended working direction: evaluate **PolyForm Noncommercial 1.0.0 plus a separately negotiated commercial license** for the original wrapper. Its public grant allows noncommercial use, changes, and redistribution subject to its conditions, so this still permits some copying without contacting the author. If the requirement is permission for every use beyond a narrowly defined evaluation, a tailored evaluation license is a different option. Neither should be advertised as open source. [PolyForm Noncommercial](https://polyformproject.org/licenses/noncommercial/1.0.0).

Before publication, have the chosen license and any judging/evaluation permission reviewed by a software licensing lawyer. This is a release decision; private engineering can proceed meanwhile. Do not add a vague prohibition on “stealing,” or promise that the license makes copying detectable.

Preserve ownership evidence through the repository history, copyright notices, signed release tags, dated design records, changelogs, and package provenance. Provenance identifies where a package was built; it does not report downstream copying. [npm provenance](https://docs.npmjs.com/generating-provenance-statements/).

Keep these rights separate:

- Original wrapper code can receive the selected project license, subject to actual ownership.
- Reused MIT code keeps its applicable notices and permissions; our license cannot retract those upstream rights.
- Nexconn and RongCloud native binaries retain their own terms.
- The wrapper license does not grant rights to the vendors’ APIs, branding, or SDK code.

Nexconn’s published SDK agreement restricts modification and standalone toolkit distribution. An independently written bridge that fetches the SDK as a dependency needs to be assessed against those terms; dependency-only packaging is not proof of permission. Do not copy Nexconn’s Flutter implementation or redistribute its SDK binaries into our npm tarball. [Nexconn SDK license](https://github.com/NexconnAI-Dev/nexconn-chat-sdk-flutter/blob/main/LICENSE).

The public hackathon page says participants retain IP and grant exhibition/promotion rights. Review the actual registration, dashboard, and submission terms before submission; those authenticated terms have not been inspected. Keeping the project a surprise leaves eligibility and vendor-publication questions unresolved rather than answered. [Public IP statement](https://reskilll.com/hack/nexconn/).

Start with original contributions under one clearly identified owner. Before accepting outside contributions, adopt a contributor policy that preserves the rights needed for the commercial licensing option. A DCO alone should not be assumed to grant relicensing rights.

## Existing work and route selection

Nexconn’s Flutter package depends on `rongcloud_im_wrapper_plugin`, and its engine constructs `RCIMIWEngine`. RongCloud publishes an Android/iOS React Native wrapper. This is evidence of a promising reuse path, not proof that Nexconn credentials or all features work through it. [Flutter dependency](https://github.com/NexconnAI-Dev/nexconn-chat-sdk-flutter/blob/main/pubspec.yaml), [Flutter engine](https://github.com/NexconnAI-Dev/nexconn-chat-sdk-flutter/blob/main/lib/src/engine/nc_engine.dart), [RongCloud RN wrapper](https://github.com/rongcloud/rongcloud-react-native-im-wrapper).

Inspection of the published RongCloud RN package, version 5.34.0, found Codegen configuration and New Architecture implementation paths. This is encouraging but is not a successful compatibility test. Its native dependencies are RongCloud packages, so it should not be represented as directly wrapping the Nexconn native packages. [Published package](https://www.npmjs.com/package/@rongcloud/react-native-im-wrapper).

| Route | Choose it when | Main concern |
| --- | --- | --- |
| Direct Nexconn TurboModule | Default: official dependencies build and basic messaging works on both platforms | More native integration and data conversion work |
| Adapter over RongCloud RN | Actual Nexconn authentication, routing, messaging, and required features pass on both platforms | Support and hackathon acceptance of this route remain unconfirmed without vendor communication |
| Web SDK adaptation | Only reconsider if native routes have a concrete blocker | Browser storage and DOM dependencies require additional adaptation; foreground success does not establish native lifecycle support |

Nexconn publishes Android Gradle dependencies and iOS CocoaPods/SPM integration instructions. Use Gradle and CocoaPods for the first RN integration; evaluate SPM later rather than combining dependency mechanisms in the initial release. [Android installation](https://docs.nexconn.ai/chatsdk-android/import), [iOS installation](https://docs.nexconn.ai/chatsdk-ios/import).

## Skills inspected and recommended

The following skill files were inspected at their source repositories. They are planning references, not globally installed skills in this chat. The curated installer catalog returned an authentication error, so source inspection was used instead.

| Skill | Role in this project | Priority |
| --- | --- | --- |
| [Callstack: create-react-native-library](https://github.com/callstackincubator/agent-skills/blob/main/skills/create-react-native-library/SKILL.md) | Library scaffold, implementation template, example app, build and packaging workflow | Primary |
| [Callstack: react-native-best-practices](https://github.com/callstackincubator/agent-skills/blob/main/skills/react-native-best-practices/SKILL.md) | Async native work, event traffic, memory/lifecycle cleanup, and measured performance | Primary |
| [Callstack bundle: react-native-testing](https://github.com/callstackincubator/agent-skills/blob/main/plugins/vendored/.agents/skills/react-native-testing/SKILL.md) | Hook and component tests using the installed testing-library version | During React integration |
| [Callstack: github-actions](https://github.com/callstackincubator/agent-skills/blob/main/skills/github-actions/SKILL.md) | Downloadable Android and iOS simulator build artifacts | During CI setup |
| [Expo: expo-module](https://github.com/expo/skills/blob/main/plugins/expo/skills/expo-module/SKILL.md) | Config plugins and lifecycle guidance; native module alternative if selected | Supporting reference |

Use the Callstack library scaffold for a general React Native package. Its guidance selects a TurboModule for native APIs, Kotlin/Objective-C for that template, an Expo example, and Yarn workspaces. It requires reading the generated contributing guide and testing the example. An iOS Objective-C++ registration shell can delegate to a Swift integration layer if needed. [Scaffold reference](https://github.com/callstackincubator/agent-skills/blob/main/skills/create-react-native-library/references/scaffold-library.md).

Do not combine Expo Modules, Nitro, and TurboModules merely because skills exist for each. Pick one native integration approach. A TurboModule library can support an Expo development build without making the core API Expo-specific. [Library tooling](https://oss.callstack.com/react-native-builder-bob/create), [Expo development builds](https://docs.expo.dev/workflow/customizing/).

When implementation starts, install only the selected skills through the available skill installer and record their source revisions. Treat official framework documentation and actual installed package source as the authority when a skill is stale.

## Toolchain and compatibility

### Cloud execution and CLI/Expo support

User preference under discussion: execute development remotely rather than using the local Mac for builds. The current chat still executes on the Mac. A read-only account check confirmed Plus access and found no configured Codex Cloud environments; no cloud task has been started.

Codex Cloud is available on Plus within the plan's shared usage allowance. Local and cloud work share that allowance, and long cloud tasks can consume it faster. This does not include third-party build-service plans. [Official pricing and usage guidance](https://learn.chatgpt.com/docs/pricing).

Create a private GitHub repository, then use **Work in > Cloud > Select environment > Create environment**. Connect that repository, let setup prepare and test the tools, and publish the environment before starting the implementation task. Repository-local skills should travel with the project because personal local skills are not synced automatically. [Cloud setup](https://learn.chatgpt.com/docs/environments/cloud-environments).

Use this division of work:

- Codex Cloud: implementation, TypeScript builds, contract/unit tests, Codegen checks where supported, documentation, package packing, and release preparation.
- Native build services: build both bare-RN and Expo fixtures on Android and macOS/iOS workers; use EAS Build and/or CI with the required native tools. EAS supports existing React Native projects as well as Expo projects. [EAS Build](https://docs.expo.dev/build/introduction/).
- Devices: verify actual messaging, account switching, media, push, and native lifecycle behavior. Producing a cloud binary alone is not proof of runtime correctness.

Compatibility is a required acceptance criterion for **both React Native Community CLI (bare RN) and Expo development builds**. The core SDK must not require Expo at runtime. Bare RN uses native autolinking and its normal Gradle/CocoaPods workflow; Expo gets an optional configuration plugin and prebuild/development-build instructions. Install the same packed package into independent consumer fixtures for each, and validate Android and iOS for both. Expo Go support is not promised because the SDK requires new native code. [Expo custom native code](https://docs.expo.dev/workflow/customizing/).

For the initial cloud setup, request Node 24 matching the locked project requirements, the selected Yarn version, access to the required package registries and official vendor download hosts, and a dependency install followed by lint, typecheck, tests, and package build. Keep native build outputs and heavy SDK caches out of Git. Do not add production credentials during scaffolding. Configure live-service credentials only when integration tests need them.

EAS is a separate service with its own free allowance and paid limits; ChatGPT Plus does not subscribe the user to EAS. Check the actual account allowance before starting paid or quota-consuming builds. [Expo pricing](https://expo.dev/pricing).

Registry versions inspected on 2 November 2026:

| Dependency | Inspected version | Planned treatment |
| --- | --- | --- |
| React Native | 0.88.1 | Initial supported baseline |
| React | 19.3.0 | Match the RN/Expo baseline |
| Expo | 58.0.22 | Its bundled module metadata lists RN 0.88.1 |
| create-react-native-library | 0.64.0 | Pin the generator used for the scaffold |
| react-native-builder-bob | 0.44.1 | Confirm the generated configuration and pin |
| RongCloud RN wrapper | 5.34.0 | Evaluation candidate, not an automatic dependency |

These values were read from the [RN registry](https://registry.npmjs.org/react-native/latest), [Expo registry](https://registry.npmjs.org/expo/latest), [generator registry](https://registry.npmjs.org/create-react-native-library/latest), [Bob registry](https://registry.npmjs.org/react-native-builder-bob/latest), and [RongCloud registry](https://registry.npmjs.org/@rongcloud%2Freact-native-im-wrapper/latest). Recheck before scaffolding, then lock versions rather than using floating latest versions in CI.

The local machine has Node 24.22.2, Yarn 1.22.22, Java 17.0.17, Xcode 26.1.1, CocoaPods 1.17.0, and Android platform tools. This establishes availability, not that all required simulator runtimes, SDK levels, signing identities, or native dependency combinations have passed. Use the generator’s selected Yarn version and the generated native toolchain configuration. Resolve any Xcode/SDK/Gradle requirements during the spike.

Start with New Architecture and Hermes. Add an older RN baseline only after a real clean-install test passes; do not publish an untested peer range. The wrapper’s minimum OS versions must satisfy both RN and its native dependencies. They cannot simply inherit Nexconn’s lower minimum OS requirements.

## Package design

Use an author-owned npm scope, for example `@your-scope/react-native-nexconn`. Do not publish under a vendor-owned scope or use “official” in the name or README.

Start with one public npm package and separate entry points:

- Main entry: headless typed Chat SDK.
- `/react`: provider and hooks, with React declared as a peer dependency.
- `/plugin`: Expo config plugin where native configuration needs it.
- `/testing`: deterministic mocks and fixtures, excluded from normal runtime imports.

Suggested repository structure:

```text
packages/chat/
  src/client/              lifecycle, token provider, public operations
  src/models/              message/channel/error/event types
  src/transport/           internal boundary for the selected native engine
  src/react/               provider, hooks, external-store integration
  src/testing/             mocks and fixture builders
  src/specs/               Codegen specifications for the direct bridge
  android/                 Kotlin integration
  ios/                     Objective-C++ registration and SDK integration
  plugin/                  Expo configuration
examples/expo/             runnable scenario app and developer playground
examples/token-server/     authenticated token issuance example
fixtures/bare/             clean bare-RN installation test
docs/                      getting started, API, parity, migration, troubleshooting
.github/workflows/         checks, native builds, packed-install verification, release
```

The transport boundary prevents platform-specific objects from leaking into the public API. It is not a commitment to ship multiple engines. Use the same contract tests for the selected implementation on Android and iOS.

Design rules:

1. Treat native SDKs as the owner of persistence, connectivity, and retry semantics. Do not add a second message queue without a demonstrated requirement.
2. Account for the native singleton explicitly. Fail clearly if the caller attempts conflicting clients rather than pretending multiple isolated native engines exist.
3. Register native event handlers before connecting. Use removable subscriptions and make cleanup safe on reload, unmount, and runtime invalidation.
4. Use a session generation marker so late callbacks from a logged-out user cannot update the new user’s state.
5. Model local message IDs and server IDs separately, preserve the actual timestamp precision, and normalize nullable fields and raw errors deliberately.
6. Resolve each operation once. Distinguish definitive send failure from uncertain acknowledgment; automatic resending must not create duplicates.
7. Bound event buffers, batch high-volume notifications where needed, and keep expensive native operations off the JS/UI thread while honoring vendor threading requirements.
8. Report unsupported features explicitly. Never silently return empty data or success for missing native functionality.
9. Preserve the native error code and operation context alongside a stable wrapper error category.
10. Separate server-admin operations from client capabilities. App Secret and administrative signing stay on a backend.

## Feature scope and parity

Create a parity matrix before implementation. For each capability record: public API, Android native API/version, iOS native API/version, account/plan prerequisites, implementation status, test evidence, and documented limitations. Statuses are planned, implemented, verified, unavailable upstream, or intentionally deferred.

| Area | Full package target | Hackathon priority |
| --- | --- | --- |
| Lifecycle and auth | Initialize, region, connect/disconnect, token handling, state changes, cleanup, account switching | Required |
| Direct channels | Conversation list, pagination, history, unread state, pin/mute/archive/delete where supported | Required |
| Group channels | Create/join/leave, members, role/permission operations exposed by the client SDK, group events | Required core; advanced administration follows verified scope |
| Messaging | Text, image, file, voice/video message payloads, upload/download progress and cancellation where supported | Text/image/file required; other media follows native verification |
| Message actions | Receipts, typing, edit/delete/recall, mentions, custom content, metadata where available | Receipts/typing and common actions required |
| Offline behavior | Native history/cache, reconnect, ordering, deduplication, offline sync completion, pending send reconciliation | Required |
| Push | APNs/FCM configuration guidance, native callbacks, notification tap routing, permission/denial behavior | Required on the documented supported setup; physical-device credentials needed |
| React integration | Provider, connection/channel/message/unread hooks, stable subscriptions, account reset | Required |
| Open/community channels | Join/leave, retrieval, message flows, events, supported moderation controls | Full package milestone after core reliability |
| User features | Profiles, block lists, relationships/subscriptions exposed by the client SDK | Full package milestone, prioritized by demo need |
| Advanced features | Translation, moderation results, streaming/custom message handling, additional notification controls | Full parity roadmap with explicit upstream availability |
| Calls | Separate product and package decision | Outside this Chat SDK release |

This table is a product target, not a claim that every named operation exists in both native SDKs. Inventory resolves that before exposing APIs. A platform asymmetry must be visible in the capabilities API and documentation.

## Authentication and the example application

The client receives user tokens from an authenticated application backend. The example server must bind token issuance to the authenticated application user rather than accepting arbitrary user IDs from an unauthenticated request. Keep the App Secret out of mobile bundles, npm artifacts, logs, and demo credentials. [Nexconn authentication flow](https://docs.nexconn.ai/chatsdk-ios).

Use one example application with two modes:

- A focused scenario such as campus team coordination: sign in as two test users, find a conversation, exchange messages and media, create a group, see unread/read state, and reopen through a notification.
- A developer playground that exposes connection state, supported capabilities, operations, and redacted diagnostic events.

Use the same package entry points that consumers install. Do not make the demonstration work through app-only patches to the library. Test exchange with an official Nexconn client as well as between two RN clients.

Expo Go cannot load an arbitrary new native SDK. Supply development-build instructions and installable release artifacts. iOS device distribution depends on signing and provisioning; a simulator build alone is not an iPhone installation link. [Expo native-code workflow](https://docs.expo.dev/workflow/customizing/).

## Implementation schedule

Dates are targets in IST, assuming focused work and timely access to test accounts/devices. Research has reduced uncertainty but has not removed native build risk.

| Dates | Work | Exit evidence |
| --- | --- | --- |
| 2–3 Nov | API/rights inventory; native scaffold; direct Nexconn smoke test; bounded RongCloud evaluation | Both OS builds; two-user live text exchange; route decision and blockers recorded |
| 4–6 Nov | Client lifecycle, DTOs/errors/events, direct messages, local/remote history, unread state | Shared contracts pass; reconnect and account-switch scenarios pass |
| 7–10 Nov | Group workflows, image/file messages, progress, receipts, typing, supported message actions | Scenario recordings on Android/iOS; cross-client payloads verified |
| 11–13 Nov | Push setup, tap routing, native lifecycle hardening, Expo config plugin | Real-device push evidence where credentials exist; repeated prebuild is stable |
| 14–16 Nov | React entry point, scenario app, playground, API docs, capability matrix | App uses the packed library API; hooks clean up and reset correctly |
| 17–19 Nov | Bare/Expo packed-install tests, release builds, compatibility/performance and dependency checks | Clean consumer installs and documented supported matrix; no unresolved critical defects |
| 20–21 Nov | Release candidate, authorship/notice review, demo video, write-up, submission artifacts | Runnable links/artifacts; public repository prepared; tagged candidate and complete evidence |
| 22 Nov | Submission verification and contingency buffer | All submitted URLs/artifacts open from a fresh environment |
| After challenge | Complete remaining open/community, user and advanced feature parity; expand compatibility; stabilize 1.0 | Every promised 1.0 capability verified, with API and migration docs |

Planning estimate: approximately 120–180 focused engineering hours for a broad hackathon candidate, depending heavily on the route and native issues. Comprehensive parity and stabilization may require another 80–160 hours. These are estimates, not delivery guarantees. The first two days should replace them with measured progress and a feature-by-feature forecast.

If a major issue appears, preserve buildability, messaging correctness, documentation, and demo quality first. Publish a beta and its exact matrix rather than calling unverified breadth a full release. Continue the remaining full-package work after the submission milestone.

## Verification strategy

Test observable contracts and failure modes, not just wrapper forwarding calls.

| Layer | Evidence required |
| --- | --- |
| TypeScript contracts | Actual consumer imports compile; event/error discrimination works; public exports resolve from the packed tarball |
| Data conversion | Round trips for text, media, unknown/custom payloads, nulls, IDs, timestamps, and native error mapping |
| Session/event behavior | Subscribe/unsubscribe, reconnect, repeated initialization, stale callbacks, account changes, reload/unmount cleanup |
| Native integration | Android/iOS build and run against pinned SDK versions; callbacks and lifecycle operations work on devices |
| Live messaging | RN-to-RN and RN-to-official-client send/receive/history; interrupted sends; ordering and duplicate handling |
| Push | Foreground, background, terminated-app behavior, tap routing, denied permission, and user change using real test credentials |
| Package consumption | `npm pack` installed into clean bare-RN and Expo fixtures outside workspace symlink resolution |
| Release behavior | Android release with shrinking and iOS release configuration; no debug-only success assumptions |
| Performance | Bounded retained listeners, reconnect soak, representative long-history scrolling and burst events; record measured results |

Automate unit/contract/type/build checks in CI. Gate credentialed live tests behind controlled jobs and keep account secrets out of untrusted pull requests. Use React Native Testing Library for hooks/components with its installed-version reference. Choose one device automation tool after the initial build; manual, recorded device validation is still required for behaviors that automation cannot reliably cover.

Inspect native dependency architecture slices and Android 16 KB compatibility early. Package alignment alone is not enough: ELF alignment and runtime behavior of third-party binaries matter too. [Android native-library compatibility guidance](https://developer.android.com/guide/practices/page-sizes).

## Release and maintainer deliverables

- Clean-install quickstarts for bare RN and Expo, authenticated token-server setup, platform configuration and troubleshooting.
- Typed API reference with runnable examples and explicit version/feature matrix.
- README with community status, owner/maintainer identity, supported environments, architecture, limitations and contact path.
- LICENSE, third-party notices, contribution policy, security reporting instructions, changelog, migration policy and release checklist.
- Consumer package containing required source/spec/plugin files, compiled outputs/types, and notices; no secret files or repackaged vendor binaries.
- Reproducible CI builds and signed tags, with npm trusted publishing/provenance when the repository/package setup supports it. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
- A working demo, test evidence and short integration tutorial showing the SDK’s value to another RN developer.

The initial version should be a beta or release candidate until the advertised matrix passes. A 1.0 release requires stable public APIs, complete documentation for every exported feature, explicit behavior on both platforms, and no critical installation, account-isolation, messaging, or lifecycle defect.

## First implementation work order

1. Establish the author-owned repository and package identity; keep development private initially.
2. Pin the scaffold and selected skills, generate the library and example, and read its contributing guide.
3. Inventory both native SDKs and resolve their installable versions and terms.
4. Build the smallest direct native bridge: initialize, connection state, connect, direct text send/receive, disconnect and cleanup.
5. Run a bounded RongCloud comparison using the same Nexconn test users if the direct route reveals a meaningful advantage to test.
6. Record real Android/iOS results, freeze the route, and build outward using the parity matrix.

Inputs needed for live work are a Nexconn test application and region, server-side access to its credentials, two test users, and Android/iOS test devices or simulators. Push validation later needs APNs/FCM setup and appropriate iOS signing. These inputs are not needed to write the package scaffold, contracts, inventory or documentation skeleton.
