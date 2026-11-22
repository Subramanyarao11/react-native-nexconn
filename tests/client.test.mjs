import assert from 'node:assert/strict';
import test from 'node:test';
import { ConnectionStatus } from '../src/core/enums.ts';
import { NexconnError } from '../src/core/errors.ts';
import { createMockClient, fixtures, MockTransport } from '../src/testing/index.ts';

function initialized() {
  const { client, transport } = createMockClient();
  transport.on('engine.initialize', () => ({
    alreadyInitialized: false,
    platform: 'android',
    sdkVersion: '26.4.2',
  }));
  return { client, transport };
}

test('initialize is idempotent for the same App Key and rejects a different one', async () => {
  const { client, transport } = initialized();
  const first = await client.initialize({ appKey: 'key-a' });
  const again = await client.initialize({ appKey: 'key-a' });
  assert.equal(first, again);
  assert.equal(transport.calls.filter((c) => c.method === 'engine.initialize').length, 1);
  await assert.rejects(client.initialize({ appKey: 'key-b' }), (error) => {
    assert.ok(error instanceof NexconnError);
    assert.equal(error.category, 'already_initialized');
    return true;
  });
  assert.equal(client.getSnapshot().initialized, true);
});

test('concurrent connect calls share one native attempt', async () => {
  const { client, transport } = initialized();
  let release;
  transport.on('engine.connect', () => new Promise((resolve) => {
    release = () => resolve({ userId: 'alice', generation: 1 });
  }));
  const a = client.connect({ token: 't' });
  const b = client.connect({ token: 't' });
  assert.equal(client.getSnapshot().isConnecting, true);
  release();
  assert.deepEqual(await a, { userId: 'alice', generation: 1 });
  assert.deepEqual(await b, { userId: 'alice', generation: 1 });
  assert.equal(transport.calls.filter((c) => c.method === 'engine.connect').length, 1);
  const snap = client.getSnapshot();
  assert.equal(snap.userId, 'alice');
  assert.equal(snap.connectionStatus, ConnectionStatus.connected);
  assert.equal(snap.isConnecting, false);
});

test('connect errors are decoded with native code and category', async () => {
  const { client, transport } = initialized();
  transport.on('engine.connect', () => {
    throw MockTransport.nativeError(31004, 'token incorrect', 'engine.connect');
  });
  await assert.rejects(client.connect({ token: 'bad' }), (error) => {
    assert.equal(error.category, 'native');
    assert.equal(error.nativeCode, 31004);
    assert.equal(error.method, 'engine.connect');
    return true;
  });
  assert.equal(client.getSnapshot().isConnecting, false);
});

test('the token is passed to native code but never stored in the snapshot', async () => {
  const { client, transport } = initialized();
  transport.on('engine.connect', () => ({ userId: 'alice', generation: 1 }));
  await client.connect({ token: 'secret-token' });
  assert.equal(JSON.stringify(client.getSnapshot()).includes('secret-token'), false);
  assert.equal(transport.calls.find((c) => c.method === 'engine.connect').args.token, 'secret-token');
});

test('connectWithTokenProvider retries once with a fresh token on tokenIncorrect', async () => {
  const { client, transport } = initialized();
  const tokens = ['expired', 'fresh'];
  transport.on('engine.connect', ({ token }) => {
    if (token === 'expired') throw MockTransport.nativeError(31004, 'expired');
    return { userId: 'alice', generation: 2 };
  });
  transport.on('engine.getConnectionStatus', () => ConnectionStatus.tokenIncorrect);
  const result = await client.connectWithTokenProvider({ tokenProvider: async () => tokens.shift() });
  assert.equal(result.userId, 'alice');
  assert.equal(tokens.length, 0);
});

test('events from an older session generation are dropped', async () => {
  const { client, transport } = initialized();
  transport.on('engine.connect', () => ({ userId: 'bob', generation: 3 }));
  await client.connect({ token: 't' });
  const received = [];
  client.on('messageReceived', (e) => received.push(e.message.messageId));
  transport.emit('MessageHandler.onMessageReceived', { message: fixtures.textMessage({ messageId: 'old' }) }, { generation: 2 });
  transport.emit('MessageHandler.onMessageReceived', { message: fixtures.textMessage({ messageId: 'new' }) }, { generation: 3 });
  assert.deepEqual(received, ['new']);
});

test('connection status events always update the snapshot', () => {
  const { client, transport } = initialized();
  const seen = [];
  const unsubscribe = client.subscribe(() => seen.push(client.getSnapshot().connectionStatus));
  transport.emit('ConnectionStatusHandler.onConnectionStatusChanged', { status: ConnectionStatus.kickedOfflineByOtherClient }, { generation: 0 });
  assert.deepEqual(seen, [ConnectionStatus.kickedOfflineByOtherClient]);
  unsubscribe();
});

test('disconnect advances the generation and clears the user', async () => {
  const { client, transport } = initialized();
  transport.on('engine.connect', () => ({ userId: 'bob', generation: 1 }));
  transport.on('engine.disconnect', () => ({ generation: 2 }));
  await client.connect({ token: 't' });
  await client.disconnect();
  const snap = client.getSnapshot();
  assert.equal(snap.userId, undefined);
  assert.equal(snap.generation, 2);
  assert.equal(snap.connectionStatus, ConnectionStatus.unconnected);
  assert.deepEqual(transport.calls.find((c) => c.method === 'engine.disconnect').args, { disablePush: false });
});

test('listener unsubscribe is idempotent and does not affect other listeners', () => {
  const { client, transport } = initialized();
  const a = [];
  const b = [];
  const offA = client.on('offlineMessageSyncCompleted', () => a.push(1));
  client.on('offlineMessageSyncCompleted', () => b.push(1));
  offA();
  offA();
  transport.emit('MessageHandler.onOfflineMessageSyncCompleted', {});
  assert.deepEqual(a, []);
  assert.deepEqual(b, [1]);
});

test('a throwing listener does not block delivery to others', () => {
  const { client, transport } = initialized();
  const delivered = [];
  const originalError = console.error;
  console.error = () => {};
  client.on('tagChanged', () => {
    throw new Error('listener bug');
  });
  client.on('tagChanged', () => delivered.push(true));
  transport.emit('TagHandler.onTagChanged', {});
  console.error = originalError;
  assert.deepEqual(delivered, [true]);
});

test('send rejects media content and validates the channel before calling native', async () => {
  const { client, transport } = initialized();
  await assert.rejects(
    client.messages.send({ channelType: 1, channelId: 'bob' }, { type: 'image', localPath: '/a.jpg' }),
    (error) => error.category === 'invalid_argument'
  );
  await assert.rejects(
    client.messages.send({ channelType: 99, channelId: 'bob' }, { type: 'text', text: 'x' }),
    (error) => error.category === 'invalid_argument'
  );
  assert.equal(transport.calls.length, 0);
});

test('sendMedia routes attach and progress events to its own callbacks', async () => {
  const { client, transport } = initialized();
  transport.on('message.sendMedia', ({ opId }) => {
    transport.emit('op.attached', { message: fixtures.textMessage({ messageId: null, clientId: 7 }) }, { opId });
    transport.emit('op.progress', { progress: 50 }, { opId });
    transport.emit('op.progress', { progress: 99 }, { opId: 'someone-else' });
    return fixtures.textMessage({ clientId: 7, messageId: 'SRV-7' });
  });
  const attached = [];
  const progress = [];
  const sent = await client.messages.sendMedia(
    { channelType: 1, channelId: 'bob' },
    { type: 'file', localPath: '/tmp/a.pdf' },
    { onAttached: (m) => attached.push(m.clientId), onProgress: (p) => progress.push(p) }
  );
  assert.deepEqual(attached, [7]);
  assert.deepEqual(progress, [50]);
  assert.equal(sent.messageId, 'SRV-7');
  const call = transport.calls.find((c) => c.method === 'message.sendMedia');
  assert.equal('onProgress' in call.args.options, false);
});

test('send failure carries the failed local message for retry UIs', async () => {
  const { client, transport } = initialized();
  transport.on('message.send', () => {
    throw new Error(JSON.stringify({
      category: 'native',
      code: 20604,
      message: 'blocked',
      method: 'message.send',
      detail: fixtures.textMessage({ sentStatus: 20 }),
    }));
  });
  await assert.rejects(client.messages.send({ channelType: 1, channelId: 'bob' }, { type: 'text', text: 'hi' }), (error) => {
    assert.equal(error.nativeCode, 20604);
    assert.equal(error.detail.sentStatus, 20);
    return true;
  });
});

test('paged queries are created lazily, paginate, and become stale after reconnect', async () => {
  const { client, transport } = initialized();
  let page = 0;
  transport.on('engine.connect', () => ({ userId: 'a', generation: transport.generation }));
  transport.on('query.create', () => ({ queryId: 'q1' }));
  transport.on('query.loadNextPage', () => {
    page += 1;
    return { items: page === 1 ? [fixtures.directChannel()] : [], hasMore: page === 1 };
  });
  transport.on('query.release', () => null);
  transport.generation = 1;
  await client.connect({ token: 't' });

  const query = client.channels.createChannelsQuery({ channelTypes: [1] });
  assert.equal(transport.calls.some((c) => c.method === 'query.create'), false);
  const first = await query.loadNextPage();
  assert.equal(first.items[0].channelId, 'bob');
  assert.equal(query.hasMore, true);
  const second = await query.loadNextPage();
  assert.equal(second.items.length, 0);
  assert.equal(query.hasMore, false);

  transport.generation = 2;
  await client.connect({ token: 't' });
  await assert.rejects(query.loadNextPage(), (error) => error.category === 'stale_session');
  await query.release();
  await assert.rejects(query.loadNextPage(), (error) => error.category === 'not_found');
});

test('concurrent loadNextPage calls share the in-flight request', async () => {
  const { client, transport } = initialized();
  transport.on('query.create', () => ({ queryId: 'q1' }));
  let loads = 0;
  transport.on('query.loadNextPage', async () => {
    loads += 1;
    return { items: [], hasMore: false };
  });
  const query = client.messages.createMessagesQuery({ channel: { channelType: 1, channelId: 'bob' } });
  await Promise.all([query.loadNextPage(), query.loadNextPage()]);
  assert.equal(loads, 1);
});

test('unsupported platform methods reject explicitly instead of faking success', async () => {
  const { client } = initialized();
  await assert.rejects(client.channels.syncReadStatus({ channelType: 1, channelId: 'bob' }, 1), (error) => {
    assert.equal(error.category, 'unsupported');
    return true;
  });
});

test('device token validation happens before native code', async () => {
  const { client, transport } = initialized();
  await assert.rejects(client.notifications.setDeviceToken('xyz'), (e) => e.category === 'invalid_argument');
  assert.equal(transport.calls.length, 0);
});

test('dispose detaches from the transport', () => {
  const { client, transport } = initialized();
  assert.equal(transport.listenerCount, 1);
  client.dispose();
  assert.equal(transport.listenerCount, 0);
});

test('restoreSession adopts a native session that survived a JS reload', async () => {
  const { client, transport } = createMockClient();
  transport.on('engine.getSessionState', () => ({
    initialized: true,
    connectionStatus: ConnectionStatus.connected,
    userId: 'alice',
    generation: 4,
  }));
  const snap = await client.restoreSession();
  assert.equal(snap.initialized, true);
  assert.equal(snap.userId, 'alice');
  assert.equal(snap.connectionStatus, ConnectionStatus.connected);
  assert.equal(snap.generation, 4);
  // Events from the restored session are delivered; older ones are not.
  const seen = [];
  client.on('messageReceived', (e) => seen.push(e.message.messageId));
  transport.emit('MessageHandler.onMessageReceived', { message: fixtures.textMessage({ messageId: 'old' }) }, { generation: 3 });
  transport.emit('MessageHandler.onMessageReceived', { message: fixtures.textMessage({ messageId: 'now' }) }, { generation: 4 });
  assert.deepEqual(seen, ['now']);
});

test('restoreSession leaves state untouched when the SDK is not initialized', async () => {
  const { client, transport } = createMockClient();
  transport.on('engine.getSessionState', () => ({ initialized: false, generation: 0 }));
  const snap = await client.restoreSession();
  assert.equal(snap.initialized, false);
  assert.equal(snap.userId, undefined);
});

test('initialize after a JS reload restores the native session', async () => {
  const { client, transport } = createMockClient();
  transport.on('engine.initialize', () => ({ alreadyInitialized: true, platform: 'ios', sdkVersion: '26.4.2' }));
  transport.on('engine.getSessionState', () => ({
    initialized: true,
    connectionStatus: ConnectionStatus.connected,
    userId: 'bob',
    generation: 2,
  }));
  const result = await client.initialize({ appKey: 'k' });
  assert.equal(result.alreadyInitialized, true);
  assert.equal(client.getSnapshot().userId, 'bob');
  assert.equal(client.getSnapshot().generation, 2);
});

test('open channel enter resolves with the Android onEntered response', async () => {
  const { client, transport } = initialized();
  await client.initialize({ appKey: 'k' });
  transport.on('open.enter', () => {
    setImmediate(() => {
      transport.emit('OpenChannelHandler.onEntered', { channelId: 'other', response: { participantCount: 1 } });
      transport.emit('OpenChannelHandler.onEntered', { channelId: 'room', response: { participantCount: 7 } });
    });
    return null;
  });
  const response = await client.openChannels.enter('room');
  assert.equal(response.participantCount, 7);
});

test('open channel enter rejects on a matching onEnterFailed and times out to undefined', async () => {
  const { client, transport } = initialized();
  await client.initialize({ appKey: 'k' });
  transport.on('open.enter', () => {
    setImmediate(() =>
      transport.emit('OpenChannelHandler.onEnterFailed', { channelId: 'room', error: { code: 23410, message: 'nope' } })
    );
    return null;
  });
  await assert.rejects(client.openChannels.enter('room'), (e) => e.category === 'native' && e.nativeCode === 23410);
  transport.on('open.enter', () => null);
  assert.equal(await client.openChannels.enter('quiet', { responseTimeoutMs: 5 }), undefined);
});
