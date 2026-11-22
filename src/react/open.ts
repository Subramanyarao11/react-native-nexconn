import { useCallback, useEffect, useRef, useState } from 'react';
import { NexconnError } from '../core/errors.ts';
import type {
  Channel,
  CommunityUnreadInfo,
  OpenChannelEnterResponse,
} from '../core/types.ts';
import {
  detach,
  IDLE,
  useNexconnClient,
  useSession,
  type AsyncState,
} from './context.ts';

export type OpenChannelStatus =
  'idle' | 'entering' | 'entered' | 'failed' | 'exited' | 'destroyed';

export interface UseOpenChannelResult {
  readonly status: OpenChannelStatus;
  /** The SDK's enter response (from `enter()` or `openChannelEntered`). */
  readonly info: OpenChannelEnterResponse | undefined;
  /** Latest participant count (enter response, then participant events). */
  readonly participantCount: number | undefined;
  readonly error: unknown;
  /** Enters (again), e.g. after a failure or `exit`. */
  enter: () => Promise<void>;
  exit: () => Promise<void>;
}

/**
 * Enters an open channel while the component is mounted (unless
 * `autoEnter: false`) and exits on unmount. Tracks the enter response,
 * participant count, and reset/destroy events. Read messages with
 * `useMessages({ channelType: ChannelType.open, channelId })`.
 */
export function useOpenChannel(
  channelId: string,
  options: { autoEnter?: boolean; messageCount?: number; extra?: string } = {}
): UseOpenChannelResult {
  const client = useNexconnClient();
  const { key, connected } = useSession();
  const { autoEnter = true, messageCount, extra } = options;
  const [status, setStatus] = useState<OpenChannelStatus>('idle');
  const [info, setInfo] = useState<OpenChannelEnterResponse | undefined>();
  const [participantCount, setParticipantCount] = useState<number>();
  const [error, setError] = useState<unknown>(undefined);
  const enteredRef = useRef(false);
  const tokenRef = useRef(0);
  const optionsRef = useRef({ messageCount, extra });
  optionsRef.current = { messageCount, extra };

  const applyResponse = (response: OpenChannelEnterResponse | undefined) => {
    if (!response) return;
    setInfo(response);
    setParticipantCount(response.participantCount);
  };

  const enter = useCallback(async () => {
    if (!channelId) return;
    const token = ++tokenRef.current;
    setStatus('entering');
    setError(undefined);
    try {
      const { messageCount: count, extra: ext } = optionsRef.current;
      const response = await client.openChannels.enter(channelId, {
        ...(count !== undefined ? { messageCount: count } : {}),
        ...(ext !== undefined ? { extra: ext } : {}),
      });
      if (tokenRef.current !== token) return;
      enteredRef.current = true;
      // Android delivers the response through `openChannelEntered` only.
      applyResponse(response);
      setStatus('entered');
    } catch (cause) {
      if (tokenRef.current !== token) return;
      setError(cause);
      setStatus('failed');
    }
  }, [client, channelId]);

  const exit = useCallback(async () => {
    tokenRef.current += 1;
    if (!channelId || !enteredRef.current) {
      setStatus('exited');
      return;
    }
    enteredRef.current = false;
    setStatus('exited');
    await client.openChannels.exit(channelId, optionsRef.current.extra);
  }, [client, channelId]);

  useEffect(() => {
    setStatus('idle');
    setInfo(undefined);
    setParticipantCount(undefined);
    setError(undefined);
    if (!connected || !channelId) return undefined;
    const subs = [
      client.on('openChannelEntered', (event) => {
        if (event.channelId !== channelId) return;
        applyResponse(event.response);
        enteredRef.current = true;
        setStatus('entered');
      }),
      client.on('openChannelEnterFailed', (event) => {
        if (event.channelId !== channelId) return;
        setError(
          new NexconnError({
            category: 'native',
            message: event.error?.message ?? 'Entering the channel failed',
            ...(event.error?.code !== undefined
              ? { nativeCode: event.error.code }
              : {}),
            method: 'open.enter',
          })
        );
        setStatus('failed');
      }),
      client.on('openChannelParticipantChanged', (event) => {
        if (event.channelId === channelId) {
          setParticipantCount(event.participantCount);
        }
      }),
      client.on('openChannelExited', (event) => {
        if (event.channelId !== channelId) return;
        enteredRef.current = false;
        setStatus('exited');
      }),
      client.on('openChannelReset', (event) => {
        // The SDK re-enters on its own after a reset.
        if (event.channelId === channelId) setStatus('entering');
      }),
      client.on('openChannelDestroyed', (event) => {
        if (event.channelId !== channelId) return;
        enteredRef.current = false;
        setStatus('destroyed');
      }),
    ];
    if (autoEnter) detach(enter());
    return () => {
      subs.forEach((unsubscribe) => unsubscribe());
      tokenRef.current += 1;
      if (enteredRef.current) {
        enteredRef.current = false;
        client.openChannels
          .exit(channelId, optionsRef.current.extra)
          .catch(() => undefined);
      }
    };
  }, [client, key, channelId, connected, autoEnter, enter]);

  return { status, info, participantCount, error, enter, exit };
}

export interface UseCommunitySubChannelsResult extends AsyncState {
  readonly subChannels: readonly Channel[];
  /** Unread info per `subChannelId`. */
  readonly unread: ReadonlyMap<string, CommunityUnreadInfo>;
  refresh: () => Promise<void>;
}

/**
 * Sub-channels of a community channel with their unread info, re-read on
 * sub-channel type changes and deletions, community sync completion, and
 * new messages in the community.
 */
export function useCommunitySubChannels(
  channelId: string
): UseCommunitySubChannelsResult {
  const client = useNexconnClient();
  const { key, connected } = useSession();
  const [subChannels, setSubChannels] = useState<readonly Channel[]>([]);
  const [unread, setUnread] = useState<
    ReadonlyMap<string, CommunityUnreadInfo>
  >(() => new Map());
  const [state, setState] = useState<AsyncState>(IDLE);
  const tokenRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!channelId) return;
    const token = ++tokenRef.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const [channels, infos] = await Promise.all([
        client.community.getSubChannels(channelId),
        client.community.getChannelsUnreadInfo([channelId]).catch(() => []),
      ]);
      if (tokenRef.current !== token) return;
      setSubChannels(channels);
      setUnread(
        new Map(
          infos
            .filter((i) => i.channelId === channelId && i.subChannelId)
            .map((i) => [i.subChannelId as string, i] as const)
        )
      );
      setState(IDLE);
    } catch (error) {
      if (tokenRef.current === token) setState({ loading: false, error });
    }
  }, [client, channelId]);

  useEffect(() => {
    tokenRef.current += 1;
    setSubChannels([]);
    setUnread(new Map());
    setState(IDLE);
    if (!connected || !channelId) return undefined;
    detach(refresh());
    const mine = (
      list: readonly { channel?: { channelId: string } }[]
    ): boolean => list.some((i) => i.channel?.channelId === channelId);
    const subs = [
      client.on('communitySubChannelTypeChanged', ({ info }) => {
        if (mine(info)) detach(refresh());
      }),
      client.on('communitySubChannelDeleted', ({ info }) => {
        if (mine(info)) detach(refresh());
      }),
      client.on('communityChannelsSyncCompleted', () => detach(refresh())),
      client.on('messageReceived', ({ message }) => {
        if (message.channel.channelId === channelId) detach(refresh());
      }),
    ];
    return () => subs.forEach((unsubscribe) => unsubscribe());
  }, [client, key, channelId, connected, refresh]);

  return { subChannels, unread, refresh, ...state };
}
