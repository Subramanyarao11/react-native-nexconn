import { useEffect, useState } from 'react';
import type { ChannelType } from '../core/enums.ts';
import type { ChannelIdentifier, Message } from '../core/types.ts';
import { useNexconnClient } from './context.ts';
import { usePagedList, type UsePagedListResult } from './paged.ts';

export interface UseMessageSearchOptions {
  /** Search one channel. Omit to search every channel (of `channelTypes`). */
  readonly channel?: ChannelIdentifier;
  readonly channelTypes?: readonly ChannelType[];
  readonly senderUserIds?: readonly string[];
  readonly messageTypes?: readonly string[];
  /** Wait this long after the last keyword change (default 300 ms). */
  readonly debounceMs?: number;
  readonly pageSize?: number;
}

export interface UseMessageSearchResult extends UsePagedListResult<Message> {
  /** The keyword the current results are for (after debouncing). */
  readonly keyword: string;
}

/**
 * Local message search by keyword, newest first. Results are paged; an
 * empty (or whitespace) keyword gives no results and no SDK call.
 */
export function useMessageSearch(
  keyword: string,
  options: UseMessageSearchOptions = {}
): UseMessageSearchResult {
  const client = useNexconnClient();
  const {
    channel,
    channelTypes,
    senderUserIds,
    messageTypes,
    debounceMs = 300,
    pageSize = 20,
  } = options;
  const trimmed = keyword.trim();
  const [debounced, setDebounced] = useState(trimmed);
  useEffect(() => {
    if (debounceMs <= 0 || trimmed === '') {
      setDebounced(trimmed);
      return undefined;
    }
    const timer = setTimeout(() => setDebounced(trimmed), debounceMs);
    return () => clearTimeout(timer);
  }, [trimmed, debounceMs]);

  const scope = JSON.stringify([
    channel
      ? [channel.channelType, channel.channelId, channel.subChannelId ?? '']
      : null,
    channelTypes,
    senderUserIds,
    messageTypes,
    pageSize,
  ]);
  const { result } = usePagedList<Message>({
    key: `${debounced}|${scope}`,
    enabled: debounced !== '',
    create: () =>
      client.messages.createSearchMessagesQuery({
        keyword: debounced,
        pageSize,
        isAscending: false,
        ...(channel
          ? {
              channelTypes: [channel.channelType],
              channelIds: [channel.channelId],
              ...(channel.subChannelId
                ? { subChannelIds: [channel.subChannelId] }
                : {}),
            }
          : channelTypes
            ? { channelTypes }
            : {}),
        ...(senderUserIds ? { senderUserIds } : {}),
        ...(messageTypes ? { messageTypes } : {}),
      }),
    keyOf: (m) => (m.messageId ? `s:${m.messageId}` : `c:${m.clientId}`),
    compare: (a, b) => b.sentTime - a.sentTime,
  });
  return { ...result, keyword: debounced };
}
