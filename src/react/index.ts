/**
 * React bindings for react-native-nexconn. React is a peer dependency.
 * Every hook resets its state when the connected user/session changes, so
 * data from a previous account is never shown to the next one. Within one
 * session, a network drop keeps the loaded data; hooks revalidate it when
 * the SDK reconnects.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageDirection, type ChannelType } from '../core/enums.ts';
import { NexconnError, isNexconnError } from '../core/errors.ts';
import { replyTo } from '../core/helpers.ts';
import type {
  Channel,
  ChannelIdentifier,
  ChannelsQueryParams,
  Message,
  OutgoingContent,
  ReadReceiptInfo,
  SendMediaCallbacks,
  SendOptions,
  TypingStatus,
} from '../core/types.ts';
import type { PagedQuery } from '../core/query.ts';
import { isMediaContent } from '../core/encode.ts';
import {
  detach,
  IDLE,
  useNexconnClient,
  useSession,
  type AsyncState,
} from './context.ts';
import {
  ChannelListStore,
  MessageListStore,
  OutboxStore,
  reconcileDeleted,
  currentRecallNotice,
  readStateOf,
  resendableContent,
  sameChannel,
  sendStateOf,
  type MessageReadState,
  type MessageSendState,
  type OutboxEntry,
} from './stores.ts';

export {
  NexconnProvider,
  useNexconnClient,
  useConnection,
  useNexconnEvent,
  useSession,
} from './context.ts';
export type { NexconnProviderProps, AsyncState } from './context.ts';
export {
  ChannelListStore,
  MessageListStore,
  KeyedListStore,
  OutboxStore,
  reconcileDeleted,
  currentRecallNotice,
  readStateOf,
  sendStateOf,
  resendableContent,
  sameChannel,
  channelKey,
} from './stores.ts';
export type {
  MessageLookupRef,
  MessageReadState,
  MessageSendState,
  OutboxEntry,
} from './stores.ts';
export type { UsePagedListResult } from './paged.ts';
export { useGroup, useGroupMembers, useJoinedGroups } from './groups.ts';
export type { UseGroupResult, UseGroupMembersOptions } from './groups.ts';
export {
  useUsers,
  useUser,
  useOnlineStatus,
  useBlockedUsers,
  useFriends,
  useFriendApplications,
  getUserProfileCache,
} from './users.ts';
export type {
  UseOnlineStatusOptions,
  UseBlockedUsersResult,
  UseFriendsResult,
} from './users.ts';
export { UserProfileCache } from './profiles.ts';
export { useMessageSearch } from './search.ts';
export type {
  UseMessageSearchOptions,
  UseMessageSearchResult,
} from './search.ts';
export { useDraft, useUnreadMentions } from './channel.ts';
export type { UseDraftResult, UseUnreadMentionsResult } from './channel.ts';
export { useOpenChannel, useCommunitySubChannels } from './open.ts';
export type {
  OpenChannelStatus,
  UseOpenChannelResult,
  UseCommunitySubChannelsResult,
} from './open.ts';

export interface UseChannelListResult extends AsyncState {
  channels: readonly Channel[];
  hasMore: boolean;
  loadMore: () => Promise<void>;
  /** Reloads the first page; current channels stay until it arrives. */
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
  const { key, connected } = useSession();
  const paramsKey = JSON.stringify(params);
  const storeRef = useRef(new ChannelListStore());
  const queryRef = useRef<PagedQuery<Channel> | undefined>(undefined);
  const loadedRef = useRef(false);
  const epochRef = useRef(0);
  const [channels, setChannels] = useState<readonly Channel[]>([]);
  const [state, setState] = useState<AsyncState>(IDLE);
  const [hasMore, setHasMore] = useState(true);

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
      setState(IDLE);
    } catch (error) {
      if (queryRef.current === query) setState({ loading: false, error });
    }
  }, []);

  const refresh = useCallback(async () => {
    const epoch = epochRef.current;
    const query = client.channels.createChannelsQuery(JSON.parse(paramsKey));
    setState((s) => ({ ...s, loading: true }));
    try {
      const page = await query.loadNextPage();
      if (epochRef.current !== epoch) {
        detach(query.release());
        return;
      }
      detach(queryRef.current?.release());
      queryRef.current = query;
      loadedRef.current = true;
      const store = new ChannelListStore();
      store.upsert(page.items);
      storeRef.current = store;
      setChannels(store.channels);
      setHasMore(query.hasMore);
      setState(IDLE);
    } catch (error) {
      detach(query.release());
      if (epochRef.current === epoch) setState({ loading: false, error });
    }
  }, [client, paramsKey]);

  // New session or parameters: start over.
  useEffect(() => {
    epochRef.current += 1;
    loadedRef.current = false;
    storeRef.current = new ChannelListStore();
    setChannels([]);
    setHasMore(true);
    setState(IDLE);
    return () => {
      epochRef.current += 1;
      detach(queryRef.current?.release());
      queryRef.current = undefined;
    };
  }, [key, paramsKey]);

  // First load once connected; after a reconnect, revalidate in place.
  useEffect(() => {
    if (!connected) return;
    if (!loadedRef.current) {
      loadedRef.current = true;
      queryRef.current = client.channels.createChannelsQuery(
        JSON.parse(paramsKey)
      );
      detach(loadMore());
    } else {
      detach(refresh());
    }
  }, [client, key, paramsKey, connected, loadMore, refresh]);

  useEffect(() => {
    const reloadChannel = (channel: ChannelIdentifier) => {
      const types = (JSON.parse(paramsKey) as ChannelsQueryParams).channelTypes;
      if (!types.includes(channel.channelType)) return;
      const store = storeRef.current;
      client.channels
        .getChannel(channel)
        .then((updated) => {
          if (storeRef.current !== store) return;
          if (updated && store.upsert([updated])) setChannels(store.channels);
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
      client.on('remoteChannelsSyncCompleted', () => detach(refresh())),
    ];
    return () => subs.forEach((unsubscribe) => unsubscribe());
  }, [client, paramsKey, refresh]);

  return { channels, hasMore, loadMore, refresh, ...state };
}

export type MessageSendOptions = SendOptions &
  Pick<SendMediaCallbacks, 'onProgress'>;

export interface UseMessagesResult extends AsyncState {
  messages: readonly Message[];
  /**
   * Read-receipt counts per `messageId`, from the SDK's receipt events and
   * `getReadReceiptInfo`. The Android SDK reports receipts without updating
   * the stored message's `sentStatus`, so render read state with
   * `readState(message)` rather than `sentStatus` alone.
   */
  receipts: ReadonlyMap<string, ReadReceiptInfo>;
  /** Read state of an outgoing message (`sentStatus` + receipt counts). */
  readState: (message: Message) => MessageReadState;
  /** This session's in-flight and failed sends, by `clientId`. */
  outbox: ReadonlyMap<number, OutboxEntry>;
  /** Sending / failed / canceled / sent, with upload progress and error. */
  sendState: (message: Message) => MessageSendState;
  hasMore: boolean;
  /** Loads older history. */
  loadOlder: () => Promise<void>;
  /**
   * Sends content, picking `send` or `sendMedia` automatically. The message
   * appears as soon as the SDK stores it; on failure it stays in the list
   * (`sendState(...).status === 'failed'`) and the promise rejects.
   */
  send: (
    content: OutgoingContent,
    options?: MessageSendOptions
  ) => Promise<Message>;
  /** Sends a reply quoting `target` (see `replyTo`). */
  reply: (
    target: Message,
    text: string,
    options?: MessageSendOptions & { mentionSender?: boolean }
  ) => Promise<Message>;
  /**
   * Sends a failed or canceled message again. Allowed only when the SDK's
   * copy says the send definitively failed (`sendState(m).canRetry`), so the
   * server cannot end up with two copies. The failed local copy is deleted
   * once the new one is stored.
   */
  retry: (message: Message) => Promise<Message>;
  /** Cancels an in-flight media upload. */
  cancel: (message: Message) => Promise<void>;
  /** Deletes a failed or canceled message from this device. */
  discard: (message: Message) => Promise<void>;
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
   * edited and recalled messages). Runs automatically after a reconnect and
   * when offline message sync completes; also useful on screen focus.
   */
  refresh: () => Promise<void>;
}

/**
 * Messages of one channel: history (newest first from the SDK, kept sorted
 * ascending here), live incoming messages, edits, recalls, deletions, read
 * receipts and the state of this session's sends.
 */
export function useMessages(
  channel: ChannelIdentifier,
  options: { pageSize?: number } = {}
): UseMessagesResult {
  const client = useNexconnClient();
  const { key, connected } = useSession();
  const channelId = `${channel.channelType}:${channel.channelId}:${channel.subChannelId ?? ''}`;
  const channelRef = useRef(channel);
  channelRef.current = channel;
  const storeRef = useRef(new MessageListStore(channel));
  const outboxRef = useRef(new OutboxStore());
  const queryRef = useRef<PagedQuery<Message> | undefined>(undefined);
  const loadedRef = useRef(false);
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [receipts, setReceipts] = useState<
    ReadonlyMap<string, ReadReceiptInfo>
  >(() => new Map());
  const [outbox, setOutbox] = useState<ReadonlyMap<number, OutboxEntry>>(
    () => new Map()
  );
  const [state, setState] = useState<AsyncState>(IDLE);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = options.pageSize ?? 30;

  const publish = () => {
    setMessages(storeRef.current.messages);
    setReceipts(storeRef.current.receipts);
    setOutbox(outboxRef.current.entries);
  };

  /**
   * Seeds receipt counts for outgoing messages that asked for receipts, so a
   * reopened chat shows Read even where the SDK keeps `sentStatus` at Sent.
   * Best effort: a failure leaves the SDK's `sentStatus` as the only source.
   */
  const seedReceipts = useCallback(
    (store: MessageListStore, page: readonly Message[]) => {
      const ids = page
        .filter(
          (m) =>
            m.direction === MessageDirection.send &&
            m.needReceipt &&
            m.messageId &&
            !store.receipts.has(m.messageId)
        )
        .map((m) => m.messageId as string);
      if (ids.length === 0) return;
      client.messages
        .getReadReceiptInfo(store.channel, ids)
        .then((infos) => {
          if (storeRef.current === store && store.applyReceipts(infos)) {
            publish();
          }
        })
        .catch(() => undefined);
    },
    // publish only reads refs.

    [client]
  );

  const loadOlder = useCallback(async () => {
    const query = queryRef.current;
    if (!query || !query.hasMore) return;
    setState({ loading: true, error: undefined });
    try {
      const page = await query.loadNextPage();
      if (queryRef.current !== query) return;
      if (storeRef.current.upsert(page.items)) publish();
      seedReceipts(storeRef.current, page.items);
      setHasMore(query.hasMore);
      setState(IDLE);
    } catch (error) {
      if (queryRef.current === query) setState({ loading: false, error });
    }
    // publish only reads refs.
  }, [seedReceipts]);

  const refresh = useCallback(async () => {
    const store = storeRef.current;
    const query = client.messages.createMessagesQuery({
      channel: store.channel,
      pageSize,
      isAscending: false,
    });
    try {
      const page = await query.loadNextPage();
      if (storeRef.current === store && store.reconcileWindow(page.items)) {
        publish();
      }
      if (storeRef.current === store) seedReceipts(store, page.items);
    } catch (error) {
      if (storeRef.current === store) setState({ loading: false, error });
    } finally {
      query.release().catch(() => undefined);
    }
    // publish only reads refs.
  }, [client, pageSize, seedReceipts]);

  // New session, channel or page size: start over.
  useEffect(() => {
    storeRef.current = new MessageListStore(channelRef.current);
    outboxRef.current = new OutboxStore();
    loadedRef.current = false;
    setMessages([]);
    setReceipts(storeRef.current.receipts);
    setOutbox(outboxRef.current.entries);
    setHasMore(true);
    setState(IDLE);
    return () => {
      const query = queryRef.current;
      queryRef.current = undefined;
      detach(query?.release());
    };
  }, [client, key, channelId, pageSize]);

  // First load once connected. After a reconnect in the same session the
  // loaded history is kept and the newest page is reconciled into it.
  useEffect(() => {
    if (!connected) return;
    if (!loadedRef.current) {
      loadedRef.current = true;
      queryRef.current = client.messages.createMessagesQuery({
        channel: channelRef.current,
        pageSize,
        isAscending: false,
      });
      detach(loadOlder());
    } else {
      detach(refresh());
    }
  }, [client, key, channelId, connected, pageSize, loadOlder, refresh]);

  useEffect(() => {
    const upsert = (list: readonly Message[]) => {
      if (storeRef.current.upsert(list)) publish();
    };
    const subs = [
      client.on('messageReceived', ({ message }) => upsert([message])),
      client.on('messagesUpdated', ({ messages: list }) => upsert(list)),
      client.on('offlineMessageSyncCompleted', () => {
        if (loadedRef.current) detach(refresh());
      }),
      client.on('readReceiptResponse', ({ responses }) => {
        const store = storeRef.current;
        // Apply the SDK's receipt counts at once: on Android the stored
        // message keeps sentStatus=Sent after a receipt.
        if (store.applyReceipts(responses)) publish();
        // Also adopt the stored copy in case the SDK did update it.
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
    // publish only reads refs.
  }, [client, channelId, refresh]);

  /**
   * Sends and tracks one message. `onStored` runs once, when the SDK has
   * stored the new message (or, failing that event, when it is sent).
   */
  const dispatch = useCallback(
    async (
      content: OutgoingContent,
      sendOptions: MessageSendOptions | undefined,
      onStored?: () => void
    ): Promise<Message> => {
      const target = channelRef.current;
      const store = storeRef.current;
      const box = outboxRef.current;
      const live = () => storeRef.current === store;
      const { onProgress, ...plain } = sendOptions ?? {};
      const kept = Object.keys(plain).length > 0 ? plain : undefined;
      let attached: Message | undefined;
      let stored = false;
      const markStored = () => {
        if (stored) return;
        stored = true;
        onStored?.();
      };
      const onAttached = (message: Message) => {
        attached = message;
        if (live()) {
          store.upsert([message]);
          box.begin(message.clientId, content, kept);
          publish();
        }
        markStored();
      };
      const progress = (value: number, message: Message | undefined) => {
        onProgress?.(value, message);
        if (attached && live() && box.progress(attached.clientId, value)) {
          publish();
        }
      };
      try {
        const sent =
          isMediaContent(content) || content.type === 'custom'
            ? await client.messages.sendMedia(target, content, {
                ...plain,
                onAttached,
                onProgress: progress,
              })
            : await client.messages.send(target, content, {
                ...plain,
                onAttached,
              });
        if (live()) {
          if (attached) box.delete(attached.clientId);
          box.delete(sent.clientId);
          if (sameChannel(sent.channel, target)) store.upsert([sent]);
          publish();
        }
        markStored();
        return sent;
      } catch (error) {
        const local = attached;
        if (local && live()) {
          if (isNexconnError(error) && error.category === 'canceled') {
            box.delete(local.clientId);
          } else {
            box.fail(local.clientId, error);
          }
          publish();
          // The SDK's stored copy (its sentStatus) decides whether a retry
          // is safe; never assume it.
          client.messages
            .getById({ clientId: local.clientId })
            .then((fresh) => {
              if (fresh && live() && store.upsert([fresh])) publish();
            })
            .catch(() => undefined);
        }
        throw error;
      }
    },
    // publish only reads refs.

    [client]
  );

  const send = useCallback(
    (content: OutgoingContent, sendOptions?: MessageSendOptions) =>
      dispatch(content, sendOptions),
    [dispatch]
  );

  const reply = useCallback(
    (
      target: Message,
      text: string,
      replyOptions?: MessageSendOptions & { mentionSender?: boolean }
    ) => {
      const { mentionSender, ...rest } = replyOptions ?? {};
      return dispatch(
        replyTo(target, text, mentionSender ? { mentionSender } : {}),
        rest
      );
    },
    [dispatch]
  );

  const current = (message: Message): Message =>
    storeRef.current.messages.find((m) => m.clientId === message.clientId) ??
    message;

  const retry = useCallback(
    async (message: Message) => {
      const store = storeRef.current;
      const latest = current(message);
      const entry = outboxRef.current.get(latest.clientId);
      const content = entry?.content ?? resendableContent(latest);
      if (!sendStateOf(latest, entry).canRetry || !content) {
        throw new NexconnError({
          category: 'invalid_argument',
          message:
            'Only messages the SDK reports as failed or canceled can be resent',
        });
      }
      const resendOptions: SendOptions | undefined =
        entry?.options ?? (latest.needReceipt ? { needReceipt: true } : {});
      const oldId = latest.clientId;
      return dispatch(content, resendOptions, () => {
        client.messages
          .deleteLocal([{ clientId: oldId }])
          .catch(() => undefined);
        if (storeRef.current === store) {
          outboxRef.current.delete(oldId);
          store.remove([{ clientId: oldId }]);
          publish();
        }
      });
    },
    // current and publish only read refs.

    [client, dispatch]
  );

  const cancel = useCallback(
    async (message: Message) => {
      const entry = outboxRef.current.get(message.clientId);
      if (entry?.status !== 'sending') return;
      await client.messages.cancelSendMedia({ clientId: message.clientId });
    },
    [client]
  );

  const discard = useCallback(
    async (message: Message) => {
      const store = storeRef.current;
      const latest = current(message);
      const sendState = sendStateOf(
        latest,
        outboxRef.current.get(latest.clientId)
      );
      if (sendState.status !== 'failed' && sendState.status !== 'canceled') {
        throw new NexconnError({
          category: 'invalid_argument',
          message: 'Only failed or canceled messages can be discarded',
        });
      }
      await client.messages.deleteLocal([{ clientId: latest.clientId }]);
      if (storeRef.current === store) {
        outboxRef.current.delete(latest.clientId);
        store.remove([{ clientId: latest.clientId }]);
        publish();
      }
    },
    // current and publish only read refs.

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
    // publish only reads refs.

    [client]
  );

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
    // publish only reads refs.

    [client]
  );

  const readState = useCallback(
    (message: Message) =>
      readStateOf(
        message,
        message.messageId ? receipts.get(message.messageId) : undefined
      ),
    [receipts]
  );

  const sendState = useCallback(
    (message: Message) => sendStateOf(message, outbox.get(message.clientId)),
    [outbox]
  );

  return {
    messages,
    receipts,
    readState,
    outbox,
    sendState,
    hasMore,
    loadOlder,
    send,
    reply,
    retry,
    cancel,
    discard,
    edit,
    recall,
    refresh,
    ...state,
  };
}

/** Total unread count, refreshed on new messages and unread syncs. */
export function useTotalUnreadCount(): number {
  const client = useNexconnClient();
  const { key, connected } = useSession();
  const [count, setCount] = useState(0);

  useEffect(() => {
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

  // A new session starts from zero.
  useEffect(() => setCount(0), [key]);

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
