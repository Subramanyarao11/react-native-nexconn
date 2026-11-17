import Nexconn from './NativeNexconn';
import {
  decodeIntegrationStatus,
  type IntegrationStatus,
} from './diagnostics.ts';

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  if (!Nexconn) {
    return {
      platform: 'unsupported',
      nativeModuleLinked: false,
      sdkIntegrated: false,
    };
  }
  return decodeIntegrationStatus(await Nexconn.getIntegrationStatus());
}
