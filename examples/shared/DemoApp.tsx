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
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  enumName,
  getNexconnClient,
  isNexconnError,
  type Channel,
  type ChannelIdentifier,
  type Message,
  type MessageContent,
  type NexconnClient,
} from 'react-native-nexconn';
import {
  NexconnProvider,
  useChannelList,
  useConnection,
  useMessages,
  useNexconnClient,
  useNexconnEvent,
  useTotalUnreadCount,
  useTypingUsers,
} from 'react-native-nexconn/react';

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

function MessageBubble({
  message,
  mine,
  onLongPress,
}: {
  message: Message;
  mine: boolean;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      onLongPress={onLongPress}
      style={[styles.bubble, mine ? styles.mine : styles.theirs]}
    >
      {!mine ? <Text style={styles.sender}>{message.senderUserId}</Text> : null}
      <Text>{contentPreview(message.content)}</Text>
      <Text style={styles.meta}>
        {new Date(message.sentTime).toLocaleTimeString()}
        {message.hasChanged ? ' · edited' : ''}
        {mine ? ` · ${String(enumNameSafe(message.sentStatus))}` : ''}
      </Text>
    </Pressable>
  );
}

function enumNameSafe(value: number): string {
  const names: Record<number, string> = {
    10: 'sending',
    20: 'failed',
    30: 'sent',
    40: 'received',
    50: 'read',
    70: 'canceled',
  };
  return names[value] ?? String(value);
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
  const { messages, loadOlder, send, loading, error } = useMessages(channel);
  const typing = useTypingUsers(channel);
  const [text, setText] = useState('');
  const [mediaPath, setMediaPath] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const inverted = useMemo(() => [...messages].reverse(), [messages]);

  useEffect(() => {
    client.channels.clearUnreadCount(channel).catch(() => undefined);
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

  const sendText = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      await send({ type: 'text', text: body }, { needReceipt: true });
    } catch (e) {
      setStatus(describeError(e));
    }
  };

  const sendFile = async () => {
    const path = mediaPath.trim();
    if (!path) return;
    try {
      const isImage = /\.(jpe?g|png|heic|webp)$/i.test(path);
      await client.messages.sendMedia(
        channel,
        isImage
          ? { type: 'image', localPath: path }
          : { type: 'file', localPath: path },
        { onProgress: (p) => setStatus(`Uploading ${p}%`) }
      );
      setStatus('Uploaded');
      setMediaPath('');
    } catch (e) {
      setStatus(describeError(e));
    }
  };

  const recall = async (message: Message) => {
    try {
      await client.messages.deleteForAll(channel, message);
      setStatus('Recalled');
    } catch (e) {
      setStatus(describeError(e));
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.inline}>
        <Button title="‹ Back" onPress={onBack} />
        <Text style={styles.h2}>
          {channel.channelType === ChannelType.group ? '# ' : ''}
          {channel.channelId}
        </Text>
      </View>
      {typing.length > 0 ? (
        <Text style={styles.hint}>
          {typing.map((t) => t.userId).join(', ')} typing…
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{describeError(error)}</Text> : null}
      <FlatList
        inverted
        data={inverted}
        keyExtractor={(m) => `${m.clientId}:${m.messageId ?? ''}`}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            mine={item.senderUserId === userId}
            onLongPress={() => recall(item)}
          />
        )}
        onEndReached={loadOlder}
        ListFooterComponent={loading ? <ActivityIndicator /> : undefined}
      />
      {status ? <Text style={styles.hint}>{status}</Text> : null}
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
          placeholder="Message"
          value={text}
          onChangeText={onChangeText}
          onSubmitEditing={sendText}
        />
        <Button title="Send" disabled={!text.trim()} onPress={sendText} />
      </View>
    </View>
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
  'unknownNativeEvent',
] as const;

function Playground() {
  const client = useNexconnClient();
  const snapshot = useConnection();
  const unread = useTotalUnreadCount();
  const [log, setLog] = useState<string[]>([]);
  const [output, setOutput] = useState('');

  const push = useCallback(
    (line: string) => setLog((prev) => [line, ...prev].slice(0, 50)),
    []
  );

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
        push(`${new Date().toLocaleTimeString()} ${name} ${detail}`);
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
  const [tab, setTab] = useState<'chats' | 'playground'>('chats');
  const [open, setOpen] = useState<ChannelIdentifier | undefined>();
  const unread = useTotalUnreadCount();
  useNexconnEvent('messageReceived', () => undefined);
  if (open) return <Chat channel={open} onBack={() => setOpen(undefined)} />;
  return (
    <View style={styles.flex}>
      <View style={styles.tabs}>
        <Button
          title={`Chats${unread ? ` (${unread})` : ''}`}
          onPress={() => setTab('chats')}
        />
        <Button title="Playground" onPress={() => setTab('playground')} />
      </View>
      {tab === 'chats' ? <Conversations onOpen={setOpen} /> : <Playground />}
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
