// Expo inlines `process.env.EXPO_PUBLIC_*` at build time. Declared here so the
// example type-checks without pulling Node types into a React Native app.
declare var process: { env: Record<string, string | undefined> };
