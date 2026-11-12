export type IntegrationStatus = Readonly<{
  platform: 'android' | 'ios' | 'unsupported';
  nativeModuleLinked: boolean;
  sdkIntegrated: boolean;
  /** Version reported by the linked native Nexconn SDK, when integrated. */
  sdkVersion?: string;
}>;

/** Validate the native boundary rather than trusting an unchecked JSON cast. */
export function decodeIntegrationStatus(payload: string): IntegrationStatus {
  const value: unknown = JSON.parse(payload);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid native integration status');
  }
  const record = value as Record<string, unknown>;
  if (
    (record.platform !== 'android' && record.platform !== 'ios') ||
    typeof record.nativeModuleLinked !== 'boolean' ||
    typeof record.sdkIntegrated !== 'boolean' ||
    (record.sdkIntegrated && !record.nativeModuleLinked)
  ) {
    throw new Error('Invalid native integration status');
  }
  return {
    platform: record.platform,
    nativeModuleLinked: record.nativeModuleLinked,
    sdkIntegrated: record.sdkIntegrated,
    ...(typeof record.sdkVersion === 'string'
      ? { sdkVersion: record.sdkVersion }
      : {}),
  };
}
