# Example token server

Development-only server that issues Nexconn access tokens to **authenticated**
demo users. It binds each token to the signed-in user; clients cannot request
a token for an arbitrary user id. The App Secret stays on this server.

```sh
export NEXCONN_APP_KEY=...            # from the Nexconn console
export NEXCONN_APP_SECRET=...         # never put this in the mobile app
export NEXCONN_API_BASE=https://api.sg-light-api.com   # match your data center
export DEMO_USERS="alice:alicepass,bob:bobpass"
node examples/token-server/server.mjs
```

Endpoints:

| Method | Path | Body / header | Result |
| --- | --- | --- | --- |
| POST | `/login` | `{"userId","password"}` | `{"sessionToken","userId"}` |
| POST | `/nexconn/token` | `Authorization: Bearer <sessionToken>` | `{"userId","accessToken"}` |
| POST | `/logout` | `Authorization: Bearer <sessionToken>` | `{"ok":true}` |
| GET | `/health` | — | `{"ok":true}` |

The example apps read the server URL from `EXPO_PUBLIC_TOKEN_SERVER_URL`
(Expo) or `example-cli/src/config.ts` (CLI). On an Android emulator use
`http://10.0.2.2:8787`; on the iOS simulator `http://localhost:8787`.

Signing follows the documented Nexconn scheme: `Signature = SHA1(AppSecret +
Nonce + Timestamp)` with the `App-Key`, `Nonce`, `Timestamp` headers, calling
`POST /v4/auth/access-token/issue`. Not yet exercised against a live account.
