import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeIntegrationStatus } from '../src/diagnostics.ts';

test('a linked bridge does not imply that the vendor SDK is integrated', () => {
  const status = decodeIntegrationStatus(
    JSON.stringify({
      platform: 'ios',
      nativeModuleLinked: true,
      sdkIntegrated: false,
    })
  );
  assert.equal(status.nativeModuleLinked, true);
  assert.equal(status.sdkIntegrated, false);
});

test('rejects malformed native payloads and inconsistent capabilities', () => {
  for (const value of [
    null,
    [],
    {},
    { platform: 'web' },
    {
      platform: 'android',
      nativeModuleLinked: 'true',
      sdkIntegrated: false,
    },
    {
      platform: 'android',
      nativeModuleLinked: false,
      sdkIntegrated: true,
    },
  ]) {
    assert.throws(() => decodeIntegrationStatus(JSON.stringify(value)));
  }
  assert.throws(() => decodeIntegrationStatus('not-json'));
});
