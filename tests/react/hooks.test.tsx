import { describe, expect, jest, test } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import {
  useBlockedUsers,
  useChannelList,
  useCommunitySubChannels,
  useDraft,
  useFriends,
  useGroupMembers,
  useJoinedGroups,
  useMessageSearch,
  useOpenChannel,
  useUnreadMentions,
  useUser,
  useUsers,
} from '../../src/react/index.ts';
import { fixtures } from '../../src/testing/index.ts';
import { calls, flush, member, setup, textMessage } from './harness.tsx';

const bob = { channelType: 1, channelId: 'bob' } as const;

describe('useChannelList', () => {
  test('keeps channels through a network drop and revalidates on reconnect', async () => {
    let list = [fixtures.directChannel({ channelId: 'bob' })];
    const h = setup({ pages: { channels: () => list } });
    const { result } = await renderHook(() => useChannelList(), {
      wrapper: h.wrapper,
    });
    await h.connect();
    await flush();
    expect(result.current.channels.map((c) => c.channelId)).toEqual(['bob']);
    await h.disconnected();
    expect(result.current.channels).toHaveLength(1);
    list = [
      fixtures.directChannel({ channelId: 'carol', operationTime: 2e12 }),
      fixtures.directChannel({ channelId: 'bob' }),
    ];
    await h.reconnected();
    await flush();
    expect(result.current.channels.map((c) => c.channelId)).toEqual([
      'carol',
      'bob',
    ]);
  });
});

describe('group hooks', () => {
  const groupOperation = (operation: number, memberInfos: unknown[]) => ({
    groupId: 'g1',
    operation,
    memberInfos,
    operationTime: 5,
  });

  test('useGroupMembers follows joins, kicks, role changes and dismiss', async () => {
    const h = setup({
      pages: {
        groupMembersByRole: () => [member('owner', 3), member('bob', 1, 2)],
      },
    });
    h.transport.on('group.getMembers', () => [member('bob', 2, 2)]);
    const { result } = await renderHook(() => useGroupMembers('g1'), {
      wrapper: h.wrapper,
    });
    await h.connect();
    await flush();
    expect(result.current.items.map((m) => m.userId)).toEqual(['owner', 'bob']);

    await act(async () => {
      h.transport.emit(
        'GroupChannelHandler.onGroupOperation',
        groupOperation(1, [member('carol', 1, 3)])
      );
    });
    expect(result.current.items.map((m) => m.userId)).toEqual([
      'owner',
      'bob',
      'carol',
    ]);

    // bob becomes admin: re-read from the SDK, sorted before members.
    await act(async () => {
      h.transport.emit(
        'GroupChannelHandler.onGroupOperation',
        groupOperation(5, [member('bob', 1, 2)])
      );
    });
    await flush();
    expect(result.current.items.find((m) => m.userId === 'bob')?.role).toBe(2);

    await act(async () => {
      h.transport.emit(
        'GroupChannelHandler.onGroupOperation',
        groupOperation(2, [member('carol')])
      );
    });
    expect(result.current.items.map((m) => m.userId)).toEqual(['owner', 'bob']);

    // Events for other groups are ignored.
    await act(async () => {
      h.transport.emit('GroupChannelHandler.onGroupOperation', {
        ...groupOperation(4, []),
        groupId: 'other',
      });
    });
    expect(result.current.items).toHaveLength(2);

    await act(async () => {
      h.transport.emit(
        'GroupChannelHandler.onGroupOperation',
        groupOperation(4, [])
      );
    });
    expect(result.current.items).toHaveLength(0);
  });

  test('useJoinedGroups removes a group the user leaves', async () => {
    const group = (groupId: string, joinedTime: number) => ({
      __type: 'GroupInfo',
      groupId,
      groupName: groupId,
      joinedTime,
      role: 1,
      membersCount: 2,
      createTime: 0,
      extProfile: {},
    });
    const h = setup({
      pages: { joinedGroupsByRole: () => [group('g1', 1), group('g2', 2)] },
    });
    const { result } = await renderHook(() => useJoinedGroups(), {
      wrapper: h.wrapper,
    });
    await h.connect('alice');
    await flush();
    expect(result.current.items.map((g) => g.groupId)).toEqual(['g2', 'g1']);
    await act(async () => {
      h.transport.emit('GroupChannelHandler.onGroupOperation', {
        groupId: 'g2',
        operation: 3,
        memberInfos: [member('alice')],
        operationTime: 9,
      });
    });
    expect(result.current.items.map((g) => g.groupId)).toEqual(['g1']);
  });
});

describe('user hooks', () => {
  test('useUsers batches requests across components and resets per session', async () => {
    const h = setup();
    h.transport.on('user.getUserProfiles', (args) =>
      (args.userIds as string[]).map((userId) => ({
        __type: 'UserProfile',
        userId,
        name: `name-${userId}`,
      }))
    );
    const { result } = await renderHook(
      () => ({ many: useUsers(['bob', 'carol']), one: useUser('bob') }),
      { wrapper: h.wrapper }
    );
    await h.connect('alice');
    await flush();
    expect(result.current.one?.name).toBe('name-bob');
    expect(result.current.many.get('carol')?.name).toBe('name-carol');
    expect(calls(h.transport, 'user.getUserProfiles')).toHaveLength(1);

    await h.connect('dave');
    await flush();
    // A new session refetches rather than reusing the old account's cache.
    expect(calls(h.transport, 'user.getUserProfiles')).toHaveLength(2);
  });

  test('useFriends applies add, remark and remove events', async () => {
    const h = setup();
    h.transport.on('user.getFriends', () => [
      { __type: 'FriendInfo', userId: 'bob', name: 'Bob' },
    ]);
    h.transport.on('user.getFriendsInfo', () => [
      { __type: 'FriendInfo', userId: 'amy', name: 'Amy' },
    ]);
    const { result } = await renderHook(() => useFriends(), {
      wrapper: h.wrapper,
    });
    await h.connect();
    await flush();
    await act(async () => {
      h.transport.emit('UserHandler.onFriendAdd', {
        userId: 'amy',
        operationTime: 1,
      });
    });
    await flush();
    expect(result.current.friends.map((f) => f.userId)).toEqual(['amy', 'bob']);
    await act(async () => {
      h.transport.emit('UserHandler.onFriendInfoChangedSync', {
        userId: 'bob',
        remark: 'Aaron',
        operationTime: 2,
      });
    });
    expect(result.current.friends.map((f) => f.userId)).toEqual(['bob', 'amy']);
    await act(async () => {
      h.transport.emit('UserHandler.onFriendRemove', {
        userIds: ['bob'],
        operationTime: 3,
      });
    });
    expect(result.current.friends.map((f) => f.userId)).toEqual(['amy']);
  });

  test('useBlockedUsers re-reads the list after block and unblock', async () => {
    const h = setup();
    let blocked: string[] = [];
    h.transport.on('user.getBlocklist', () => blocked);
    h.transport.on('user.addToBlocklist', (args) => {
      blocked = [...blocked, args.userId as string];
      return null;
    });
    const { result } = await renderHook(() => useBlockedUsers(), {
      wrapper: h.wrapper,
    });
    await h.connect();
    await flush();
    expect(result.current.userIds).toEqual([]);
    await act(async () => {
      await result.current.block('mallory');
    });
    expect(result.current.userIds).toEqual(['mallory']);
  });
});

describe('search, drafts and mentions', () => {
  test('useMessageSearch debounces and skips empty keywords', async () => {
    jest.useFakeTimers();
    try {
      const h = setup({
        pages: {
          searchMessages: (params) =>
            params.keyword === 'hello' ? [textMessage({ messageId: 'X' })] : [],
        },
      });
      const { result, rerender } = await renderHook(
        ({ keyword }: { keyword: string }) =>
          useMessageSearch(keyword, { channel: bob }),
        { wrapper: h.wrapper, initialProps: { keyword: '' } }
      );
      await h.connect();
      expect(calls(h.transport, 'query.create')).toHaveLength(0);
      await rerender({ keyword: 'hel' });
      await rerender({ keyword: 'hello' });
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      await act(async () => {
        await jest.runOnlyPendingTimersAsync();
      });
      const created = calls(h.transport, 'query.create');
      expect(created).toHaveLength(1);
      expect(created[0]!.args).toMatchObject({
        kind: 'searchMessages',
        params: { keyword: 'hello', channelTypes: [1], channelIds: ['bob'] },
      });
      expect(result.current.items.map((m) => m.messageId)).toEqual(['X']);
      expect(result.current.keyword).toBe('hello');
    } finally {
      jest.useRealTimers();
    }
  });

  test('useDraft loads the stored draft, saves debounced and clears empty text', async () => {
    jest.useFakeTimers();
    try {
      const h = setup();
      h.transport.on('channel.getChannels', () => [
        fixtures.directChannel({ draft: 'half a thought' }),
      ]);
      h.transport.on('channel.saveDraft', () => null);
      h.transport.on('channel.clearDraft', () => null);
      const { result } = await renderHook(() => useDraft(bob), {
        wrapper: h.wrapper,
      });
      await h.connect();
      await act(async () => {
        await jest.runOnlyPendingTimersAsync();
      });
      expect(result.current.draft).toBe('half a thought');
      expect(result.current.loaded).toBe(true);
      await act(async () => {
        result.current.setDraft('h');
        result.current.setDraft('hello');
      });
      expect(calls(h.transport, 'channel.saveDraft')).toHaveLength(0);
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(
        calls(h.transport, 'channel.saveDraft').map((c) => c.args.draft)
      ).toEqual(['hello']);
      await act(async () => {
        result.current.setDraft('  ');
        await result.current.flush();
      });
      expect(calls(h.transport, 'channel.clearDraft')).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('useUnreadMentions re-reads when a message mentioning me arrives', async () => {
    const h = setup();
    let mentions: unknown[] = [];
    h.transport.on('channel.getUnreadMentionedMessages', () => mentions);
    const { result } = await renderHook(() => useUnreadMentions(bob), {
      wrapper: h.wrapper,
    });
    await h.connect('alice');
    await flush();
    expect(result.current.messages).toHaveLength(0);
    const mention = textMessage({
      messageId: 'MM',
      content: {
        __type: 'TextMessage',
        text: '@alice',
        mentionedInfo: { type: 2, userIdList: ['alice'] },
      },
    });
    mentions = [mention];
    await act(async () => {
      h.transport.emit('MessageHandler.onMessageReceived', {
        message: mention,
      });
    });
    await flush();
    expect(result.current.messages.map((m) => m.messageId)).toEqual(['MM']);
  });
});

describe('open and community channels', () => {
  test('useOpenChannel enters on mount, tracks participants and exits on unmount', async () => {
    const h = setup();
    h.transport.on('open.enter', () => null); // Android: response via event
    h.transport.on('open.exit', () => null);
    const view = await renderHook(() => useOpenChannel('room'), {
      wrapper: h.wrapper,
    });
    await h.connect();
    await flush();
    expect(calls(h.transport, 'open.enter')).toHaveLength(1);
    await act(async () => {
      h.transport.emit('OpenChannelHandler.onEntered', {
        channelId: 'room',
        response: {
          createTime: 1,
          participantCount: 4,
          isAllChannelMuted: false,
          isCurrentUserMuted: false,
          isCurrentChannelMuted: false,
          isCurrentChannelInAllowlist: false,
          enterTime: 2,
        },
      });
    });
    expect(view.result.current.status).toBe('entered');
    expect(view.result.current.participantCount).toBe(4);
    await act(async () => {
      h.transport.emit('OpenChannelHandler.onParticipantChanged', {
        channelId: 'room',
        actions: [],
        participantCount: 5,
      });
    });
    expect(view.result.current.participantCount).toBe(5);
    await view.unmount();
    expect(calls(h.transport, 'open.exit')).toHaveLength(1);
  });

  test('useCommunitySubChannels pairs sub-channels with unread info', async () => {
    const h = setup();
    h.transport.on('community.getSubChannels', () => [
      fixtures.directChannel({
        __type: 'CommunitySubChannel',
        channelType: 10,
        channelId: 'c1',
        subChannelId: 's1',
      }),
    ]);
    h.transport.on('community.getChannelsUnreadInfo', () => [
      {
        channelId: 'c1',
        subChannelId: 's1',
        unreadCount: 3,
        mentionedCount: 0,
        mentionedMeCount: 0,
        noDisturbLevel: 0,
      },
    ]);
    const { result } = await renderHook(() => useCommunitySubChannels('c1'), {
      wrapper: h.wrapper,
    });
    await h.connect();
    await flush();
    expect(result.current.subChannels).toHaveLength(1);
    expect(result.current.unread.get('s1')?.unreadCount).toBe(3);
  });
});

describe('network drops keep hook data', () => {
  test('useOpenChannel neither exits nor re-enters on a network drop', async () => {
    const h = setup();
    h.transport.on('open.enter', () => null);
    h.transport.on('open.exit', () => null);
    const view = await renderHook(() => useOpenChannel('room'), {
      wrapper: h.wrapper,
    });
    await h.connect();
    await flush();
    await act(async () => {
      h.transport.emit('OpenChannelHandler.onEntered', { channelId: 'room' });
    });
    await h.disconnected();
    await h.reconnected();
    await flush();
    expect(calls(h.transport, 'open.enter')).toHaveLength(1);
    expect(calls(h.transport, 'open.exit')).toHaveLength(0);
    await view.unmount();
    expect(calls(h.transport, 'open.exit')).toHaveLength(1);
  });

  test('useFriends and useDraft keep their state through a drop and revalidate', async () => {
    const h = setup();
    h.transport.on('user.getFriends', () => [
      { __type: 'FriendInfo', userId: 'bob', name: 'Bob' },
    ]);
    h.transport.on('channel.getChannels', () => [
      fixtures.directChannel({ draft: 'kept' }),
    ]);
    const { result } = await renderHook(
      () => ({ friends: useFriends(), draft: useDraft(bob) }),
      { wrapper: h.wrapper }
    );
    await h.connect();
    await flush();
    expect(result.current.friends.friends).toHaveLength(1);
    expect(result.current.draft.draft).toBe('kept');
    await h.disconnected();
    expect(result.current.friends.friends).toHaveLength(1);
    expect(result.current.draft.draft).toBe('kept');
    await h.reconnected();
    await flush();
    expect(calls(h.transport, 'user.getFriends')).toHaveLength(2);
    // The draft is read once per session and channel, not per reconnect.
    expect(calls(h.transport, 'channel.getChannels')).toHaveLength(1);
    expect(result.current.draft.draft).toBe('kept');
  });
});

test('useOpenChannel exits on unmount even while the enter is still pending', async () => {
  const h = setup();
  h.transport.on('open.enter', () => new Promise(() => undefined));
  h.transport.on('open.exit', () => null);
  const view = await renderHook(() => useOpenChannel('room'), {
    wrapper: h.wrapper,
  });
  await h.connect();
  await flush();
  expect(view.result.current.status).toBe('entering');
  await view.unmount();
  expect(calls(h.transport, 'open.exit')).toHaveLength(1);
});
