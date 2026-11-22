import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChannelIdentifier, Message } from '../core/types.ts';
import { mentionsUser } from '../core/helpers.ts';
import {
  detach,
  IDLE,
  useNexconnClient,
  useSession,
  type AsyncState,
} from './context.ts';
import { channelKey, sameChannel } from './stores.ts';

export interface UseDraftResult {
  /** The current draft text (local state; saved after `debounceMs`). */
  readonly draft: string;
  /** False until the stored draft has been read from the SDK. */
  readonly loaded: boolean;
  setDraft: (text: string) => void;
  /** Saves any pending change now. */
  flush: () => Promise<void>;
  /** Clears the draft locally and in the SDK (e.g. after sending). */
  clear: () => Promise<void>;
}

/**
 * The channel's draft, read from the SDK and saved back (debounced) as the
 * user types. An empty draft is cleared rather than saved. Pending changes
 * are saved when the channel changes or the component unmounts, but never
 * into a different session.
 */
export function useDraft(
  channel: ChannelIdentifier,
  options: { debounceMs?: number } = {}
): UseDraftResult {
  const client = useNexconnClient();
  const { key, connected } = useSession();
  const { debounceMs = 500 } = options;
  const id = channelKey(channel);
  const channelRef = useRef(channel);
  channelRef.current = channel;
  const [draft, setDraftState] = useState('');
  const [loaded, setLoaded] = useState(false);
  // Pending save: target channel, session and text.
  const pendingRef = useRef<
    { channel: ChannelIdentifier; session: string; text: string } | undefined
  >(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sessionRef = useRef(key);
  sessionRef.current = key;

  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = undefined;
    const pending = pendingRef.current;
    pendingRef.current = undefined;
    if (!pending || pending.session !== sessionRef.current) return;
    await (pending.text.trim() === ''
      ? client.channels.clearDraft(pending.channel)
      : client.channels.saveDraft(pending.channel, pending.text));
  }, [client]);

  useEffect(() => {
    setDraftState('');
    setLoaded(false);
    if (!connected) return undefined;
    let active = true;
    client.channels
      .getChannel(channelRef.current)
      .then((found) => {
        if (!active) return;
        // Keep text typed before the read completed.
        if (pendingRef.current === undefined) setDraftState(found?.draft ?? '');
        setLoaded(true);
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
      flush().catch(() => undefined);
    };
  }, [client, key, id, connected, flush]);

  const setDraft = useCallback(
    (text: string) => {
      setDraftState(text);
      pendingRef.current = {
        channel: channelRef.current,
        session: sessionRef.current,
        text,
      };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        flush().catch(() => undefined);
      }, debounceMs);
    },
    [debounceMs, flush]
  );

  const clear = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = undefined;
    pendingRef.current = undefined;
    setDraftState('');
    await client.channels.clearDraft(channelRef.current);
  }, [client]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return { draft, loaded, setDraft, flush, clear };
}

export interface UseUnreadMentionsResult extends AsyncState {
  /** Unread messages in the channel that @-mention the current user. */
  readonly messages: readonly Message[];
  refresh: () => Promise<void>;
}

/**
 * Unread @-mentions of the current user in one channel, re-read when a
 * mentioning message arrives or the channel's unread state syncs.
 */
export function useUnreadMentions(
  channel: ChannelIdentifier
): UseUnreadMentionsResult {
  const client = useNexconnClient();
  const { key, connected, userId } = useSession();
  const id = channelKey(channel);
  const channelRef = useRef(channel);
  channelRef.current = channel;
  const [messages, setMessages] = useState<readonly Message[]>([]);
  const [state, setState] = useState<AsyncState>(IDLE);
  const tokenRef = useRef(0);

  const refresh = useCallback(async () => {
    const token = ++tokenRef.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const list = await client.channels.getUnreadMentionedMessages(
        channelRef.current
      );
      if (tokenRef.current !== token) return;
      setMessages([...list].sort((a, b) => a.sentTime - b.sentTime));
      setState(IDLE);
    } catch (error) {
      if (tokenRef.current === token) setState({ loading: false, error });
    }
  }, [client]);

  useEffect(() => {
    tokenRef.current += 1;
    setMessages([]);
    setState(IDLE);
    if (!connected) return undefined;
    detach(refresh());
    const subs = [
      client.on('messageReceived', ({ message }) => {
        if (
          sameChannel(message.channel, channelRef.current) &&
          userId &&
          mentionsUser(message, userId)
        ) {
          detach(refresh());
        }
      }),
      client.on('channelUnreadStatusSync', ({ channel: changed }) => {
        if (sameChannel(changed, channelRef.current)) detach(refresh());
      }),
    ];
    return () => subs.forEach((unsubscribe) => unsubscribe());
  }, [client, key, id, connected, userId, refresh]);

  return { messages, refresh, ...state };
}
