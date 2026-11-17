# Third-party notices

The repository was scaffolded using Callstack's create-react-native-library
0.64.0. Unmodified template portions retain their upstream rights. The skills
in .agents/skills were copied from the maintainer repositories at the revisions
recorded in .agents/skills/SOURCES.md; their license texts are retained alongside
them. Our project license does not restrict independently reusable upstream code.

## Nexconn native SDKs (dependencies, not redistributed)

The native bridges depend on, but do not contain or redistribute:

- Android: `ai.nexconn.chat:chat` (and optionally `ai.nexconn.chat:push-fcm`)
  from https://maven.nexconn.ai/repository/maven-releases/ — POM license:
  "Commercial License".
- iOS: CocoaPods `NexconnChat/Chat` (NexconnChatSDK, RongIMLibCore and RSIMLib
  xcframeworks downloaded from downloads.nexconn.ai) — podspec license:
  "Proprietary. Copyright (c) Nexconn. All rights reserved."

They are fetched by the consumer app's Gradle/CocoaPods build and remain under
Nexconn's terms (https://github.com/NexconnAI-Dev/nexconn-chat-sdk-flutter/blob/main/LICENSE
and the Nexconn terms of service). The bridge was written against the public
API of the published 26.4.2 artifacts (class signatures and documentation); no
Nexconn or RongCloud source code, including the Nexconn Flutter SDK, was copied.
Whether dependency-only distribution of this wrapper is permitted by those
terms has not been confirmed and must be reviewed before any distribution.

No RongCloud React Native wrapper code is used.
