# Project instructions

Build the full community React Native Chat SDK described in docs/internal/BUILD_PLAN.md.
Read docs/reference/status.md before working; update it with verified results and limits.

## Required skills

- Read .agents/skills/create-react-native-library/SKILL.md and its scaffold
  reference when changing package/native setup. Use the generated Yarn workflow.
- Read .agents/skills/react-native-best-practices/SKILL.md for native threading,
  event/lifecycle cleanup and measured performance work.
- Read .agents/skills/expo-module/SKILL.md for Expo configuration/lifecycle work.
- Read .agents/skills/react-native-testing/SKILL.md when adding React tests;
  detect the actual installed testing-library version first.
- Read .agents/skills/github-actions/SKILL.md when changing native CI builds.

## Product boundaries

- Support both Community CLI (example-cli) and Expo development builds (example).
- Keep the headless library independent of Expo. Expo Go is not supported.
- Prefer official Nexconn native dependencies. Evaluate RongCloud only against
  real Nexconn credentials, regions, payloads and feature availability.
- Never copy Nexconn's Flutter source or vendor SDK binaries into this package.
- The project is MIT licensed and published to npm as
  `@subramanyarao11/react-native-nexconn`. Releases are made by the maintainer;
  agents don't publish, tag releases, change repository settings or contact
  the vendor. Never claim official endorsement.
- Never commit credentials, token values, private device configuration, build
  products or node_modules. App Secret belongs on an authenticated backend.
- No fake chat success: mark unimplemented capabilities honestly. A linked native
  module is not evidence that the Nexconn SDK or service works.

## Workflow

- Use the committed Yarn version and lockfile; do not mix package managers.
- Run yarn check for JavaScript/package changes once dependencies are installed.
- Validate Codegen and both native build paths when native code changes.
- Packed-tarball consumer installation is required before compatibility claims.
- Unit tests do not replace live two-user messaging or physical-device push tests.
- Run iOS/macOS validation on the Mac or an appropriate CI runner. Cloud setup
  alone must not be reported as a successful native device build.
- Keep work focused; do not spawn subagents without explicit user instructions.
