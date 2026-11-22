import { describe, expect, test } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { MockTransport } from '../../src/testing/index.ts';
import {
  getUserProfileCache,
  useMessages,
  useUsers,
} from '../../src/react/index.ts';
import { calls, flush, setup, textMessage } from './harness.tsx';

const bob = { channelType: 1, channelId: 'bob' } as const;

function history(count: number) {
  return Array.from({ length: count }, (_, i) =>
    textMessage({
      clientId: i + 1,
      messageId: `M${i + 1}`,
      sentTime: 1000 + i,
      content: { __type: 'TextMessage', text: `m${i + 1}` },
    })
  );
}

describe('useMessages', () => {
  test('loads after connecting, keeps history through a network drop, reconciles on reconnect', async () => {
    let items = history(3);
    const h = setup({ pages: { messages: () => [...items].reverse() } });
    const { result } = await renderHook(() => useMessages(bob), {
      wrapper: h.wrapper,
    });
    expect(result.current.messages).toHaveLength(0);
    await h.connect();
    await flush();
    expect(result.current.messages.map((m) => m.messageId)).toEqual([
      'M1',
      'M2',
      'M3',
    ]);

    await h.disconnected();
    expect(result.current.messages).toHaveLength(3);

    // While offline M3 was deleted elsewhere and M4 arrived.
    items = [
      ...history(2),
      textMessage({ clientId: 4, messageId: 'M4', sentTime: 1003 }),
    ];
    await h.reconnected();
    await flush();
    expect(result.current.messages.map((m) => m.messageId)).toEqual([
      'M1',
      'M2',
      'M4',
    ]);
  });

  test('an account switch clears the list and never shows the previous user’s messages', async () => {
    const h = setup({ pages: { messages: () => history(2) } });
    const { result } = await renderHook(() => useMessages(bob), {
      wrapper: h.wrapper,
    });
    await h.connect('alice');
    await flush();
    expect(result.current.messages).toHaveLength(2);
    h.transport.on('query.create', () => ({ queryId: 'empty' }));
    h.transport.on('query.loadNextPage', () => ({ items: [], hasMore: false }));
    await h.connect('carol');
    await flush();
    expect(result.current.messages).toHaveLength(0);
  });

  test('a failed send stays listed; retry is refused until the SDK copy says failed, then replaces it', async () => {
    const h = setup({ pages: { messages: () => [] } });
    let attempt = 0;
    h.transport.on('message.send', (args) => {
      attempt += 1;
      const clientId = attempt === 1 ? 50 : 51;
      h.transport.emit(
        'op.attached',
        {
          message: textMessage({
            clientId,
            messageId: null,
            direction: 1,
            sentStatus: 10,
            senderUserId: 'alice',
          }),
        },
        { opId: args.opId as string }
      );
      if (attempt === 1) {
        throw MockTransport.nativeError(30002, 'network', 'message.send');
      }
      return textMessage({
        clientId,
        messageId: 'S51',
        direction: 1,
        sentStatus: 30,
        senderUserId: 'alice',
      });
    });
    // First, the SDK copy still says "sending": the outcome is uncertain.
    let storedStatus = 10;
    h.transport.on('message.getById', () =>
      textMessage({
        clientId: 50,
        messageId: null,
        direction: 1,
        sentStatus: storedStatus,
        senderUserId: 'alice',
      })
    );
    h.transport.on('message.deleteLocal', () => null);

    const { result } = await renderHook(() => useMessages(bob), {
      wrapper: h.wrapper,
    });
    await h.connect();
    await flush();

    await act(async () => {
      await expect(
        result.current.send({ type: 'text', text: 'hi' }, { needReceipt: true })
      ).rejects.toMatchObject({ nativeCode: 30002 });
    });
    await flush();
    const failed = result.current.messages[0]!;
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.sendState(failed)).toMatchObject({
      status: 'failed',
      canRetry: false,
    });
    await act(async () => {
      await expect(result.current.retry(failed)).rejects.toMatchObject({
        category: 'invalid_argument',
      });
    });

    // The SDK now reports the definitive failure.
    storedStatus = 20;
    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => {
      h.transport.emit('MessageHandler.onMessagesUpdated', {
        messages: [
          textMessage({
            clientId: 50,
            messageId: null,
            direction: 1,
            sentStatus: 20,
            senderUserId: 'alice',
          }),
        ],
      });
    });
    await flush();
    const definitive = result.current.messages[0]!;
    expect(result.current.sendState(definitive).canRetry).toBe(true);

    await act(async () => {
      await result.current.retry(definitive);
    });
    expect(result.current.messages.map((m) => m.messageId)).toEqual(['S51']);
    expect(calls(h.transport, 'message.deleteLocal')[0]!.args).toEqual({
      messages: [{ clientId: 50 }],
    });
    const resent = calls(h.transport, 'message.send')[1]!.args;
    expect(resent.content).toEqual({ type: 'text', text: 'hi' });
    expect(resent.options).toMatchObject({ needReceipt: true });
    expect(result.current.outbox.size).toBe(0);
  });

  test('media upload progress is tracked per message and cancel calls the SDK', async () => {
    const h = setup({ pages: { messages: () => [] } });
    let opId = '';
    let finish: (value: unknown) => void = () => undefined;
    h.transport.on('message.sendMedia', (args) => {
      opId = args.opId as string;
      h.transport.emit(
        'op.attached',
        {
          message: textMessage({
            clientId: 9,
            messageId: null,
            direction: 1,
            sentStatus: 10,
            content: { __type: 'ImageMessage', localPath: '/tmp/a.jpg' },
          }),
        },
        { opId }
      );
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    h.transport.on('message.cancelSendMedia', () => null);
    const { result } = await renderHook(() => useMessages(bob), {
      wrapper: h.wrapper,
    });
    await h.connect();
    await flush();
    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = result.current.send({ type: 'image', localPath: '/tmp/a.jpg' });
    });
    await act(async () => {
      h.transport.emit('op.progress', { progress: 37 }, { opId });
    });
    const message = result.current.messages[0]!;
    expect(result.current.sendState(message)).toEqual({
      status: 'sending',
      canRetry: false,
      progress: 37,
    });
    await act(async () => {
      await result.current.cancel(message);
    });
    expect(calls(h.transport, 'message.cancelSendMedia')[0]!.args).toEqual({
      message: { clientId: 9 },
    });
    await act(async () => {
      finish(
        textMessage({
          clientId: 9,
          messageId: 'S9',
          direction: 1,
          sentStatus: 30,
          content: { __type: 'ImageMessage', remoteUrl: 'https://x/a.jpg' },
        })
      );
      await pending;
    });
    expect(result.current.sendState(result.current.messages[0]!).status).toBe(
      'sent'
    );
  });

  test('reply sends a reference that quotes the target', async () => {
    const h = setup({ pages: { messages: () => history(1) } });
    h.transport.on('message.send', () =>
      textMessage({ clientId: 2, messageId: 'R1', direction: 1 })
    );
    const { result } = await renderHook(() => useMessages(bob), {
      wrapper: h.wrapper,
    });
    await h.connect();
    await flush();
    await act(async () => {
      await result.current.reply(result.current.messages[0]!, 'agreed');
    });
    expect(calls(h.transport, 'message.send')[0]!.args.content).toMatchObject({
      type: 'reference',
      content: 'agreed',
      referMsgId: 'M1',
      referMsgSenderId: 'bob',
    });
  });

  test('unmounting removes every event subscription', async () => {
    const h = setup({ pages: { messages: () => history(1) } });
    await h.connect();
    // The session's profile cache keeps one listener for the whole session.
    const snap = h.client.getSnapshot();
    getUserProfileCache(h.client, `${snap.generation}:${snap.userId}`);
    const baseline = h.client.listenerCount();
    const view = await renderHook(
      () => {
        useMessages(bob);
        useUsers(['bob']);
      },
      { wrapper: h.wrapper }
    );
    h.transport.on('user.getUserProfiles', () => []);
    await flush();
    await view.unmount();
    expect(h.client.listenerCount()).toBe(baseline);
    expect(h.queries.size).toBe(0);
  });
});
