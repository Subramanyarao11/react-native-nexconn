/**
 * React bindings for react-native-nexconn. React is a peer dependency.
 * Every hook resets its state when the connected user/session changes, so
 * data from a previous account is never shown to the next one.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { ClientSnapshot, NexconnClient } from '../core/client.ts';
import { ConnectionStatus, type ChannelType } from '../core/enums.ts';
import type {
  Channel,
  ChannelIdentifier,
  ChannelsQueryParams,
  Message,
  NexconnEventMap,
  NexconnEventName,
  OutgoingContent,
  PushNotification,
  SendMediaCallbacks,
  SendOptions,
  TypingStatus,
} from '../core/types.ts';
import type { PagedQuery } from '../core/query.ts';
import { isMediaContent } from '../core/encode.ts';
import {
  ChannelListStore,
  MessageListStore,
  reconcileDeleted,
  currentRecallNotice,
  sameChannel,
} from './stores.ts';

export {
  ChannelListStore,
  MessageListStore,
  reconcileDeleted,
  currentRecallNotice,
  sameChannel,
  channelKey,
} from './stores.ts';
export type { MessageLookupRef } from './stores.ts';

const ClientContext = createContext<NexconnClient | null>(null);

export interface NexconnProviderProps {
  client: NexconnClient;
  children?: ReactNode;
  /**
   * Re-reads the native session on mount (default true), so a JS reload
   * while the native SDK stays connected restores the signed-in state.
   */
  restoreSession?: boolean;
}

/** Makes a client available to the hooks below. */
export function NexconnProvider({
  client,
  children,
  restoreSession = true,
}: NexconnProviderProps) {
  useEffect(() => {
    if (restoreSession) client.restoreSession().catch(() => undefined);
  }, [client, restoreSession]);
  return createElement(ClientContext.Provider, { value: client }, children);
}

export function useNexconnClient(): NexconnClient {
  const client = useContext(ClientContext);
  if (!client) {
    throw new Error('useNexconnClient must be used inside <NexconnProvider>');
  }
  return client;
}

/** Connection state (status, user, generation) with automatic re-render. */
export function useConnection(): ClientSnapshot {
  const client = useNexconnClient();
  return useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot
  );
}

/** Subscribes to an SDK event for the lifetime of the component. */
export function useNexconnEvent<K extends NexconnEventName>(
  event: K,
  handler: (payload: NexconnEventMap[K]) => void
): void {
  const client = useNexconnClient();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(
    () => client.on(event, (payload) => ref.current(payload)),
    [client, event]
  );
}

function sessionKey(snapshot: ClientSnapshot): string {
  return `${snapshot.generation}:${snapshot.userId ?? ''}`;
}

interface AsyncState {
  loading: boolean;
  error: unknown;
}

export interface UseChannelListResult extends AsyncState {
  channels: readonly Channel[];
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Paged channel list that stays current: new messages, pin and no-disturb
 * syncs refresh the affected channel.
 */
export function useChannelList(
  params: ChannelsQueryParams = { channelTypes: [1, 3] as ChannelType[] }
): UseChannelListResult {
  const client = useNexconnClient();
  const snapshot = useConnection();
  const key = sessionKey(snapshot);
  const paramsKey = JSON.stringify(params);
  const storeRef = useRef(new ChannelListStore());
  const queryRef = useRef<PagedQuery<Channel> | undefined>(undefined);
  const [channels, setChannels] = useState<readonly Channel[]>([]);
  const [state, setState] = useState<AsyncState>({
    loading: false,
    error: undefined,
  });
  const [hasMore, setHasMore] = useState(true);
  const connected = snapshot.connectionStatus === ConnectionStatus.connected;

  const loadMore = useCallback(async () => {
    const query = queryRef.current;
    if (!query || !query.hasMore) return;
    setState({ loading: true, error: undefined });
    try {
      const page = await query.loadNextPage();
      if (queryRef.current !== query) return; // Reset meanwhile.
      if (storeRef.current.upsert(page.items))
        setChannels(storeRef.current.channels);
      setHasMore(query.hasMore);
      setState({ loading: false, error: undefined });
    } catch (error) {
      if (queryRef.current === query) setState({ loading: false, error });
    }
  }, []);

  const refresh = useCallback(async () => {
    void queryRef.current?.release();
    storeRef.current.reset();
    setChannels([]);
    setHasMore(true);
    queryRef.current = client.channels.createChannelsQuery(
      JSON.parse(paramsKey)
    );
    await loadMore();
  }, [client, paramsKey, loadMore]);

  useEffect(() => {
    storeRef.current.reset();
    setChannels([]);
    if (!connected) return undefined;
    void refresh();
    return () => {
      void queryRef.current?.release();
      queryRef.current = undefined;
    };
  }, [key, connected, refresh]);

  useEffect(() => {
    const reloadChannel = (channel: ChannelIdentifier) => {
      const types = (JSON.parse(paramsKey) as ChannelsQueryParams).channelTypes;
      if (!types.includes(channel.channelType)) return;
      client.channels
        .getChannel(channel)
        .then((updated) => {
          if (updated && storeRef.current.upsert([updated])) {
            setChannels(storeRef.current.channels);
          }
        })
        .catch(() => undefined);
    };
    const subs = [
      client.on('messageReceived', ({ message }) =>
        reloadChannel(message.channel)
      ),
      client.on('channelPinnedSync', ({ channel }) => reloadChannel(channel)),
      client.on('channelNoDisturbLevelSync', ({ channel }) =>
        reloadChannel(channel)
      ),
      client.on('channelUnreadStatusSync', ({ channel }) =>
        reloadChannel(channel)
      ),
      client.on('remoteChannelsSyncCompleted', () => void refresh()),
    ];
    return () => subs.forEach((unsubscribe) => unsubscribe());
  }, [client, paramsKey, refresh]);

  return { channels, hasMore, loadMore, refresh, ...state };
}

export interface UseMessagesResult extends AsyncState {
  messages: readonly Message[];
  hasMore: boolean;
  /** Loads older history. */
  loadOlder: () => Promise<void>;
  /** Sends content, picking `send` or `sendMedia` automatically. */
  send: (
    content: OutgoingContent,
    options?: SendOptions & Pick<SendMediaCallbacks, 'onProgress'>
  ) => Promise<Message>;
  /**
   * Edits a sent message and shows the SDK's updated copy in this list
   * immediately (the SDK does not always notify the editing client).
   */
  edit: (message: Message, content: OutgoingContent) => Promise<Message>;
  /**
   * Recalls a message for everyone. The recall notification returned by the
   * SDK (if any) replaces the original in the list immediately.
   */
  recall: (message: Message) => Promise<Message | undefined>;
  /**
   * Re-reads the newest page from the SDK and reconciles the list (removed,
   * edited and recalled messages). Use when the app may have missed a live
   * event, e.g. on screen focus or pull-to-refresh.
   */
  refresh: () => Promise<void>;
}

/**
 * Messages of one channel: history (newest first from the SDK, kept sorted
 * ascending here), live incoming messages, edits, recalls and deletions.
 */
export function useMessages(
  channel: ChannelIdentifier,
  options: { pageSize?: number } = {}
): UseMessagesResult {
  const client = useNexconnClient();
  const snapshot = useConnection();
  const key = sessionKey(snapshot);
  const channelId = `${channel.channelType}:${channel.channelId}:${channel.subChannelId ?? ''}`;
  const channelRef = useRef(channel);
  channelRef.current = channel;
  const storeRef = useRef(new MessageListStore(channel));
  const queryRef = useRef<PagedQuery<Message> | undefined>(undefined);
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [state, setState] = useState<AsyncState>({
    loading: false,
    error: undefined,
  });
  const [hasMore, setHasMore] = useState(true);
  const connected = snapshot.connectionStatus === ConnectionStatus.connected;
  const pageSize = options.pageSize ?? 30;

  const publish = () => setMessages(storeRef.current.messages);

  const loadOlder = useCallback(async () => {
    const query = queryRef.current;
    if (!query || !query.hasMore) return;
    setState({ loading: true, error: undefined });
    try {
      const page = await query.loadNextPage();
      if (queryRef.current !== query) return;
      if (storeRef.current.upsert(page.items)) publish();
      setHasMore(query.hasMore);
      setState({ loading: false, error: undefined });
    } catch (error) {
      if (queryRef.current === query) setState({ loading: false, error });
    }
  }, []);

  useEffect(() => {
    storeRef.current = new MessageListStore(channelRef.current);
    setMessages([]);
    setHasMore(true);
    if (!connected) return undefined;
    const query = client.messages.createMessagesQuery({
      channel: channelRef.current,
      pageSize,
      isAscending: false,
    });
    queryRef.current = query;
    void loadOlder();
    return () => {
      queryRef.current = undefined;
      void query.release();
    };
  }, [client, key, channelId, connected, pageSize, loadOlder]);

  useEffect(() => {
    const upsert = (list: readonly Message[]) => {
      if (storeRef.current.upsert(list)) publish();
    };
    const subs = [
      client.on('messageReceived', ({ message }) => upsert([message])),
      client.on('messagesUpdated', ({ messages: list }) => upsert(list)),
      client.on('readReceiptResponse', ({ responses }) => {
        // The SDK updates the stored message's read status; show its copy.
        const store = storeRef.current;
        const known = new Set(
          store.messages.flatMap((m) => (m.messageId ? [m.messageId] : []))
        );
        const ids = responses
          .filter((r) => !r.channel || sameChannel(r.channel, store.channel))
          .map((r) => r.messageId)
          .filter((id) => known.has(id));
        if (ids.length === 0) return;
        Promise.all(
          ids.map((messageId) =>
            client.messages.getById({ messageId }).catch(() => undefined)
          )
        )
          .then((fresh) => {
            if (storeRef.current !== store) return;
            const found = fresh.filter((m): m is Message => m !== undefined);
            if (store.upsert(found)) publish();
          })
          .catch(() => undefined);
      }),
      client.on(
        'messageMetadataUpdated',
        ({ message }) => message && upsert([message])
      ),
      client.on(
        'messageMetadataDeleted',
        ({ message }) => message && upsert([message])
      ),
      client.on('messagesDeleted', ({ messages: list }) => {
        const store = storeRef.current;
        const mine = list.filter((m) => sameChannel(m.channel, store.channel));
        if (mine.length === 0) return;
        reconcileDeleted(mine, (ref) => client.messages.getById(ref))
          .then(({ replacements, removed }) => {
            if (storeRef.current !== store) return; // channel/session changed
            const changed = store.remove(removed);
            if (store.upsert(replacements) || changed) publish();
          })
          .catch(() => undefined);
      }),
      client.on('expiredMessagesDeleted', ({ messages: list }) => {
        if (storeRef.current.remove(list)) publish();
      }),
    ];
    return () => subs.forEach((unsubscribe) => unsubscribe());
  }, [client, channelId]);

  const send = useCallback(
    async (
      content: OutgoingContent,
      sendOptions?: SendOptions & Pick<SendMediaCallbacks, 'onProgress'>
    ) => {
      const target = channelRef.current;
      const generation = client.getSnapshot().generation;
      const onAttached = (message: Message) => {
        if (client.getSnapshot().generation === generation) {
          storeRef.current.upsert([message]);
          publish();
        }
      };
      const sent =
        isMediaContent(content) || content.type === 'custom'
          ? await client.messages.sendMedia(target, content, {
              ...sendOptions,
              onAttached,
            })
          : await client.messages.send(target, content, {
              ...sendOptions,
              onAttached,
            });
      if (
        client.getSnapshot().generation === generation &&
        sameChannel(sent.channel, target)
      ) {
        storeRef.current.upsert([sent]);
        publish();
      }
      return sent;
    },
    [client]
  );

  const recall = useCallback(
    async (message: Message) => {
      const store = storeRef.current;
      const returned = await client.messages.deleteForAll(
        channelRef.current,
        message
      );
      // Some SDK builds resolve with the original (emptied) message rather
      // than the notice; then ask the SDK for its current copy. Content that
      // is not a recall notification is never shown.
      const notice = await currentRecallNotice(returned ?? message, (ref) =>
        client.messages.getById(ref)
      );
      if (storeRef.current === store) {
        const changed = store.remove([message]);
        const added = notice !== undefined && store.upsert([notice]);
        if (changed || added) publish();
      }
      return notice;
    },
    [client]
  );

  const refresh = useCallback(async () => {
    const store = storeRef.current;
    const query = client.messages.createMessagesQuery({
      channel: channelRef.current,
      pageSize,
      isAscending: false,
    });
    try {
      const page = await query.loadNextPage();
      if (storeRef.current === store && store.reconcileWindow(page.items)) {
        publish();
      }
    } catch (error) {
      if (storeRef.current === store) setState({ loading: false, error });
    } finally {
      query.release().catch(() => undefined);
    }
  }, [client, pageSize]);

  const edit = useCallback(
    async (message: Message, content: OutgoingContent) => {
      const store = storeRef.current;
      if (!message.messageId) {
        throw new TypeError(
          'Only sent messages (with a messageId) can be edited'
        );
      }
      const updated = await client.messages.update(
        channelRef.current,
        message.messageId,
        content
      );
      // Prefer the SDK's stored copy (carries hasChanged/updateInfo).
      const fresh = await client.messages
        .getById({ messageId: message.messageId })
        .catch(() => undefined);
      if (storeRef.current === store && store.upsert([fresh ?? updated])) {
        publish();
      }
      return fresh ?? updated;
    },
    [client]
  );

  return {
    messages,
    hasMore,
    loadOlder,
    send,
    edit,
    recall,
    refresh,
    ...state,
  };
}

/** Total unread count, refreshed on new messages and unread syncs. */
export function useTotalUnreadCount(): number {
  const client = useNexconnClient();
  const snapshot = useConnection();
  const [count, setCount] = useState(0);
  const connected = snapshot.connectionStatus === ConnectionStatus.connected;
  const key = sessionKey(snapshot);

  useEffect(() => {
    setCount(0);
    if (!connected) return undefined;
    let active = true;
    const refresh = () => {
      client.channels
        .getTotalUnreadCount()
        .then((value) => active && setCount(value))
        .catch(() => undefined);
    };
    refresh();
    const subs = [
      client.on('messageReceived', refresh),
      client.on('channelUnreadStatusSync', refresh),
      client.on('offlineMessageSyncCompleted', refresh),
    ];
    return () => {
      active = false;
      subs.forEach((unsubscribe) => unsubscribe());
    };
  }, [client, key, connected]);

  return count;
}

/** Users currently typing in a channel (as reported by the SDK). */
export function useTypingUsers(
  channel: ChannelIdentifier
): readonly TypingStatus[] {
  const client = useNexconnClient();
  const [users, setUsers] = useState<readonly TypingStatus[]>([]);
  const channelRef = useRef(channel);
  channelRef.current = channel;
  const channelId = `${channel.channelType}:${channel.channelId}`;
  useEffect(() => {
    setUsers([]);
    return client.on('typingStatusChanged', (event) => {
      if (sameChannel(event.channel, channelRef.current)) setUsers(event.users);
    });
  }, [client, channelId]);
  return users;
}

/**
 * Calls `handler` for each tapped Nexconn notification, including the one
 * that launched the app. Typical use: navigate to
 * `{ channelType, channelId }`. The latest `handler` is always used.
 */
export function useNotificationOpened(
  handler: (notification: PushNotification) => void
): void {
  const client = useNexconnClient();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(
    () =>
      client.push.onNotificationOpened((notification) =>
        handlerRef.current(notification)
      ),
    [client]
  );
}
