import type { Channel, ChannelIdentifier, Message } from '../core/types.ts';

export function sameChannel(
  a: ChannelIdentifier,
  b: ChannelIdentifier
): boolean {
  return (
    a.channelType === b.channelType &&
    a.channelId === b.channelId &&
    (a.subChannelId ?? '') === (b.subChannelId ?? '')
  );
}

export function channelKey(c: ChannelIdentifier): string {
  return `${c.channelType}:${c.channelId}:${c.subChannelId ?? ''}`;
}

function messageKeys(m: Message): string[] {
  const keys = [`c:${m.clientId}`];
  if (m.messageId) keys.push(`s:${m.messageId}`);
  return keys;
}

/**
 * Ordered, de-duplicated message list for one channel. A message is the same
 * if either its local `clientId` or server `messageId` matches, so a local
 * echo is replaced (not duplicated) when the acknowledged copy arrives.
 * Sorted ascending by `sentTime`, then `clientId`.
 */
export class MessageListStore {
  readonly channel: ChannelIdentifier;
  private items: Message[] = [];
  private readonly maxSize: number;

  constructor(channel: ChannelIdentifier, maxSize = 2000) {
    this.channel = channel;
    this.maxSize = maxSize;
  }

  get messages(): readonly Message[] {
    return this.items;
  }

  /** Inserts or replaces messages; returns true if anything changed. */
  upsert(messages: readonly Message[]): boolean {
    let changed = false;
    const index = new Map<string, number>();
    this.items.forEach((m, i) =>
      messageKeys(m).forEach((k) => index.set(k, i))
    );
    const next = [...this.items];
    for (const message of messages) {
      if (!sameChannel(message.channel, this.channel)) continue;
      const existing = messageKeys(message)
        .map((k) => index.get(k))
        .find((i) => i !== undefined);
      if (existing !== undefined) {
        next[existing] = message;
      } else {
        next.push(message);
        messageKeys(message).forEach((k) => index.set(k, next.length - 1));
      }
      changed = true;
    }
    if (!changed) return false;
    next.sort((a, b) => a.sentTime - b.sentTime || a.clientId - b.clientId);
    // Keep the newest messages when the bound is exceeded.
    this.items =
      next.length > this.maxSize
        ? next.slice(next.length - this.maxSize)
        : next;
    return true;
  }

  remove(
    messages: readonly { clientId?: number; messageId?: string }[]
  ): boolean {
    const doomed = new Set<string>();
    for (const m of messages) {
      if (m.clientId) doomed.add(`c:${m.clientId}`);
      if (m.messageId) doomed.add(`s:${m.messageId}`);
    }
    const next = this.items.filter(
      (m) => !messageKeys(m).some((k) => doomed.has(k))
    );
    if (next.length === this.items.length) return false;
    this.items = next;
    return true;
  }

  reset(): void {
    this.items = [];
  }
}

/** Channel list sorted by pinned first, then by most recent activity. */
export class ChannelListStore {
  private items: Channel[] = [];

  get channels(): readonly Channel[] {
    return this.items;
  }

  upsert(channels: readonly Channel[]): boolean {
    if (channels.length === 0) return false;
    const map = new Map(this.items.map((c) => [channelKey(c), c] as const));
    for (const channel of channels) map.set(channelKey(channel), channel);
    this.items = [...map.values()].sort(compareChannels);
    return true;
  }

  remove(ids: readonly ChannelIdentifier[]): boolean {
    const doomed = new Set(ids.map(channelKey));
    const next = this.items.filter((c) => !doomed.has(channelKey(c)));
    if (next.length === this.items.length) return false;
    this.items = next;
    return true;
  }

  reset(): void {
    this.items = [];
  }
}

function activity(c: Channel): number {
  return Math.max(c.operationTime, c.latestMessage?.sentTime ?? 0);
}

function compareChannels(a: Channel, b: Channel): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  return activity(b) - activity(a);
}

/**
 * Decides how to present messages reported as deleted. A recalled message
 * may be replaced by a recall notification that the SDK keeps under the same
 * server id; `lookup` asks the SDK for the current copy. Only an actual
 * `recallNotification` returned by the SDK is shown — nothing is synthesized.
 * Everything else is removed.
 */
export async function reconcileDeleted(
  deleted: readonly Message[],
  lookup: (ref: MessageLookupRef) => Promise<Message | undefined>
): Promise<{ replacements: Message[]; removed: readonly Message[] }> {
  const replacements: Message[] = [];
  for (const message of deleted) {
    const notice = await currentRecallNotice(message, lookup);
    if (notice) replacements.push(notice);
  }
  return { replacements, removed: deleted };
}

/** Reference used to ask the SDK for the current copy of a message. */
export type MessageLookupRef = { messageId: string; clientId?: number };

/**
 * Returns the recall notification the SDK holds for `message`: the message
 * itself when it already carries one, otherwise a fresh SDK lookup by server
 * id. Returns undefined when the SDK has none (never synthesized).
 */
export async function currentRecallNotice(
  message: Message,
  lookup: (ref: MessageLookupRef) => Promise<Message | undefined>
): Promise<Message | undefined> {
  if (message.content.type === 'recallNotification') return message;
  if (!message.messageId) return undefined;
  try {
    const current = await lookup({
      messageId: message.messageId,
      ...(message.clientId > 0 ? { clientId: message.clientId } : {}),
    });
    return current?.content.type === 'recallNotification' ? current : undefined;
  } catch {
    return undefined; // not retrievable any more: a plain deletion
  }
}
