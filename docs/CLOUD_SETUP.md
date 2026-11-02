# Cloud environment setup

Use only the private repository Subramanyarao11/react-native-nexconn.
Keep environment access private to the owner. Do not add production credentials.

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
