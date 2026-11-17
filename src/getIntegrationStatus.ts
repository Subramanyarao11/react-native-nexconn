import type { IntegrationStatus } from './diagnostics.ts';

/** Non-native environments do not provide the mobile Chat SDK. */
export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  return {
    platform: 'unsupported',
    nativeModuleLinked: false,
    sdkIntegrated: false,
  };
}
