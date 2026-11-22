# Cloud environment setup

Use only the private repository Subramanyarao11/react-native-nexconn.
Keep environment access private to the owner. Do not add production credentials.

## Verified setup status, 2 November 2026

The private environment is named `@subramanyarao11/react-native-nexconn`. Cloud onboarding
installed dependencies using Yarn 4.18.1, then passed the two diagnostic tests,
TypeScript, ESLint and the Bob package build. It left tracked files unchanged
and generated an untracked `yarn.lock`; review and commit that lockfile during
the first implementation task. Peer-dependency warnings remain unresolved.
The 2 November publication attempt failed with "Couldn't publish environment"
and "Your settings are saved. Try publishing again." The saved environment is
still not runnable when checked on 3 November. No cloud implementation task has
started. Native builds and live Nexconn behavior remain unverified.

The documented Plus defaults are 2 vCPUs, 8 GiB RAM and 8 GiB disk. These are
plan defaults, not a measurement of this VM. Use the Mac for iOS Simulator and
Android emulator testing at native milestones; Android virtualization support
has not been verified in the cloud environment. See the [official VM
specifications](https://learn.chatgpt.com/docs/environments/cloud-environments#vm-specifications).

## Reproducing the setup

Prepare Node 24.22.x or another compatible Node 24 patch, then run from repo root:

```sh
node --version
node .yarn/releases/yarn-4.18.1.cjs --version
node .yarn/releases/yarn-4.18.1.cjs install
node .yarn/releases/yarn-4.18.1.cjs check
```

The first install creates yarn.lock; record and commit it in the first coding
task. Subsequent installs should use --immutable. Use project-local skills from
.agents/skills and follow AGENTS.md. No native SDK toolchain or app credentials
are required for the initial TypeScript and package checks.

Report each command and its result, then publish the prepared environment after
the checks pass. Leave native validation explicitly pending for the Mac/CI.
If an install or check fails, resolve the actual error before reporting success.

For Expo native work, use SDK 58 documentation, and use Expo CLI to resolve
compatible Expo packages. The dev-client dependency/configuration must be
verified before claiming the Expo example is runnable.

## Cloud and native validation

Cloud handles source changes, types, unit/contract tests, package builds and docs.
Native CI/Mac handles the four consumer build combinations and device behavior.
Keep native CI manual until its versions, costs and actual builds are verified.
Do not start paid EAS builds or publish the npm package as part of setup.
