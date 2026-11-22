import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeChannel, normalizeMessage } from '../src/core/normalize.ts';
import { ChannelListStore, MessageListStore, readStateOf } from '../src/react/stores.ts';
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

test('a deleted message is replaced only by a recall notice the SDK actually returns', async () => {
  const { reconcileDeleted } = await import('../src/react/stores.ts');
  const recalled = msg({ clientId: 1, messageId: 'R', sentTime: 1 });
  const deleted = msg({ clientId: 2, messageId: 'D', sentTime: 2 });
  const local = msg({ clientId: 3, messageId: null, sentTime: 3 });
  const notice = msg({
    clientId: 1,
    messageId: 'R',
    sentTime: 1,
    content: { __type: 'RecallNotificationMessage', operatorId: 'alice' },
  });
  const lookups = [];
  const result = await reconcileDeleted([recalled, deleted, local], async ({ messageId }) => {
    lookups.push(messageId);
    if (messageId === 'R') return notice;
    if (messageId === 'D') throw new Error('gone');
    return undefined;
  });
  assert.deepEqual(lookups, ['R', 'D']);
  assert.deepEqual(result.replacements.map((m) => m.content.type), ['recallNotification']);
  assert.equal(result.removed.length, 3);

  const store = new MessageListStore(bob);
  store.upsert([recalled, deleted, local]);
  store.remove(result.removed);
  store.upsert(result.replacements);
  assert.deepEqual(store.messages.map((m) => `${m.messageId ?? '-'}:${m.content.type}`), ['R:recallNotification']);
});

test('recall uses the SDK copy when deleteForAll resolves with non-recall content', async () => {
  const { currentRecallNotice } = await import('../src/react/stores.ts');
  const emptied = msg({ clientId: 7, messageId: 'Q', sentTime: 1, content: { __type: 'TextMessage', text: '' } });
  const notice = msg({
    clientId: 7,
    messageId: 'Q',
    sentTime: 1,
    content: { __type: 'RecallNotificationMessage', operatorId: 'alice' },
  });
  const refs = [];
  const found = await currentRecallNotice(emptied, async (ref) => {
    refs.push(ref);
    return notice;
  });
  assert.deepEqual(refs, [{ messageId: 'Q', clientId: 7 }]);
  assert.equal(found.content.type, 'recallNotification');
  // The SDK still holds plain content: nothing is shown in its place.
  assert.equal(await currentRecallNotice(emptied, async () => emptied), undefined);
  // A notice carried by the event itself needs no lookup.
  assert.equal(await currentRecallNotice(notice, async () => assert.fail('no lookup')), notice);
});

test('reconcileWindow applies SDK truth inside the fetched window only', () => {
  const store = new MessageListStore(bob);
  store.upsert([
    msg({ clientId: 1, messageId: 'OLD', sentTime: 1 }),
    msg({ clientId: 2, messageId: 'GONE', sentTime: 11 }),
    msg({ clientId: 3, messageId: 'R', sentTime: 10 }),
    msg({ clientId: 4, messageId: null, sentTime: 12 }),
  ]);
  const recalled = msg({
    clientId: 3,
    messageId: 'R',
    sentTime: 10,
    content: { __type: 'RecallNotificationMessage', operatorId: 'alice' },
  });
  // Window = sentTime >= 10: GONE (11) is missing from the SDK page, OLD (1) is outside it.
  const page = [msg({ clientId: 9, messageId: 'NEW', sentTime: 13 }), recalled];
  assert.equal(store.reconcileWindow(page), true);
  assert.deepEqual(
    store.messages.map((m) => `${m.messageId ?? '-'}:${m.content.type}`),
    ['OLD:text', 'R:recallNotification', '-:text', 'NEW:text']
  );
  assert.equal(store.reconcileWindow([]), false);
});

test('receipts mark a Sent message read without touching sentStatus, and never go backwards', () => {
  const direct = { channelType: 1, channelId: 'bob' };
  const store = new MessageListStore(direct);
  const sent = { ...normalizeMessage(fixtures.textMessage({ clientId: 1, messageId: 'M1', sentStatus: 30, direction: 1, needReceipt: true })), channel: direct };
  store.upsert([sent]);
  assert.equal(readStateOf(sent, store.receipts.get('M1')).read, false);
  // Receipt for another channel is ignored.
  assert.equal(store.applyReceipts([{ channel: { channelType: 1, channelId: 'carol' }, messageId: 'M1', readCount: 1, unreadCount: 0, totalCount: 1 }]), false);
  assert.equal(store.applyReceipts([{ channel: direct, messageId: 'M1', readCount: 1, unreadCount: 0, totalCount: 1 }]), true);
  const before = store.receipts;
  assert.deepEqual(readStateOf(sent, store.receipts.get('M1')), { read: true, readCount: 1, totalCount: 1 });
  assert.equal(sent.sentStatus, 30);
  // A stale response cannot undo it, and an identical one changes nothing.
  assert.equal(store.applyReceipts([{ channel: direct, messageId: 'M1', readCount: 0, unreadCount: 1, totalCount: 1 }]), false);
  assert.equal(store.receipts, before);
});

test('group receipts keep partial counts', () => {
  const group = { channelType: 3, channelId: 'g1' };
  const store = new MessageListStore(group);
  const msg = { ...normalizeMessage(fixtures.textMessage({ clientId: 2, messageId: 'G1', sentStatus: 30, direction: 1 })), channel: group };
  store.upsert([msg]);
  store.applyReceipts([{ messageId: 'G1', readCount: 2, unreadCount: 3, totalCount: 5 }]);
  assert.deepEqual(readStateOf(msg, store.receipts.get('G1')), { read: true, readCount: 2, totalCount: 5 });
  store.applyReceipts([{ messageId: 'G1', readCount: 4, unreadCount: 1, totalCount: 5 }]);
  assert.equal(store.receipts.get('G1').readCount, 4);
  // No receipt: falls back to the SDK's sentStatus only.
  assert.deepEqual(readStateOf({ ...msg, sentStatus: 50 }, undefined), { read: true });
});
