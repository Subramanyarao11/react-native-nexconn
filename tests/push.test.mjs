import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePushNotification } from '../src/core/normalize.ts';
import { createMockClient } from '../src/testing/index.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));

const androidTap = (id, extra = {}) => ({
  id,
  platform: 'android',
  pushType: 'FCM',
  channelType: 1,
  channelId: 'bob',
  senderId: 'bob',
  objectName: 'RC:TxtMsg',
  title: 'Bob',
  body: 'hi',
  receivedTime: 1700000000000,
  notificationId: '42',
  raw: { toId: 'alice' },
  ...extra,
});

test('push methods do not require initialize and map statuses', async () => {
  const { client, transport } = createMockClient('ios');
  transport.on('push.getPermissionStatus', () => ({ status: 'undetermined', platform: 'ios' }));
  transport.on('push.requestPermission', (args) => {
    assert.equal(args.badge, false);
    return { status: 'granted', platform: 'ios' };
  });
  transport.on('push.getToken', () => ({ token: 'abcd', pushType: 'apns', platform: 'ios' }));
  assert.equal(await client.push.getPermissionStatus(), 'undetermined');
  assert.equal(await client.push.requestPermission({ badge: false }), 'granted');
  assert.deepEqual(await client.push.getToken(), { token: 'abcd', pushType: 'apns', platform: 'ios' });
});

test('Android requestPermission uses the installed requester, else the system setting', async () => {
  const { client, transport } = createMockClient('android');
  transport.on('push.getPermissionStatus', () => ({ status: 'denied', platform: 'android' }));
  assert.equal(await client.push.requestPermission(), 'denied');
  client.push.setAndroidPermissionRequester(async () => 'granted');
  assert.equal(await client.push.requestPermission(), 'granted');
  assert.equal(transport.calls.some((c) => c.method === 'push.requestPermission'), false);
});

test('getToken returns undefined when native has no token', async () => {
  const { client, transport } = createMockClient();
  transport.on('push.getToken', () => null);
  assert.equal(await client.push.getToken(), undefined);
});

test('onNotificationOpened delivers the cold-start tap once', async () => {
  const { client, transport } = createMockClient();
  let initial = androidTap('a-1');
  transport.on('push.getInitialNotification', () => {
    const value = initial;
    initial = null;
    return value;
  });
  const seen = [];
  const first = client.push.onNotificationOpened((n) => seen.push(n.id));
  const second = client.push.onNotificationOpened((n) => seen.push(`second:${n.id}`));
  await tick();
  assert.deepEqual(seen, ['a-1', 'second:a-1']);
  first();
  second();
});

test('a tap emitted before any listener is buffered, and duplicates are dropped', async () => {
  const { client, transport } = createMockClient();
  transport.on('push.getInitialNotification', () => null);
  transport.emit('Push.onNotificationOpened', androidTap('a-2'));
  const seen = [];
  const off = client.push.onNotificationOpened((n) => seen.push(n));
  await tick();
  transport.emit('Push.onNotificationOpened', androidTap('a-2'));
  transport.emit('Push.onNotificationOpened', androidTap('a-3'));
  assert.deepEqual(
    seen.map((n) => n.id),
    ['a-2', 'a-3']
  );
  assert.equal(seen[0].channelType, 1);
  assert.equal(seen[0].channelId, 'bob');
  off();
  transport.emit('Push.onNotificationOpened', androidTap('a-4'));
  assert.equal(seen.length, 2);
});

test('push events are delivered across session generations', async () => {
  const { client, transport } = createMockClient();
  transport.on('engine.initialize', () => ({ alreadyInitialized: false, platform: 'android', sdkVersion: '26.4.2' }));
  transport.on('engine.connect', () => ({ userId: 'alice', generation: 3 }));
  await client.initialize({ appKey: 'k' });
  await client.connect({ token: 't' });
  transport.generation = 3;
  const tokens = [];
  client.on('pushTokenReceived', (t) => tokens.push(t));
  transport.emit('Push.onTokenReceived', { token: 'fcm-token', pushType: 'FCM', platform: 'android' });
  assert.deepEqual(tokens, [{ token: 'fcm-token', pushType: 'FCM', platform: 'android' }]);
});

test('normalizePushNotification keeps known fields and drops unknown channel types', () => {
  const n = normalizePushNotification({
    id: 'ios-1',
    platform: 'ios',
    channelType: 99,
    channelId: 'g1',
    title: '',
    body: 'hello',
    receivedTime: 0,
    raw: { aps: { alert: 'hello' } },
  });
  assert.deepEqual(n, {
    id: 'ios-1',
    platform: 'ios',
    channelId: 'g1',
    body: 'hello',
    raw: { aps: { alert: 'hello' } },
  });
});

test('getPushType is Android only', async () => {
  const { client } = createMockClient('ios');
  await assert.rejects(client.push.getPushType(), (error) => error.category === 'unsupported');
});

test('clearNotification validates its id', async () => {
  const { client, transport } = createMockClient();
  transport.on('push.clearNotification', () => null);
  await client.push.clearNotification('42');
  assert.deepEqual(transport.calls.at(-1), { method: 'push.clearNotification', args: { notificationId: '42' } });
  assert.throws(() => client.push.clearNotification(''));
});

test('parseNotification reads a Nexconn APNs payload from another library', () => {
  const { client } = createMockClient('ios');
  const parsed = client.push.parseNotification(
    {
      aps: { alert: { title: 'Bob', body: 'hi' } },
      rc: { cType: 'GRP', tId: 'g1', fId: 'bob', oName: 'RC:TxtMsg', id: 'UID1' },
      appData: '{"route":"chat"}',
    },
    { id: 'req-1' }
  );
  assert.equal(parsed.id, 'req-1');
  assert.equal(parsed.channelType, 3);
  assert.equal(parsed.channelId, 'g1');
  assert.equal(parsed.senderId, 'bob');
  assert.equal(parsed.pushId, 'UID1');
  assert.equal(parsed.title, 'Bob');
  assert.equal(parsed.body, 'hi');
  assert.equal(parsed.pushData, '{"route":"chat"}');
  // rc nested under data and encoded as a string
  const nested = client.push.parseNotification({ data: { rc: '{"cType":"PR","tId":"alice"}' } });
  assert.equal(nested.channelType, 1);
  assert.equal(nested.channelId, 'alice');
  assert.equal(client.push.parseNotification({ aps: {} }), undefined);
  assert.equal(client.push.parseNotification(null), undefined);
});
