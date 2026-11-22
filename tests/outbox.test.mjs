import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMessage } from '../src/core/normalize.ts';
import { mentionsUser, replyTo, withMentions } from '../src/core/helpers.ts';
import {
  KeyedListStore,
  OutboxStore,
  resendableContent,
  sendStateOf,
} from '../src/react/stores.ts';
import { UserProfileCache } from '../src/react/profiles.ts';
import { fixtures } from '../src/testing/index.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));

function outgoing(overrides = {}) {
  return normalizeMessage(
    fixtures.textMessage({ direction: 1, senderUserId: 'alice', ...overrides })
  );
}

test('KeyedListStore upserts by key, sorts, patches and removes', () => {
  const store = new KeyedListStore((m) => m.id, (a, b) => a.n - b.n);
  assert.equal(store.upsert([]), false);
  store.upsert([{ id: 'b', n: 2 }, { id: 'a', n: 1 }]);
  store.upsert([{ id: 'b', n: 0 }]);
  assert.deepEqual(store.list.map((x) => x.id), ['b', 'a']);
  const before = store.list;
  assert.equal(store.patch('a', (x) => ({ ...x, n: -1 })), true);
  assert.notEqual(store.list, before, 'updates replace the array');
  assert.deepEqual(store.list.map((x) => x.id), ['a', 'b']);
  assert.equal(store.patch('zzz', (x) => x), false);
  assert.equal(store.remove(['a', 'missing']), true);
  assert.equal(store.remove(['missing']), false);
  assert.equal(store.retain(() => false), true);
  assert.equal(store.list.length, 0);
});

test('OutboxStore tracks sending, progress and failure immutably', () => {
  const box = new OutboxStore();
  const content = { type: 'text', text: 'hi' };
  box.begin(7, content, { needReceipt: true });
  const first = box.entries;
  assert.equal(box.progress(7, 41.6), true);
  assert.equal(box.progress(7, 42), false, 'same rounded value is a no-op');
  assert.notEqual(box.entries, first);
  assert.equal(box.get(7).progress, 42);
  const error = new Error('net');
  assert.equal(box.fail(7, error), true);
  assert.equal(box.get(7).status, 'failed');
  assert.equal(box.get(7).progress, undefined);
  assert.equal(box.get(7).error, error);
  assert.deepEqual(box.get(7).options, { needReceipt: true });
  assert.equal(box.progress(7, 50), false, 'no progress once failed');
  assert.equal(box.fail(8, error), false);
  assert.equal(box.delete(7), true);
  assert.equal(box.delete(7), false);
});

test('sendStateOf only allows a retry when the SDK reports a definitive failure', () => {
  const sending = outgoing({ sentStatus: 10, messageId: null });
  assert.deepEqual(sendStateOf(sending, { clientId: 1, status: 'sending', progress: 5, content: {} }), {
    status: 'sending',
    canRetry: false,
    progress: 5,
  });
  // The promise rejected but the SDK copy still says "sending": uncertain.
  const uncertain = sendStateOf(sending, { clientId: 1, status: 'failed', error: 'x', content: {} });
  assert.equal(uncertain.status, 'failed');
  assert.equal(uncertain.canRetry, false);
  const failed = outgoing({ sentStatus: 20, messageId: null });
  assert.equal(sendStateOf(failed, undefined).canRetry, true);
  assert.equal(sendStateOf(failed, undefined).status, 'failed');
  const canceled = outgoing({ sentStatus: 70, messageId: null });
  assert.deepEqual(sendStateOf(canceled, undefined), { status: 'canceled', canRetry: true });
  assert.deepEqual(sendStateOf(outgoing({ sentStatus: 30 }), undefined), { status: 'sent', canRetry: false });
  const incoming = normalizeMessage(fixtures.textMessage({ sentStatus: 20 }));
  assert.deepEqual(sendStateOf(incoming, undefined), { status: 'sent', canRetry: false });
});

test('resendableContent strips SDK-filled fields and refuses unsendable content', () => {
  const image = outgoing({
    sentStatus: 20,
    content: { __type: 'ImageMessage', localPath: '/tmp/a.jpg', thumbnailBase64: 'AAAA', thumbWidth: 10 },
  });
  const content = resendableContent(image);
  assert.equal(content.type, 'image');
  assert.equal(content.localPath, '/tmp/a.jpg');
  assert.equal('thumbnailBase64' in content, false);
  assert.equal('thumbWidth' in content, false);
  const recall = outgoing({ content: { __type: 'RecallNotificationMessage', operatorId: 'a' } });
  assert.equal(resendableContent(recall), undefined);
  assert.equal(sendStateOf({ ...recall, sentStatus: 20 }, undefined).canRetry, false);
});

test('replyTo quotes a sent message and can mention its sender', () => {
  const target = normalizeMessage(fixtures.textMessage({ messageId: 'M1', senderUserId: 'bob' }));
  const reply = replyTo(target, 'sure', { mentionSender: true });
  assert.equal(reply.type, 'reference');
  assert.equal(reply.content, 'sure');
  assert.equal(reply.referMsgId, 'M1');
  assert.equal(reply.referMsgSenderId, 'bob');
  assert.equal(reply.referMsg.type, 'text');
  assert.deepEqual(reply.mentionedInfo, { type: 2, userIdList: ['bob'] });
  assert.throws(() => replyTo({ ...target, messageId: undefined }, 'x'), /messageId/);
});

test('withMentions builds user and @all mentions; mentionsUser reads them', () => {
  const text = { type: 'text', text: '@bob @carol hi' };
  const mentioned = withMentions(text, ['bob', 'carol', 'bob'], 'You were mentioned');
  assert.deepEqual(mentioned.mentionedInfo, {
    type: 2,
    userIdList: ['bob', 'carol'],
    mentionedContent: 'You were mentioned',
  });
  assert.equal(text.mentionedInfo, undefined, 'input is not mutated');
  assert.deepEqual(withMentions(text, 'all').mentionedInfo, { type: 1 });
  assert.throws(() => withMentions(text, []));
  const message = (info) => ({ content: { type: 'text', text: '', mentionedInfo: info } });
  assert.equal(mentionsUser(message({ type: 2, userIdList: ['bob'] }), 'bob'), true);
  assert.equal(mentionsUser(message({ type: 2, userIdList: ['carol'] }), 'bob'), false);
  assert.equal(mentionsUser(message({ type: 1 }), 'bob'), true);
  assert.equal(mentionsUser(message(undefined), 'bob'), false);
});

test('UserProfileCache batches, de-duplicates and remembers missing users', async () => {
  const calls = [];
  const cache = new UserProfileCache(async (ids) => {
    calls.push([...ids]);
    return ids.filter((id) => id !== 'ghost').map((userId) => ({ userId, name: userId.toUpperCase() }));
  }, 2);
  let notified = 0;
  cache.subscribe(() => notified++);
  cache.request(['a', 'b', 'a']);
  cache.request(['c', 'ghost']);
  await tick();
  await tick();
  assert.deepEqual(calls, [['a', 'b'], ['c', 'ghost']]);
  assert.equal(cache.get('a').name, 'A');
  assert.equal(cache.get('ghost'), null);
  assert.ok(notified >= 2);
  cache.request(['a', 'ghost']);
  await tick();
  assert.equal(calls.length, 2, 'cached and missing ids are not refetched');
  cache.invalidate(['ghost']);
  cache.request(['ghost']);
  await tick();
  assert.deepEqual(calls.at(-1), ['ghost']);
  cache.set([{ userId: 'd', name: 'pushed' }]);
  assert.equal(cache.get('d').name, 'pushed');
});

test('UserProfileCache does not cache failures', async () => {
  let fail = true;
  const cache = new UserProfileCache(async (ids) => {
    if (fail) throw new Error('offline');
    return ids.map((userId) => ({ userId }));
  });
  cache.request(['a']);
  await tick();
  await tick();
  assert.equal(cache.get('a'), undefined);
  fail = false;
  cache.request(['a']);
  await tick();
  await tick();
  assert.deepEqual(cache.get('a'), { userId: 'a' });
});
