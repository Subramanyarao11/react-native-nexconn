import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeChannel, normalizeMessage } from '../src/core/normalize.ts';
import { ChannelListStore, MessageListStore } from '../src/react/stores.ts';
import { fixtures } from '../src/testing/index.ts';

const bob = { channelType: 1, channelId: 'bob' };

function msg(overrides) {
  return normalizeMessage(fixtures.textMessage(overrides));
}

test('local echo is replaced by the acknowledged message, not duplicated', () => {
  const store = new MessageListStore(bob);
  store.upsert([msg({ clientId: 5, messageId: null, sentStatus: 10, sentTime: 100 })]);
  store.upsert([msg({ clientId: 5, messageId: 'S5', sentStatus: 30, sentTime: 101 })]);
  assert.equal(store.messages.length, 1);
  assert.equal(store.messages[0].messageId, 'S5');
});

test('a message matched by server id from another device updates in place', () => {
  const store = new MessageListStore(bob);
  store.upsert([msg({ clientId: 1, messageId: 'X', sentTime: 1 })]);
  store.upsert([msg({ clientId: 99, messageId: 'X', sentTime: 1, hasChanged: true })]);
  assert.equal(store.messages.length, 1);
  assert.equal(store.messages[0].hasChanged, true);
});

test('messages are ordered by sentTime and other channels are ignored', () => {
  const store = new MessageListStore(bob);
  store.upsert([
    msg({ clientId: 2, messageId: 'B', sentTime: 20 }),
    msg({ clientId: 1, messageId: 'A', sentTime: 10 }),
    msg({ clientId: 3, messageId: 'C', sentTime: 5, channelIdentifier: { channelType: 1, channelId: 'carol' } }),
  ]);
  assert.deepEqual(store.messages.map((m) => m.messageId), ['A', 'B']);
});

test('remove deletes by either id and the list is bounded', () => {
  const store = new MessageListStore(bob, 3);
  store.upsert([1, 2, 3, 4].map((i) => msg({ clientId: i, messageId: `M${i}`, sentTime: i })));
  assert.deepEqual(store.messages.map((m) => m.clientId), [2, 3, 4]);
  assert.equal(store.remove([{ messageId: 'M3' }]), true);
  assert.equal(store.remove([{ clientId: 1000 }]), false);
  assert.deepEqual(store.messages.map((m) => m.clientId), [2, 4]);
});

test('channel list puts pinned first then most recent', () => {
  const store = new ChannelListStore();
  store.upsert([
    normalizeChannel(fixtures.directChannel({ channelId: 'old', operationTime: 1 })),
    normalizeChannel(fixtures.directChannel({ channelId: 'new', operationTime: 9 })),
    normalizeChannel(fixtures.directChannel({ channelId: 'pin', operationTime: 0, isPinned: true })),
  ]);
  assert.deepEqual(store.channels.map((c) => c.channelId), ['pin', 'new', 'old']);
  store.upsert([normalizeChannel(fixtures.directChannel({ channelId: 'old', operationTime: 20 }))]);
  assert.deepEqual(store.channels.map((c) => c.channelId), ['pin', 'old', 'new']);
  assert.equal(store.remove([{ channelType: 1, channelId: 'new' }]), true);
  assert.equal(store.channels.length, 2);
});
