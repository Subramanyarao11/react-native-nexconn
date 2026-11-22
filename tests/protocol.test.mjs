/**
 * Wire-protocol contract between the JS client and both native bridges.
 * Parses source files (no native toolchain needed) so a method or event that
 * exists on one side only is caught before a device build.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { NATIVE_EVENT_TYPES, PLATFORM_ONLY_EVENT_TYPES } from '../src/core/normalize.ts';

const root = new URL('..', import.meta.url).pathname;

function walk(dir, ext) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path, ext);
    return path.endsWith(ext) ? [path] : [];
  });
}

const read = (files) => files.map((f) => readFileSync(f, 'utf8')).join('\n');
const jsSource = read(walk(join(root, 'src'), '.ts'));
const kotlin = read(walk(join(root, 'android/src/main/java'), '.kt'));
const swift = read(walk(join(root, 'ios'), '.swift'));

// Every bridge method name literal (some are passed through helpers such as
// runSend/memberOp rather than directly to invoke()).
const jsMethods = new Set(
  [
    ...jsSource.matchAll(
      /'((?:engine|channel|message|group|open|community|user|translate|tag|query|push)\.[A-Za-z]+)'/g
    ),
  ].map((m) => m[1])
);
const androidMethods = new Set([...kotlin.matchAll(/\bon\("([a-z]+\.[A-Za-z]+)"\)/g)].map((m) => m[1]));
const iosMethods = new Set([...swift.matchAll(/\bon\("([a-z]+\.[A-Za-z]+)"\)/g)].map((m) => m[1]));

/** Capabilities that exist in only one vendor SDK (documented in docs/API.md). */
const ANDROID_ONLY = new Set([
  'channel.syncReadStatus',
  'group.addManagers',
  'group.removeManagers',
  'engine.setPushContentShowStatus',
  'engine.getPushContentShowStatus',
  'push.getPushType',
]);
// push.requestPermission: Android uses PermissionsAndroid in JS instead.
const IOS_ONLY = new Set(['engine.setDeviceToken', 'push.requestPermission']);

test('the JS client calls a non-trivial bridge surface', () => {
  assert.ok(jsMethods.size > 140, `only ${jsMethods.size} methods found`);
});

test('every JS method is implemented on Android unless iOS-only', () => {
  const missing = [...jsMethods].filter((m) => !androidMethods.has(m) && !IOS_ONLY.has(m));
  assert.deepEqual(missing, []);
});

test('every JS method is implemented on iOS unless Android-only', () => {
  const missing = [...jsMethods].filter((m) => !iosMethods.has(m) && !ANDROID_ONLY.has(m));
  assert.deepEqual(missing, []);
});

test('platform-only methods are really absent on the other platform', () => {
  for (const m of ANDROID_ONLY) assert.equal(iosMethods.has(m), false, `${m} exists on iOS`);
  for (const m of IOS_ONLY) assert.equal(androidMethods.has(m), false, `${m} exists on Android`);
});

test('native bridges expose no methods the JS client does not know', () => {
  const extraAndroid = [...androidMethods].filter((m) => !jsMethods.has(m) && m !== 'engine.getCapabilities');
  const extraIos = [...iosMethods].filter((m) => !jsMethods.has(m) && m !== 'engine.getCapabilities');
  assert.deepEqual(extraAndroid, []);
  assert.deepEqual(extraIos, []);
});

test('every query kind is created on both platforms', () => {
  const kinds = [...jsSource.matchAll(/new PagedQuery\(\s*this\.bridge,\s*'([A-Za-z]+)'/g)].map((m) => m[1]);
  assert.ok(kinds.length >= 18);
  for (const kind of kinds) {
    assert.ok(kotlin.includes(`"${kind}" ->`), `Android missing query kind ${kind}`);
    assert.ok(swift.includes(`case "${kind}":`), `iOS missing query kind ${kind}`);
  }
});

test('every SDK handler event is forwarded by both platforms', () => {
  for (const type of NATIVE_EVENT_TYPES) {
    const only = PLATFORM_ONLY_EVENT_TYPES[type];
    if (only !== 'ios') assert.ok(kotlin.includes(`"${type}"`), `Android does not emit ${type}`);
    if (only !== 'android') assert.ok(swift.includes(`"${type}"`), `iOS does not emit ${type}`);
  }
});

test('platform-only events are really absent on the other platform', () => {
  for (const [type, only] of Object.entries(PLATFORM_ONLY_EVENT_TYPES)) {
    const other = only === 'android' ? swift : kotlin;
    assert.equal(other.includes(`"${type}"`), false, `${type} is emitted on both platforms`);
  }
});

test('both platforms emit only push event types the JS layer models', () => {
  const known = new Set(NATIVE_EVENT_TYPES);
  for (const source of [kotlin, swift]) {
    for (const [, type] of source.matchAll(/emitPush\(\s*"([A-Za-z]+\.on[A-Za-z]+)"/g)) {
      assert.ok(known.has(type), `${type} is emitted natively but not translated in JS`);
    }
  }
});

test('both platforms emit only event types the JS layer models', () => {
  const known = new Set(NATIVE_EVENT_TYPES);
  const pattern = /emit\("([A-Za-z]+\.on[A-Za-z]+)"/g;
  for (const source of [kotlin, swift]) {
    for (const [, type] of source.matchAll(pattern)) {
      assert.ok(known.has(type), `${type} is emitted natively but not translated in JS`);
    }
  }
});

// C4: both SDKs clear a member's nickname when it is omitted, so both bridges
// must re-read the current nickname before an extra-only setMemberInfo.
test('group.setMemberInfo keeps the nickname when it is omitted, on both platforms', () => {
  const handler = (source, next) => {
    const start = source.indexOf('on("group.setMemberInfo")');
    assert.ok(start >= 0, 'handler exists');
    return source.slice(start, source.indexOf(`on("${next}")`, start));
  };
  for (const [name, block] of [
    ['Kotlin', handler(kotlin, 'group.addFavorites')],
    ['Swift', handler(swift, 'group.addFavorites')],
  ]) {
    assert.match(block, /getMembers\(/, `${name} reads the current member first`);
    assert.match(block, /nickname/, `${name} resends the nickname`);
  }
});
