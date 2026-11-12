import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NexconnError,
  createNexconnClient,
  decodeMessage,
  toNexconnError,
} from '../src/core.ts';

const textMessage = {
  messageId: 'srv-1',
  clientId: 7,
  channelType: 'direct',
  channelId: 'bob',
  direction: 'receive',
  senderUserId: 'bob',
  sentTime: 1762950000123,
  messageType: 'RC:TxtMsg',
  contentType: 'text',
  text: 'hello',
};

/** A controllable stand-in for the native module. It never fakes the service. */
function fakeTransport() {
  const calls = [];
  const listeners = { status: new Set(), message: new Set() };
  const pending = [];
  const listen = (set) => (listener) => {
    set.add(listener);
    return { remove: () => set.delete(listener) };
  };
  const deferred = (name) =>
    (...args) => {
      calls.push([name, ...args]);
      return new Promise((resolve, reject) =>
        pending.push({ name, args, resolve, reject })
      );
    };
  return {
    calls,
    listeners,
    pending,
    emit: (kind, value) =>
      [...listeners[kind]].forEach((listener) =>
        listener(typeof value === 'string' ? value : JSON.stringify(value))
      ),
    transport: {
      initialize: async (...args) => void calls.push(['initialize', ...args]),
      connect: deferred('connect'),
      disconnect: async (...args) => void calls.push(['disconnect', ...args]),
      getConnectionStatus: async () => 0,
      sendDirectText: deferred('sendDirectText'),
      onConnectionStatusChanged: listen(listeners.status),
      onMessageReceived: listen(listeners.message),
    },
  };
}

async function connected(fake, client) {
  const promise = client.connect({ token: 'token-a' });
  const call = fake.pending.pop();
  call.resolve(JSON.stringify({ userId: 'alice' }));
  await promise;
  return call.args[2];
}

test('listens before connecting and resolves the connected user', async () => {
  const fake = fakeTransport();
  const client = createNexconnClient(fake.transport);
  const promise = client.connect({ token: 'token-a', timeoutSeconds: 5 });
  assert.equal(fake.listeners.status.size, 1);
  assert.equal(fake.listeners.message.size, 1);
  const call = fake.pending.pop();
  assert.deepEqual(call.args.slice(0, 2), ['token-a', 5]);
  call.resolve(JSON.stringify({ userId: 'alice' }));
  assert.deepEqual(await promise, { userId: 'alice' });
});

test('rejects a second connect while a session exists', async () => {
  const fake = fakeTransport();
  const client = createNexconnClient(fake.transport);
  client.connect({ token: 'token-a' }).catch(() => {});
  await assert.rejects(client.connect({ token: 'token-b' }), {
    category: 'invalidState',
  });
  assert.equal(fake.calls.filter(([name]) => name === 'connect').length, 1);
});

test('a failed connect releases the session and keeps the native code', async () => {
  const fake = fakeTransport();
  const client = createNexconnClient(fake.transport);
  const promise = client.connect({ token: 'expired' });
  fake.pending.pop().reject({ code: 'nexconn/native/31020', message: 'expired' });
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof NexconnError);
    assert.equal(error.category, 'token');
    assert.equal(error.nativeCode, 31020);
    assert.equal(error.operation, 'connect');
    return true;
  });
  assert.equal(fake.listeners.message.size, 0);
  const retry = client.connect({ token: 'fresh' });
  fake.pending.pop().resolve(JSON.stringify({ userId: 'alice' }));
  await retry;
});

test('delivers events for the active session and decodes them', async () => {
  const fake = fakeTransport();
  const client = createNexconnClient(fake.transport);
  const statuses = [];
  const messages = [];
  client.addConnectionStatusListener((event) => statuses.push(event));
  const subscription = client.addMessageListener((event) => messages.push(event));
  const sessionId = await connected(fake, client);

  fake.emit('status', { sessionId, status: 0 });
  fake.emit('status', { sessionId, status: 999 });
  fake.emit('message', { sessionId, message: textMessage, offline: true, left: 2 });
  assert.deepEqual(statuses, [
    { status: 'connected', nativeStatusCode: 0 },
    { status: 'unknown', nativeStatusCode: 999 },
  ]);
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].message.content, { type: 'text', text: 'hello' });
  assert.equal(messages[0].offline, true);
  assert.equal(messages[0].left, 2);

  subscription.remove();
  fake.emit('message', { sessionId, message: textMessage });
  assert.equal(messages.length, 1);
});

test('events from a previous account never reach the next session', async () => {
  const fake = fakeTransport();
  const client = createNexconnClient(fake.transport);
  const messages = [];
  client.addMessageListener((event) => messages.push(event));
  const first = await connected(fake, client);
  const staleListeners = [...fake.listeners.message];

  await client.disconnect();
  assert.equal(fake.listeners.message.size, 0);
  assert.deepEqual(fake.calls.at(-1), ['disconnect', false]);

  const second = await connected(fake, client);
  assert.notEqual(first, second);
  // A late native callback tagged with the old session, via old and new paths.
  const stale = JSON.stringify({ sessionId: first, message: textMessage });
  staleListeners.forEach((listener) => listener(stale));
  fake.emit('message', stale);
  assert.equal(messages.length, 0);
  fake.emit('message', { sessionId: second, message: textMessage });
  assert.equal(messages.length, 1);
});

test('disconnect during connect does not report a connected session', async () => {
  const fake = fakeTransport();
  const client = createNexconnClient(fake.transport);
  const promise = client.connect({ token: 'token-a' });
  await client.disconnect({ disablePush: true });
  fake.pending.pop().resolve(JSON.stringify({ userId: 'alice' }));
  await assert.rejects(promise, { category: 'sessionChanged' });
  await assert.rejects(
    client.sendDirectText({ targetUserId: 'bob', text: 'hi' }),
    { category: 'invalidState' }
  );
});

test('send requires a connection, validates input and decodes the result', async () => {
  const fake = fakeTransport();
  const client = createNexconnClient(fake.transport);
  await assert.rejects(
    client.sendDirectText({ targetUserId: 'bob', text: 'hi' }),
    { category: 'invalidState' }
  );
  await connected(fake, client);
  await assert.rejects(client.sendDirectText({ targetUserId: 'bob', text: '' }), {
    category: 'invalidArgument',
  });

  const sent = client.sendDirectText({ targetUserId: 'bob', text: 'hi' });
  fake.pending
    .pop()
    .resolve(JSON.stringify({ ...textMessage, direction: 'send', text: 'hi' }));
  assert.equal((await sent).content.text, 'hi');

  const failed = client.sendDirectText({ targetUserId: 'bob', text: 'hi' });
  fake.pending.pop().reject({ code: 'nexconn/native/405', message: 'rejected' });
  await assert.rejects(failed, { category: 'native', nativeCode: 405 });

  const malformed = client.sendDirectText({ targetUserId: 'bob', text: 'hi' });
  fake.pending.pop().resolve('{"clientId":"7"}');
  await assert.rejects(malformed, { category: 'invalidPayload' });
});

test('malformed events are reported, not delivered or thrown', async () => {
  const fake = fakeTransport();
  const client = createNexconnClient(fake.transport);
  const errors = [];
  const messages = [];
  client.addErrorListener((error) => errors.push(error));
  client.addMessageListener((event) => messages.push(event));
  const sessionId = await connected(fake, client);
  fake.emit('message', 'not-json');
  fake.emit('message', { sessionId, message: { ...textMessage, channelId: 5 } });
  assert.equal(messages.length, 0);
  assert.deepEqual(
    errors.map((error) => error.category),
    ['invalidPayload', 'invalidPayload']
  );
});

test('non-text content is surfaced as unsupported rather than empty text', () => {
  const message = decodeMessage(
    { ...textMessage, contentType: 'unsupported', text: null, messageType: 'RC:ImgMsg' },
    'event'
  );
  assert.deepEqual(message.content, {
    type: 'unsupported',
    messageType: 'RC:ImgMsg',
  });
});

test('validates initialize arguments and maps bridge rejections', async () => {
  const fake = fakeTransport();
  const client = createNexconnClient(fake.transport);
  await assert.rejects(client.initialize({ appKey: '' }), {
    category: 'invalidArgument',
  });
  await assert.rejects(client.initialize({ appKey: 'k', areaCode: 'EU' }), {
    category: 'invalidArgument',
  });
  await client.initialize({ appKey: 'k' });
  assert.deepEqual(fake.calls.at(-1), ['initialize', 'k', 'SG']);

  assert.equal(
    toNexconnError({ code: 'nexconn/not_initialized', message: 'x' }, 'connect')
      .category,
    'notInitialized'
  );
  assert.equal(
    toNexconnError({ code: 'nexconn/already_initialized' }, 'initialize').category,
    'alreadyInitialized'
  );
  const unknown = toNexconnError(new Error('boom'), 'connect');
  assert.equal(unknown.category, 'native');
  assert.equal(unknown.nativeCode, null);
});
