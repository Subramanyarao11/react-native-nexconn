/**
 * Shared demo used by both example apps (Community CLI and Expo dev build).
 *
 * Scenario: campus team coordination — sign in through the authenticated
 * token server, see conversations, chat 1:1 or in a group, create a group,
 * observe unread/typing/read state. A developer playground shows connection
 * state, platform capabilities and a redacted event log.
 *
 * Uses only the public package entry points, exactly like a consumer app.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AreaCode,
  ChannelType,
  ConnectionStatus,
  FriendApplicationStatus,
  FriendApplicationType,
  GroupMemberRole,
  enumName,
  getNexconnClient,
  isNexconnError,
  withMentions,
  type Channel,
  type ChannelIdentifier,
  type Message,
  type MessageContent,
  type NexconnClient,
  type OutgoingContent,
} from '@subramanyarao11/react-native-nexconn';
import {
  NexconnProvider,
  useBlockedUsers,
  useChannelList,
  useConnection,
  useDraft,
  useFriendApplications,
  useFriends,
  useGroup,
  useGroupMembers,
  useMessageSearch,
  useMessages,
  useNexconnClient,
  useNexconnEvent,
  useOnlineStatus,
  useNotificationOpened,
  useTotalUnreadCount,
  useTypingUsers,
  useUnreadMentions,
  useUsers,
  type MessageSendState,
} from '@subramanyarao11/react-native-nexconn/react';

export interface DemoDefaults {
  appKey?: string;
  tokenServerUrl?: string;
  areaCode?: AreaCode;
}

export interface DemoAppProps {
  title: string;
  defaults?: DemoDefaults;
}

function describeError(error: unknown): string {
  if (isNexconnError(error)) {
    return `${error.category}${error.nativeCode !== undefined ? ` (${error.nativeCode})` : ''}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function contentPreview(content: MessageContent): string {
  switch (content.type) {
    case 'text':
      return content.text;
    case 'image':
      return '[image]';
    case 'file':
      return `[file] ${content.name ?? ''}`;
    case 'voice':
      return `[voice ${content.duration}s]`;
    case 'video':
      return `[video ${content.duration}s]`;
    case 'location':
      return `[location] ${content.poi}`;
    case 'reference':
      return `↪ ${content.content}`;
    case 'recallNotification':
      return '[message recalled]';
    case 'custom':
      return `[${content.messageType}]`;
    case 'stream':
      return content.content;
    default:
      return `[${content.type}]`;
  }
}

async function fetchToken(
  serverUrl: string,
  userId: string,
  password: string
): Promise<() => Promise<string>> {
  const base = serverUrl.replace(/\/$/, '');
  const login = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, password }),
  });
  if (!login.ok) throw new Error(`Sign-in failed (HTTP ${login.status})`);
  const { sessionToken } = (await login.json()) as { sessionToken: string };
  // Token provider: re-fetches a token for the signed-in user when needed.
  return async () => {
    const response = await fetch(`${base}/nexconn/token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (!response.ok)
      throw new Error(`Token request failed (HTTP ${response.status})`);
    const body = (await response.json()) as { accessToken: string };
    return body.accessToken;
  };
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

function SignIn({ defaults }: { defaults?: DemoDefaults }) {
  const client = useNexconnClient();
  const [appKey, setAppKey] = useState(defaults?.appKey ?? '');
  const [serverUrl, setServerUrl] = useState(defaults?.tokenServerUrl ?? '');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await client.initialize({
        appKey: appKey.trim(),
        areaCode: defaults?.areaCode ?? AreaCode.sg,
      });
      const tokenProvider = await fetchToken(
        serverUrl.trim(),
        userId.trim(),
        password
      );
      await client.connectWithTokenProvider({ tokenProvider });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.form}>
      <Text style={styles.h2}>Sign in</Text>
      <Text style={styles.hint}>
        Tokens come from your authenticated token server
        (examples/token-server). The App Secret never reaches this app.
      </Text>
      <Field label="App Key" value={appKey} onChangeText={setAppKey} />
      <Field
        label="Token server URL"
        value={serverUrl}
        onChangeText={setServerUrl}
      />
      <Field label="User ID" value={userId} onChangeText={setUserId} />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secure
      />
      <Button
        title={busy ? 'Connecting…' : 'Sign in'}
        disabled={busy}
        onPress={submit}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

function ChannelRow({
  channel,
  onPress,
}: {
  channel: Channel;
  onPress: () => void;
}) {
  const title =
    channel.channelType === ChannelType.group
      ? `# ${channel.channelId}`
      : channel.channelId;
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>
          {channel.isPinned ? '📌 ' : ''}
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.rowSub}>
          {channel.latestMessage
            ? contentPreview(channel.latestMessage.content)
            : 'No messages yet'}
        </Text>
      </View>
      {channel.unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{channel.unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function Conversations({ onOpen }: { onOpen: (c: ChannelIdentifier) => void }) {
  const client = useNexconnClient();
  const { channels, loading, error, loadMore, refresh } = useChannelList({
    channelTypes: [ChannelType.direct, ChannelType.group],
    pageSize: 20,
  });
  const [peer, setPeer] = useState('');
  const [groupId, setGroupId] = useState('');
  const [members, setMembers] = useState('');
  const [note, setNote] = useState<string | undefined>();

  const createGroup = async () => {
    try {
      const ids = members
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
      const result = await client.groups.create({
        groupId: groupId.trim(),
        groupName: groupId.trim(),
        inviteeUserIds: ids,
      });
      setNote(`Group created (process code ${result.processCode})`);
      onOpen({ channelType: ChannelType.group, channelId: groupId.trim() });
    } catch (e) {
      setNote(describeError(e));
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.inline}>
        <TextInput
          style={[styles.input, styles.flex]}
          placeholder="User ID to chat with"
          value={peer}
          onChangeText={setPeer}
          autoCapitalize="none"
        />
        <Button
          title="Chat"
          disabled={!peer.trim()}
          onPress={() =>
            onOpen({ channelType: ChannelType.direct, channelId: peer.trim() })
          }
        />
      </View>
      <View style={styles.inline}>
        <TextInput
          style={[styles.input, styles.flex]}
          placeholder="Group ID"
          value={groupId}
          onChangeText={setGroupId}
          autoCapitalize="none"
        />
        <TextInput
          style={[styles.input, styles.flex]}
          placeholder="Members (a,b)"
          value={members}
          onChangeText={setMembers}
          autoCapitalize="none"
        />
        <Button
          title="Create"
          disabled={!groupId.trim()}
          onPress={createGroup}
        />
      </View>
      {note ? <Text style={styles.hint}>{note}</Text> : null}
      {error ? <Text style={styles.error}>{describeError(error)}</Text> : null}
      <FlatList
        data={channels}
        keyExtractor={(c) =>
          `${c.channelType}:${c.channelId}:${c.subChannelId ?? ''}`
        }
        renderItem={({ item }) => (
          <ChannelRow channel={item} onPress={() => onOpen(item)} />
        )}
        onEndReached={loadMore}
        onRefresh={refresh}
        refreshing={loading}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.hint}>No conversations yet.</Text>
          )
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/** "read", or "read 2/5" in groups; empty when unread. */
function readLabel(state: {
  read: boolean;
  readCount?: number;
  totalCount?: number;
}): string {
  if (!state.read) return '';
  return state.totalCount !== undefined && state.totalCount > 1
    ? `read ${state.readCount ?? 0}/${state.totalCount}`
    : 'read';
}

/** Status line for an own message: send state first, then read state. */
function ownStatus(send: MessageSendState, read: string): string {
  switch (send.status) {
    case 'sending':
      return send.progress !== undefined
        ? `sending ${send.progress}%`
        : 'sending';
    case 'failed':
      return send.canRetry ? 'failed · tap to act' : 'failed';
    case 'canceled':
      return 'canceled';
    default:
      return read || 'sent';
  }
}

/** Mentions typed as "@userId" (or "@all") in group messages. */
function mentionsIn(text: string): string[] | 'all' | undefined {
  const ids = [...text.matchAll(/@([\w.-]+)/g)].map((m) => m[1] as string);
  if (ids.includes('all')) return 'all';
  return ids.length > 0 ? ids : undefined;
}

function MessageBubble({
  message,
  mine,
  senderName,
  status,
  selected,
  onPress,
}: {
  message: Message;
  mine: boolean;
  senderName: string;
  status: string;
  selected: boolean;
  onPress: () => void;
}) {
  const quoted =
    message.content.type === 'reference' && message.content.referMsg
      ? contentPreview(message.content.referMsg)
      : undefined;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`message ${message.messageId ?? message.clientId}`}
      style={[
        styles.bubble,
        mine ? styles.mine : styles.theirs,
        selected ? styles.selected : null,
      ]}
    >
      {!mine ? <Text style={styles.sender}>{senderName}</Text> : null}
      {quoted ? (
        <Text numberOfLines={1} style={styles.quote}>
          {quoted}
        </Text>
      ) : null}
      <Text>{contentPreview(message.content)}</Text>
      <Text style={styles.meta}>
        {new Date(message.sentTime).toLocaleTimeString()}
        {message.hasChanged ? ' · edited' : ''}
        {mine ? ` · ${status}` : ''}
      </Text>
    </Pressable>
  );
}

function Chat({
  channel,
  onBack,
}: {
  channel: ChannelIdentifier;
  onBack: () => void;
}) {
  const client = useNexconnClient();
  const { userId } = useConnection();
  const {
    messages,
    receipts,
    outbox,
    readState,
    sendState,
    loadOlder,
    send,
    reply,
    retry,
    cancel,
    discard,
    edit,
    recall,
    refresh,
    loading,
    error,
  } = useMessages(channel);
  const typing = useTypingUsers(channel);
  const isGroup = channel.channelType === ChannelType.group;
  const {
    draft: text,
    setDraft: setText,
    clear: clearDraft,
  } = useDraft(channel);
  const mentions = useUnreadMentions(channel);
  const senders = useUsers(
    useMemo(
      () => [
        ...new Set(
          messages.flatMap((m) =>
            m.senderUserId && m.senderUserId !== userId ? [m.senderUserId] : []
          )
        ),
      ],
      [messages, userId]
    )
  );
  const [mediaPath, setMediaPath] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [selected, setSelected] = useState<Message | undefined>();
  const [replyTarget, setReplyTarget] = useState<Message | undefined>();
  const [panel, setPanel] = useState<'none' | 'search' | 'members'>('none');
  const [keyword, setKeyword] = useState('');
  const search = useMessageSearch(panel === 'search' ? keyword : '', {
    channel,
  });
  const inverted = useMemo(() => [...messages].reverse(), [messages]);
  const nameOf = (id?: string) =>
    (id && (senders.get(id)?.name || id)) || 'unknown';

  useEffect(() => {
    client.channels
      .clearUnreadCount(channel)
      .then(() => mentions.refresh())
      .catch(() => undefined);
    // mentions.refresh is stable per channel/session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, channel, messages.length]);

  useEffect(() => {
    // Send read receipts for received messages that requested one.
    const ids = messages
      .filter(
        (m) =>
          m.senderUserId !== userId &&
          m.needReceipt &&
          !m.sentReceipt &&
          m.messageId
      )
      .map((m) => m.messageId as string);
    if (ids.length > 0)
      client.messages
        .sendReadReceiptResponse(channel, ids)
        .catch(() => undefined);
  }, [client, channel, messages, userId]);

  const onChangeText = (value: string) => {
    setText(value);
    if (channel.channelType === ChannelType.direct && value.length % 10 === 1) {
      client.channels
        .sendTypingStatus(channel, 'RC:TxtMsg')
        .catch(() => undefined);
    }
  };

  const act = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      setStatus(label);
    } catch (e) {
      setStatus(describeError(e));
    }
  };

  const sendText = async () => {
    const body = text.trim();
    if (!body) return;
    const target = replyTarget;
    clearDraft().catch(() => undefined);
    setReplyTarget(undefined);
    const mentioned = isGroup ? mentionsIn(body) : undefined;
    await act('', async () => {
      if (target) {
        await reply(target, body, {
          needReceipt: true,
          mentionSender: isGroup,
        });
      } else {
        const content: OutgoingContent = { type: 'text', text: body };
        await send(mentioned ? withMentions(content, mentioned) : content, {
          needReceipt: true,
        });
      }
    });
  };

  const sendFile = async () => {
    const path = mediaPath.trim();
    if (!path) return;
    const isImage = /\.(jpe?g|png|heic|webp)$/i.test(path);
    setMediaPath('');
    // Upload progress shows on the bubble (sendState).
    await act('Uploaded', () =>
      send(
        isImage
          ? { type: 'image', localPath: path }
          : { type: 'file', localPath: path }
      )
    );
  };

  const actions = (m: Message): { title: string; run: () => void }[] => {
    const mine = m.senderUserId === userId;
    const state = sendState(m);
    const close = () => setSelected(undefined);
    const list: { title: string; run: () => void }[] = [];
    if (mine && state.status === 'sending' && outbox.has(m.clientId)) {
      list.push({
        title: 'Cancel upload',
        run: () => act('Canceled', () => cancel(m)).finally(close),
      });
    }
    if (mine && state.canRetry) {
      list.push({
        title: 'Retry',
        run: () => act('Resent', () => retry(m)).finally(close),
      });
    }
    if (mine && (state.status === 'failed' || state.status === 'canceled')) {
      list.push({
        title: 'Discard',
        run: () => act('Discarded', () => discard(m)).finally(close),
      });
    }
    if (m.messageId && state.status === 'sent') {
      list.push({
        title: 'Reply',
        run: () => {
          setReplyTarget(m);
          close();
        },
      });
      if (mine && m.content.type === 'text') {
        list.push({
          title: 'Edit with composer text',
          run: () => {
            const body = text.trim();
            if (!body) {
              setStatus('Type the new text first');
              return;
            }
            act('Edited', async () => {
              await edit(m, { type: 'text', text: body });
              await clearDraft();
            }).finally(close);
          },
        });
      }
      if (mine) {
        list.push({
          title: 'Recall',
          run: () => act('Recalled', () => recall(m)).finally(close),
        });
      }
    }
    return list;
  };

  return (
    <View style={styles.flex}>
      <View style={styles.inline}>
        <Button title="‹ Back" onPress={onBack} />
        <Text style={[styles.h2, styles.flex]} numberOfLines={1}>
          {isGroup ? '# ' : ''}
          {isGroup ? channel.channelId : nameOf(channel.channelId)}
        </Text>
        <Button
          title="Search"
          onPress={() => setPanel(panel === 'search' ? 'none' : 'search')}
        />
        {isGroup ? (
          <Button
            title="Members"
            onPress={() => setPanel(panel === 'members' ? 'none' : 'members')}
          />
        ) : null}
        <Button title="Refresh" onPress={refresh} />
      </View>
      {panel === 'members' ? <GroupPanel groupId={channel.channelId} /> : null}
      {panel === 'search' ? (
        <View style={styles.panel}>
          <TextInput
            style={styles.input}
            placeholder="Search this chat"
            value={keyword}
            onChangeText={setKeyword}
            autoCapitalize="none"
          />
          {search.items.slice(0, 20).map((m) => (
            <Text key={`${m.clientId}:${m.messageId ?? ''}`} numberOfLines={1}>
              {new Date(m.sentTime).toLocaleString()} ·{' '}
              {contentPreview(m.content)}
            </Text>
          ))}
          {search.keyword && !search.loading && search.items.length === 0 ? (
            <Text style={styles.hint}>No matches.</Text>
          ) : null}
          {search.hasMore && search.items.length > 0 ? (
            <Button title="More results" onPress={search.loadMore} />
          ) : null}
        </View>
      ) : null}
      {mentions.messages.length > 0 ? (
        <Text style={styles.mention}>
          {mentions.messages.length} unread mention
          {mentions.messages.length > 1 ? 's' : ''} of you
        </Text>
      ) : null}
      {typing.length > 0 ? (
        <Text style={styles.hint}>
          {typing.map((t) => nameOf(t.userId)).join(', ')} typing…
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{describeError(error)}</Text> : null}
      <FlatList
        inverted
        data={inverted}
        extraData={[receipts, outbox, selected, senders]}
        keyExtractor={(m) => `${m.clientId}:${m.messageId ?? ''}`}
        renderItem={({ item }) => {
          const mine = item.senderUserId === userId;
          return (
            <MessageBubble
              message={item}
              mine={mine}
              senderName={nameOf(item.senderUserId)}
              status={
                mine
                  ? ownStatus(sendState(item), readLabel(readState(item)))
                  : ''
              }
              selected={selected?.clientId === item.clientId}
              onPress={() =>
                setSelected(
                  selected?.clientId === item.clientId ? undefined : item
                )
              }
            />
          );
        }}
        onEndReached={loadOlder}
        ListFooterComponent={loading ? <ActivityIndicator /> : undefined}
      />
      {selected ? (
        <View style={[styles.inline, styles.wrap]}>
          {actions(selected).map((a) => (
            <Button key={a.title} title={a.title} onPress={a.run} />
          ))}
          <Button title="Close" onPress={() => setSelected(undefined)} />
        </View>
      ) : null}
      {status ? <Text style={styles.hint}>{status}</Text> : null}
      {replyTarget ? (
        <View style={styles.inline}>
          <Text style={[styles.quote, styles.flex]} numberOfLines={1}>
            Replying to {nameOf(replyTarget.senderUserId)}:{' '}
            {contentPreview(replyTarget.content)}
          </Text>
          <Button title="×" onPress={() => setReplyTarget(undefined)} />
        </View>
      ) : null}
      <View style={styles.inline}>
        <TextInput
          style={[styles.input, styles.flex]}
          placeholder="Local file path (image/file)"
          value={mediaPath}
          onChangeText={setMediaPath}
          autoCapitalize="none"
        />
        <Button
          title="Send file"
          disabled={!mediaPath.trim()}
          onPress={sendFile}
        />
      </View>
      <View style={styles.inline}>
        <TextInput
          style={[styles.input, styles.flex]}
          placeholder={isGroup ? 'Message (@userId to mention)' : 'Message'}
          value={text}
          onChangeText={onChangeText}
          onSubmitEditing={sendText}
          autoCapitalize="none"
        />
        <Button title="Send" disabled={!text.trim()} onPress={sendText} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Group panel
// ---------------------------------------------------------------------------

function roleName(role: number): string {
  return (
    { [GroupMemberRole.owner]: 'owner', [GroupMemberRole.admin]: 'admin' }[
      role
    ] ?? 'member'
  );
}

function GroupPanel({ groupId }: { groupId: string }) {
  const client = useNexconnClient();
  const { userId } = useConnection();
  const { group, error: groupError } = useGroup(groupId);
  const members = useGroupMembers(groupId, { pageSize: 50 });
  const [invitee, setInvitee] = useState('');
  const [note, setNote] = useState<string | undefined>();
  const myRole = members.items.find((m) => m.userId === userId)?.role;
  const canManage =
    myRole === GroupMemberRole.owner || myRole === GroupMemberRole.admin;

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      const result = await fn();
      setNote(typeof result === 'number' ? `${label} (code ${result})` : label);
    } catch (e) {
      setNote(describeError(e));
    }
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.h3}>
        {group ? `${group.groupName} · ${group.membersCount} members` : groupId}
      </Text>
      {groupError ? (
        <Text style={styles.error}>{describeError(groupError)}</Text>
      ) : null}
      {members.items.map((m) => (
        <View key={m.userId} style={styles.inline}>
          <Text style={styles.flex}>
            {m.nickname || m.name || m.userId} · {roleName(m.role)}
          </Text>
          {canManage && m.userId !== userId && m.role === 1 ? (
            <Button
              title="Make admin"
              onPress={() =>
                run('Admin added', () =>
                  client.groups.addAdmins(groupId, [m.userId])
                )
              }
            />
          ) : null}
          {myRole === GroupMemberRole.owner && m.role === 2 ? (
            <Button
              title="Remove admin"
              onPress={() =>
                run('Admin removed', () =>
                  client.groups.removeAdmins(groupId, [m.userId])
                )
              }
            />
          ) : null}
          {canManage && m.userId !== userId && m.role !== 3 ? (
            <Button
              title="Kick"
              onPress={() =>
                run('Kicked', () =>
                  client.groups.kickMembers(groupId, [m.userId])
                )
              }
            />
          ) : null}
        </View>
      ))}
      {members.hasMore && members.items.length > 0 ? (
        <Button title="More members" onPress={members.loadMore} />
      ) : null}
      <View style={styles.inline}>
        <TextInput
          style={[styles.input, styles.flex]}
          placeholder="Invite user ID"
          value={invitee}
          onChangeText={setInvitee}
          autoCapitalize="none"
        />
        <Button
          title="Invite"
          disabled={!invitee.trim()}
          onPress={() =>
            run('Invited', () =>
              client.groups.inviteUsers(groupId, [invitee.trim()])
            ).then(() => setInvitee(''))
          }
        />
        <Button
          title="Leave"
          onPress={() => run('Left group', () => client.groups.leave(groupId))}
        />
      </View>
      {note ? <Text style={styles.hint}>{note}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

function Contacts({ onOpen }: { onOpen: (c: ChannelIdentifier) => void }) {
  const client = useNexconnClient();
  const { friends, error, refresh } = useFriends();
  const online = useOnlineStatus(
    useMemo(() => friends.map((f) => f.userId), [friends])
  );
  const applications = useFriendApplications({
    applicationStatuses: [FriendApplicationStatus.unhandled],
  });
  const blocked = useBlockedUsers();
  const [other, setOther] = useState('');
  const [note, setNote] = useState<string | undefined>();

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      const result = await fn();
      setNote(typeof result === 'number' ? `${label} (code ${result})` : label);
    } catch (e) {
      setNote(describeError(e));
    }
  };
  const id = other.trim();

  return (
    <ScrollView contentContainerStyle={styles.form}>
      <View style={styles.inline}>
        <TextInput
          style={[styles.input, styles.flex]}
          placeholder="User ID"
          value={other}
          onChangeText={setOther}
          autoCapitalize="none"
        />
        <Button
          title="Add friend"
          disabled={!id}
          onPress={() => run('Request sent', () => client.users.addFriend(id))}
        />
        <Button
          title="Block"
          disabled={!id}
          onPress={() => run('Blocked', () => blocked.block(id))}
        />
      </View>
      {note ? <Text style={styles.hint}>{note}</Text> : null}
      {error ? <Text style={styles.error}>{describeError(error)}</Text> : null}

      <Text style={styles.h3}>Friends ({friends.length})</Text>
      {friends.map((f) => (
        <Pressable
          key={f.userId}
          style={styles.row}
          onPress={() =>
            onOpen({ channelType: ChannelType.direct, channelId: f.userId })
          }
        >
          <Text style={styles.flex}>
            {f.remark || f.name || f.userId}
            {online.get(f.userId)?.isOnline ? ' · online' : ''}
          </Text>
          <Button
            title="Remove"
            onPress={() =>
              run('Removed', () => client.users.removeFriends([f.userId]))
            }
          />
        </Pressable>
      ))}
      <Button title="Reload friends" onPress={refresh} />

      <Text style={styles.h3}>Pending requests</Text>
      {applications.items.length === 0 ? (
        <Text style={styles.hint}>None.</Text>
      ) : null}
      {applications.items.map((a) => (
        <View key={`${a.applicationType}:${a.userId}`} style={styles.inline}>
          <Text style={styles.flex}>
            {a.name || a.userId} ·{' '}
            {a.applicationType === FriendApplicationType.received
              ? 'wants to be friends'
              : 'request sent'}
          </Text>
          {a.applicationType === FriendApplicationType.received ? (
            <>
              <Button
                title="Accept"
                onPress={() =>
                  run('Accepted', () =>
                    client.users.acceptFriendApplication(a.userId)
                  )
                }
              />
              <Button
                title="Refuse"
                onPress={() =>
                  run('Refused', () =>
                    client.users.refuseFriendApplication(a.userId)
                  )
                }
              />
            </>
          ) : null}
        </View>
      ))}

      <Text style={styles.h3}>Blocked ({blocked.userIds.length})</Text>
      {blocked.userIds.map((u) => (
        <View key={u} style={styles.inline}>
          <Text style={styles.flex}>{u}</Text>
          <Button
            title="Unblock"
            onPress={() => run('Unblocked', () => blocked.unblock(u))}
          />
        </View>
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Developer playground
// ---------------------------------------------------------------------------

const LOGGED_EVENTS = [
  'connectionStatusChanged',
  'messageReceived',
  'offlineMessageSyncCompleted',
  'messagesUpdated',
  'messagesDeleted',
  'readReceiptResponse',
  'typingStatusChanged',
  'channelPinnedSync',
  'groupOperation',
  'notificationOpened',
  'notificationReceived',
  'pushTokenReceived',
  'pushTokenError',
  'pushTokenReportResult',
  'unknownNativeEvent',
] as const;

/**
 * Redacted event log kept outside the Playground screen, so lines written
 * while another screen is open (e.g. a notification tap that opens a chat)
 * are still there when the Playground is opened again.
 */
const demoLog = {
  lines: [] as readonly string[],
  listeners: new Set<() => void>(),
};

function appendLog(line: string): void {
  demoLog.lines = [
    `${new Date().toLocaleTimeString()} ${line}`,
    ...demoLog.lines,
  ].slice(0, 50);
  demoLog.listeners.forEach((listener) => listener());
}

function subscribeLog(listener: () => void): () => void {
  demoLog.listeners.add(listener);
  return () => {
    demoLog.listeners.delete(listener);
  };
}

const getLog = () => demoLog.lines;

function Playground() {
  const client = useNexconnClient();
  const snapshot = useConnection();
  const unread = useTotalUnreadCount();
  const log = useSyncExternalStore(subscribeLog, getLog, getLog);
  const [output, setOutput] = useState('');
  const push = appendLog;

  useEffect(() => {
    // Redacted log: event names and ids only, never message bodies or tokens.
    const subs = LOGGED_EVENTS.map((name) =>
      client.on(name, (payload) => {
        const p = payload as { message?: Message; status?: number };
        const detail =
          name === 'connectionStatusChanged'
            ? String(enumName(ConnectionStatus, p.status ?? -2))
            : p.message
              ? `client=${p.message.clientId}`
              : '';
        push(`${name} ${detail}`);
      })
    );
    return () => subs.forEach((off) => off());
  }, [client, push]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      setOutput(`${label}:\n${JSON.stringify(await fn(), null, 2)}`);
    } catch (e) {
      setOutput(`${label} failed: ${describeError(e)}`);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.form}>
      <Text style={styles.h2}>Playground</Text>
      <Text>Platform: {client.platform}</Text>
      <Text>
        Status: {String(enumName(ConnectionStatus, snapshot.connectionStatus))}
      </Text>
      <Text>
        User: {snapshot.userId ?? '—'} · generation {snapshot.generation}
      </Text>
      <Text>Total unread: {unread}</Text>
      <View style={styles.wrap}>
        <Button
          title="Capabilities"
          onPress={() => run('capabilities', () => client.getCapabilities())}
        />
        <Button
          title="SDK version"
          onPress={() => run('version', () => client.getSdkVersion())}
        />
        <Button
          title="App settings"
          onPress={() => run('appSettings', () => client.getAppSettings())}
        />
        <Button
          title="My profile"
          onPress={() => run('profile', () => client.users.getMyProfile())}
        />
        <Button
          title="Blocklist"
          onPress={() => run('blocklist', () => client.users.getBlocklist())}
        />
        <Button
          title="Tags"
          onPress={() => run('tags', () => client.tags.getTags())}
        />
        <Button
          title="DND time"
          onPress={() =>
            run('noDisturb', () => client.notifications.getNoDisturbTime())
          }
        />
        <Button
          title="Push permission"
          onPress={() =>
            run('push.requestPermission', () => client.push.requestPermission())
          }
        />
        <Button
          title="Push token?"
          onPress={() =>
            // Reports whether a token exists, never the token itself.
            run('push.getToken', async () => {
              const token = await client.push.getToken();
              return token
                ? { pushType: token.pushType, length: token.token.length }
                : null;
            })
          }
        />
        <Button
          title="Disconnect"
          onPress={() => run('disconnect', () => client.disconnect())}
        />
      </View>
      <Text selectable style={styles.code}>
        {output}
      </Text>
      <Text style={styles.h3}>Events (redacted)</Text>
      {log.map((line, i) => (
        <Text key={`${i}:${line}`} style={styles.code}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function Signed() {
  const [tab, setTab] = useState<'chats' | 'contacts' | 'playground'>('chats');
  const [open, setOpen] = useState<ChannelIdentifier | undefined>();
  const unread = useTotalUnreadCount();
  useNexconnEvent('messageReceived', () => undefined);
  // Tapping a Nexconn notification opens that chat (cold start included).
  useNotificationOpened((notification) => {
    // Logged here so warm taps and cold-start taps (delivered through
    // getInitialNotification, not as an event) both leave a line.
    appendLog(
      `notificationOpened (routed) id=${notification.id} channel=${notification.channelType ?? '?'}:${notification.channelId ?? '?'}`
    );
    if (notification.channelType !== undefined && notification.channelId) {
      setOpen({
        channelType: notification.channelType,
        channelId: notification.channelId,
      });
    }
  });
  if (open) return <Chat channel={open} onBack={() => setOpen(undefined)} />;
  return (
    <View style={styles.flex}>
      <View style={styles.tabs}>
        <Button
          title={`Chats${unread ? ` (${unread})` : ''}`}
          onPress={() => setTab('chats')}
        />
        <Button title="Contacts" onPress={() => setTab('contacts')} />
        <Button title="Playground" onPress={() => setTab('playground')} />
      </View>
      {tab === 'chats' ? <Conversations onOpen={setOpen} /> : null}
      {tab === 'contacts' ? <Contacts onOpen={setOpen} /> : null}
      {tab === 'playground' ? <Playground /> : null}
    </View>
  );
}

function Root({ defaults }: { defaults?: DemoDefaults }) {
  const { connectionStatus, userId } = useConnection();
  const connected = connectionStatus === ConnectionStatus.connected && userId;
  return connected ? <Signed /> : <SignIn defaults={defaults} />;
}

export function DemoApp({ title, defaults }: DemoAppProps) {
  const client: NexconnClient = useMemo(() => getNexconnClient(), []);
  return (
    <NexconnProvider client={client}>
      <SafeAreaView style={styles.flex}>
        <Text style={styles.h1}>{title}</Text>
        <Root defaults={defaults} />
      </SafeAreaView>
    </NexconnProvider>
  );
}

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secure?: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secure}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

function Button(props: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.button, props.disabled ? styles.buttonDisabled : null]}
    >
      <Text style={styles.buttonText}>{props.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { padding: 16, gap: 10 },
  h1: { fontSize: 18, fontWeight: '700', padding: 12 },
  h2: { fontSize: 16, fontWeight: '600' },
  h3: { fontSize: 14, fontWeight: '600', marginTop: 12 },
  hint: { color: '#555', paddingHorizontal: 12, paddingVertical: 4 },
  error: { color: '#b00020', paddingHorizontal: 12 },
  label: { fontSize: 12, color: '#444', marginBottom: 2 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 36,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  rowMain: { flex: 1 },
  rowTitle: { fontWeight: '600' },
  rowSub: { color: '#666' },
  badge: {
    backgroundColor: '#d32f2f',
    borderRadius: 10,
    minWidth: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  badgeText: { color: 'white', fontSize: 12 },
  bubble: { margin: 6, padding: 8, borderRadius: 8, maxWidth: '80%' },
  mine: { alignSelf: 'flex-end', backgroundColor: '#dcf8c6' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#f1f1f1' },
  sender: { fontSize: 11, color: '#555', marginBottom: 2 },
  meta: { fontSize: 10, color: '#777', marginTop: 2 },
  selected: { borderWidth: 2, borderColor: '#1565c0' },
  quote: {
    fontSize: 11,
    color: '#555',
    borderLeftWidth: 2,
    borderColor: '#999',
    paddingLeft: 6,
    marginBottom: 2,
  },
  mention: {
    color: '#1565c0',
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  panel: {
    padding: 12,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  button: {
    backgroundColor: '#1565c0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: 'white', fontWeight: '600' },
  code: { fontFamily: 'Courier', fontSize: 11 },
});
