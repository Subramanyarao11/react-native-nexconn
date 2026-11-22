// JS-side performance checks against the mock transport (no native code).
// Measures event dispatch, message-list updates under bursts, and listener
// cleanup. Prints a table; exits non-zero only if a correctness check fails.
// Usage: node scripts/bench-events.mjs
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { normalizeMessage } from '../src/core/normalize.ts';
import { MessageListStore } from '../src/react/stores.ts';
import { createMockClient, fixtures } from '../src/testing/index.ts';

const bob = { channelType: 1, channelId: 'bob' };
const rows = [];

function time(label, iterations, fn) {
  fn(Math.min(iterations, 50)); // warm up
  const start = performance.now();
  fn(iterations);
  const ms = performance.now() - start;
  rows.push({
    case: label,
    n: iterations,
    'total ms': ms.toFixed(1),
    'µs/op': ((ms * 1000) / iterations).toFixed(2),
  });
  return ms;
}

function nativeMessage(i, overrides = {}) {
  return fixtures.textMessage({
    clientId: i + 1,
    messageId: `M${i + 1}`,
    sentTime: 1_700_000_000_000 + i,
    ...overrides,
  });
}

// 1. Native event -> typed listener (translation + generation filter).
{
  const { client, transport } = createMockClient();
  let received = 0;
  client.on('messageReceived', () => received++);
  const payloads = Array.from({ length: 10_000 }, (_, i) => ({
    message: nativeMessage(i),
  }));
  time('messageReceived dispatch', 10_000, (n) => {
    for (let i = 0; i < n; i++) {
      transport.emit('MessageHandler.onMessageReceived', payloads[i]);
    }
  });
  assert.ok(received >= 10_000);
}

// 2. Live burst into a full list: one upsert per incoming message.
const prebuilt = Array.from({ length: 6000 }, (_, i) =>
  normalizeMessage(nativeMessage(i))
);
for (const size of [200, 2000]) {
  const store = new MessageListStore(bob);
  store.upsert(prebuilt.slice(0, size));
  let next = size;
  time(`burst append into ${size}-message list`, 2000, (n) => {
    for (let i = 0; i < n; i++) store.upsert([prebuilt[next++ % 6000]]);
  });
  assert.ok(store.messages.length <= 2000, 'list stays bounded');
  const ids = store.messages.map((m) => m.clientId);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
}

// 3. Echo replacement: local echo then server ack for the same clientId.
{
  const store = new MessageListStore(bob);
  store.upsert(prebuilt.slice(0, 1000));
  time('local echo + ack (1000-message list)', 1000, (n) => {
    for (let i = 0; i < n; i++) {
      const clientId = 100_000 + i;
      const echo = { ...prebuilt[0], clientId, messageId: undefined, sentTime: 1_800_000_000_000 + i };
      store.upsert([echo]);
      store.upsert([{ ...echo, messageId: `S${clientId}` }]);
    }
  });
  const ids = store.messages.map((m) => m.clientId);
  assert.equal(new Set(ids).size, ids.length, 'echo replaced, not duplicated');
}

// 4. History page merge: 30 older messages at a time.
{
  const store = new MessageListStore(bob);
  let offset = 6000;
  time('history page of 30 (to 2000)', 66, (n) => {
    for (let i = 0; i < n; i++) {
      offset -= 30;
      store.upsert(prebuilt.slice(offset, offset + 30));
    }
  });
}

// 5. Subscribe/unsubscribe churn returns to the baseline.
{
  const { client } = createMockClient();
  const baseline = client.listenerCount();
  time('subscribe + unsubscribe (6 events)', 10_000, (n) => {
    for (let i = 0; i < n; i++) {
      const offs = [
        'messageReceived',
        'messagesUpdated',
        'messagesDeleted',
        'readReceiptResponse',
        'typingStatusChanged',
        'groupOperation',
      ].map((name) => client.on(name, () => undefined));
      offs.forEach((off) => off());
      offs[0](); // idempotent
    }
  });
  assert.equal(client.listenerCount(), baseline, 'no leaked listeners');
}

console.table(rows);
console.log(`node ${process.version} · ${process.platform}/${process.arch}`);
