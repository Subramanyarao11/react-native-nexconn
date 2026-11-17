import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeChannel,
  normalizeContent,
  normalizeMessage,
  normalizeValue,
  translateNativeEvent,
} from '../src/core/normalize.ts';
import { fixtures } from '../src/testing/index.ts';

test('normalizes an Android-shaped text message', () => {
  const message = normalizeMessage(fixtures.textMessage());
  assert.equal(message.clientId, 1);
  assert.equal(message.messageId, 'MSG-1');
  assert.deepEqual(message.channel, { channelType: 1, channelId: 'bob' });
  assert.deepEqual(message.content, { type: 'text', text: 'hello' });
  assert.equal(message.sentTime, 1_700_000_000_000);
  assert.equal(message.sentStatus, 30);
});

test('normalizes iOS class names with the NC prefix and iOS-only field names', () => {
  const content = normalizeContent({
    __type: 'NCImageMessage',
    localPath: '/tmp/a.jpg',
    thumbnailBase64String: 'AAAA',
    original: true,
    thumWidth: 10,
    thumHeight: 20,
  });
  assert.equal(content.type, 'image');
  assert.equal(content.thumbnailBase64, 'AAAA');
  assert.equal(content.original, true);
});

test('unknown native content is preserved, not dropped', () => {
  const content = normalizeContent({ __type: 'SomeFutureMessage', foo: 1 }, 'app:future');
  assert.equal(content.type, 'unknown');
  assert.equal(content.nativeType, 'app:future');
  assert.deepEqual(content.raw, { foo: 1 });
});

test('custom slot content keeps its registered type and fields', () => {
  const content = normalizeContent({
    __type: 'CustomMessageContent',
    messageType: 'app:poll',
    fields: { question: 'Lunch?', options: ['a', 'b'] },
  });
  assert.deepEqual(content, {
    type: 'custom',
    messageType: 'app:poll',
    fields: { question: 'Lunch?', options: ['a', 'b'] },
  });
});

test('message without server id omits messageId; local and server ids stay separate', () => {
  const message = normalizeMessage(fixtures.textMessage({ messageId: null, clientId: 42 }));
  assert.equal(message.clientId, 42);
  assert.equal('messageId' in message, false);
});

test('normalizes channels and keeps subclass fields in extras', () => {
  const channel = normalizeChannel({
    ...fixtures.directChannel(),
    __type: 'GroupChannel',
    channelType: 3,
    channelId: 'g1',
    memberCount: 5,
    latestMessage: fixtures.textMessage(),
  });
  assert.equal(channel.channelType, 3);
  assert.equal(channel.extras.memberCount, 5);
  assert.equal(channel.latestMessage?.content.type, 'text');
});

test('reconciles platform differences in AppSettings and Tag', () => {
  assert.deepEqual(
    normalizeValue({ __type: 'NCAppSettings', isSpeechToTextEnable: true, messageModifiableMinutes: 5 }),
    { speechToTextEnabled: true, messageModifiableMinutes: 5 }
  );
  assert.deepEqual(
    normalizeValue({ __type: 'AppSettings', isSpeechToTextEnabled: false, messageModifiableMinutes: 5 }),
    { speechToTextEnabled: false, messageModifiableMinutes: 5 }
  );
  assert.deepEqual(
    normalizeValue({ __type: 'NCTag', tagId: 't', tagName: 'n', count: 2, timestamp: 9 }),
    { tagId: 't', tagName: 'n', channelCount: 2, createTime: 9 }
  );
});

test('Android flat read-receipt identifiers become a channel identifier', () => {
  const value = normalizeValue({
    __type: 'ReadReceiptInfo',
    channelType: 3,
    channelId: 'g1',
    subChannelId: '',
    messageId: 'M',
    readCount: 1,
    unreadCount: 2,
    totalCount: 3,
  });
  assert.deepEqual(value, {
    channel: { channelType: 3, channelId: 'g1' },
    messageId: 'M',
    readCount: 1,
    unreadCount: 2,
    totalCount: 3,
  });
});

test('translates message received events with defaults for nullable fields', () => {
  const event = translateNativeEvent('MessageHandler.onMessageReceived', {
    __type: 'MessageReceivedEvent',
    message: fixtures.textMessage(),
    left: null,
    offline: true,
  });
  assert.equal(event.name, 'messageReceived');
  assert.equal(event.payload.left, 0);
  assert.equal(event.payload.offline, true);
  assert.equal(event.payload.hasPackage, false);
  assert.equal(event.payload.message.content.text, 'hello');
});

test('translates typing events and renames userTypingStatus to users', () => {
  const event = translateNativeEvent('ChannelHandler.onTypingStatusChanged', {
    __type: 'TypingStatusChangedEvent',
    channelIdentifier: { __type: 'ChannelIdentifier', channelType: 1, channelId: 'bob' },
    userTypingStatus: [{ __type: 'ChannelUserTypingStatusInfo', userId: 'bob', typingMessageType: 'RC:TxtMsg', sentTime: 1 }],
  });
  assert.equal(event.name, 'typingStatusChanged');
  assert.deepEqual(event.payload, {
    channel: { channelType: 1, channelId: 'bob' },
    users: [{ userId: 'bob', typingMessageType: 'RC:TxtMsg', sentTime: 1 }],
  });
});

test('native errors inside payloads become {code, message}', () => {
  const event = translateNativeEvent('ChannelHandler.onRemoteChannelsSyncCompleted', {
    __type: 'RemoteChannelsSyncCompletedEvent',
    error: { __type: 'NCError', code: 34001, message: 'boom' },
  });
  assert.deepEqual(event.payload, { error: { code: 34001, message: 'boom' } });
});

test('unknown event types are surfaced, not swallowed', () => {
  const event = translateNativeEvent('FutureHandler.onSomething', { __type: 'X', a: 1 });
  assert.equal(event.name, 'unknownNativeEvent');
  assert.deepEqual(event.payload, { type: 'FutureHandler.onSomething', payload: { a: 1 } });
});
