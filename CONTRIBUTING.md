# Contributing

Thanks for helping. Please read the [code of conduct](CODE_OF_CONDUCT.md)
first. For security issues, follow [SECURITY.md](SECURITY.md) instead of
opening an issue.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/` | TypeScript: the headless client (`core/`), React hooks (`react/`), test doubles (`testing/`) and the Codegen spec |
| `android/` | Kotlin bridge over `ai.nexconn.chat:chat` |
| `ios/` | Swift bridge over `NexconnChat` (plus the Objective-C++ TurboModule shell) |
| `plugin/`, `app.plugin.js` | Expo config plugin |
| `example/` | Expo development-build example |
| `example-cli/` | Community CLI example |
| `examples/shared/DemoApp.tsx` | The demo app both examples render |
| `examples/token-server/` | Development token server (keeps the App Secret off the device) |
| `tests/` | Node unit and contract tests; `tests/react/` has rendered hook tests (Jest) |
| `docs/` | The documentation site (VitePress). `docs/internal/` holds development records |
| `scripts/` | Parity generator, benchmark and cloud verification scripts |

## Setup

Use the Node version in `.nvmrc` and the Yarn release committed in
`.yarn/releases` (don't use npm in this repository):

```sh
yarn install
yarn check          # unit tests, hook tests, typecheck, lint, build
```

Other commands:

```sh
yarn test           # Node unit and wire-protocol contract tests
yarn test:react     # rendered hook tests (Jest + React Native Testing Library)
yarn bench          # JS performance and listener-leak checks
yarn docs:dev       # docs site at http://localhost:5173/react-native-nexconn/
node scripts/generate-parity.mjs   # regenerate docs/reference/parity.md
```

## Running the examples

Both examples need a Nexconn App Key and the token server
(`examples/token-server`). Expo Go is not supported.

```sh
yarn example:expo android                                  # expo run:android (or ios)
yarn example:cli android                                   # or ios
```

JavaScript changes reload without a rebuild; native changes need one.

## Changing the bridge

- A new bridge method needs its JavaScript call, the Kotlin and Swift
  handlers, and a regenerated parity matrix. `tests/protocol.test.mjs` fails
  if a method or event exists on only one side.
- If a platform's SDK has no equivalent, reject with `unsupported`. Never
  return empty data or success.
- Native changes must build on both platforms (`scripts/cloud/verify-*.sh`).
  Unit tests don't replace a two-user test on devices.

## Pull requests

- Keep each PR focused and describe how you verified it, saying which
  platforms and whether you used devices or simulators.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`fix:`, `feat:`, `docs:`, `chore:`…).
- Update `CHANGELOG.md` under "Unreleased" for user-visible changes.
- Never commit credentials, tokens, `google-services.json`, signing keys or
  build products.

## Releasing (maintainer)

1. Update `version` in `package.json` and move the "Unreleased" entries in
   `CHANGELOG.md` under that version.
2. Merge to `main`, then create a GitHub release with the tag `v<version>`.
   The Release workflow publishes to npm with provenance: to `latest`, or to
   `next` if the release is marked as a pre-release. Versions already on npm
   are skipped. It needs the `NPM_TOKEN` repository secret.
3. To publish by hand instead, run `npm publish --access public --tag latest`
   from `main`. npm requires an explicit tag for versions like `0.2.0-beta.0`.
