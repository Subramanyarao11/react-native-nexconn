# react-native-nexconn

Private development of a community React Native Chat SDK for Nexconn.
The goal is one typed library for Android/iOS consumers using either
React Native Community CLI or Expo development builds.

**Status: bootstrap. Chat, authentication, media and push are not implemented.**
The current native diagnostic only reports whether the scaffold is linked.
It explicitly reports `sdkIntegrated: false` until a vendor SDK is integrated.
The package is private and is not ready for application use or publication.

## Development

Use Node 24 and the Yarn version committed in .yarn/releases:

```sh
yarn install
yarn check
yarn example:expo start
yarn example:cli start
```

See docs/BUILD_PLAN.md for the complete plan, docs/CLOUD_SETUP.md for remote
setup, and docs/STATUS.md for actual verification. For the generated development
workflow read CONTRIBUTING.md. There is no Expo dependency in the core library.

## Compatibility targets

| Consumer | Target | Current evidence |
| --- | --- | --- |
| Community CLI | RN 0.88.1 / React 19.3.0, Android and iOS | Fixture scaffolded; native builds pending |
| Expo | SDK 58 development builds, Android and iOS | Fixture scaffolded; prebuild and native builds pending |
| Expo Go | Unsupported custom native SDK | Not a target |

This is an independent community project and is not endorsed by Nexconn or
RongCloud. Original-source licensing is pending; upstream rights remain intact.
