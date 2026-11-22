# Security

This is a community project. It is not an official Nexconn product, and
Nexconn does not support it.

## Reporting a vulnerability

Report suspected vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/Subramanyarao11/react-native-nexconn/security/advisories/new)
for this repository. Don't open a public issue or pull request.

Include the affected version or commit, the platform, steps to reproduce, and
the impact you expect. Leave out real tokens, App Secrets, message contents
and user data.

Vulnerabilities in the Nexconn native SDKs or service belong with Nexconn.
This project does not forward reports to vendors on anyone's behalf.

## How the package handles secrets

- **App Secret:** belongs only on your backend. The library never asks for
  it. Mobile apps get per-user tokens from an authenticated endpoint; see
  `examples/token-server`, which binds each token to the signed-in user.
- **Tokens:** passed straight to the native SDK. The library does not store
  or log them. The demo's event log shows event names and ids only.
- **Repository:** never commit credentials, tokens, push keys
  (`google-services.json`, APNs keys), device configuration or build
  products.

## Supported versions

Only the latest published version gets fixes while the package is in beta.
