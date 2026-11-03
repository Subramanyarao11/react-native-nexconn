# First cloud implementation milestone

Continue the private community React Native Chat SDK in
`Subramanyarao11/react-native-nexconn`. Read `AGENTS.md`, `docs/STATUS.md` and
`docs/BUILD_PLAN.md`, then follow the applicable project-local Callstack and
Expo skills. Preserve the current package scaffold and both consumer fixtures.
The environment must be published and runnable before this task starts.

## Outcome

Deliver a reviewable first integration of initialization, connection, direct
text send/receive and disconnect through the official Nexconn native SDKs.
Support Community CLI and Expo development builds on Android and iOS. Keep
unverified runtime behavior clearly marked and document any concrete blockers.

## First checks

1. Inspect the managed environment's runtime status and supported network-policy
   snapshot before network work. Use the existing isolated checkout; do not
   create additional worktrees, chats or subagents.
2. Confirm Node 24 and the committed Yarn 4.18.1 executable. Review the setup's
   generated `yarn.lock`, ensure it matches all three manifests, and commit it.
   Investigate peer warnings using Yarn's actual peer-requirements output.
   Do not hide warnings or upgrade the toolchain without a reason.
3. Run the existing `check` script and record the baseline. The two diagnostic
   tests, typecheck, lint and Bob build passed during onboarding; native code
   and the service have not been validated.

## Integration work

- Read current official Android and iOS installation, initialization,
  connection, messaging, handler-removal and lifecycle documentation. Pin actual
  published native dependency versions. Confirm imports and callback signatures
  against official artifacts or headers; do not guess them from the quickstart.
- Prefer Gradle and CocoaPods dependencies on official Nexconn SDKs. Do not
  vendor binaries, copy the Nexconn Flutter implementation or substitute
  RongCloud silently. Record an API evidence matrix with source URLs, versions
  and any unresolved SDK publication terms.
- Determine the supported native initialization phase and thread before
  exposing initialization to JavaScript. The quickstarts place initialization
  in Application/AppDelegate startup. Explain how CLI users and the optional
  Expo configuration meet the verified requirement.
- Add typed public APIs and Codegen declarations. Represent connection state,
  errors, received text and send acknowledgements consistently on both
  platforms. Avoid logging access tokens or inventing successful responses.
- Register handlers before connection so offline messages are not missed.
  Subscriptions must be removable. Clean up handlers during native invalidation
  and account changes; prevent callbacks from an old session reaching a new one.
  Reject concurrent or unsupported lifecycle operations predictably.
- Update the existing CLI and Expo examples to exercise the same public API.
  Fetch per-user tokens through a configured authenticated backend. Never put
  App Secret or fixed access tokens in source, examples or screenshots. If real
  test credentials are unavailable, complete the independent code and build
  work and identify exactly what is needed for live verification.

## Verification and handoff

- Run meaningful contract/lifecycle/error-boundary tests, TypeScript, lint,
  Codegen and the package build. Test a packed tarball in independent consumers
  so workspace symlinks cannot conceal packaging problems.
- Attempt native compilation only when the matching toolchain is available.
  Do not treat JavaScript tests, Codegen or downloading a native SDK as proof
  that native code compiles. iOS requires the Mac or a macOS runner. Android
  emulator acceleration in this cloud environment is unverified.
- Provide exact Mac commands for Android/iOS validation of both consumer
  fixtures. Keep live two-user messaging, reconnect/account-switch tests and
  physical-device push checks pending until actually exercised.
- Update `docs/STATUS.md` with changed behavior, executed checks, failures and
  remaining work. Commit the reviewable changes and report the commit or draft
  PR, if repository permissions permit. Keep the repository/package private.
  Do not publish npm releases, change visibility, finalize licensing, contact
  Nexconn, start paid builds or claim official endorsement.

Start with the lockfile and actual native API inventory, then carry the
integration through as far as the available environment and credentials allow.
