import Nexconn from './NativeNexconn';
import { decodeIntegrationStatus, type IntegrationStatus } from './diagnostics';

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  return decodeIntegrationStatus(await Nexconn.getIntegrationStatus());
}
