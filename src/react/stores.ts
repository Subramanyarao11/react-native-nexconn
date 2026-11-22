import type {
  Channel,
  ChannelIdentifier,
  Message,
  ReadReceiptInfo,
} from '../core/types.ts';
import { SentStatus } from '../core/enums.ts';

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

  private receiptMap: ReadonlyMap<string, ReadReceiptInfo> = new Map();

  /** Latest read-receipt counts per server `messageId` in this channel. */
  get receipts(): ReadonlyMap<string, ReadReceiptInfo> {
    return this.receiptMap;
  }

  /**
   * Records genuine SDK read-receipt counts (from `readReceiptResponse` or
   * `getReadReceiptInfo`) for messages in this channel. Counts never go
   * backwards, so a late or reordered response cannot turn Read into Sent.
   * Returns true if anything changed; the map is replaced, not mutated.
   */
  applyReceipts(infos: readonly ReadReceiptInfo[]): boolean {
    let next: Map<string, ReadReceiptInfo> | undefined;
    for (const info of infos) {
      if (!info.messageId) continue;
      if (info.channel && !sameChannel(info.channel, this.channel)) continue;
      const current = (next ?? this.receiptMap).get(info.messageId);
      if (
        current &&
        current.readCount >= info.readCount &&
        current.totalCount === info.totalCount
      ) {
        continue;
      }
      const merged: ReadReceiptInfo = current
        ? {
            ...info,
            readCount: Math.max(current.readCount, info.readCount),
            unreadCount: Math.min(current.unreadCount, info.unreadCount),
          }
        : info;
      next ??= new Map(this.receiptMap);
      next.set(info.messageId, merged);
    }
    if (!next) return false;
    this.receiptMap = next;
    return true;
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

  /**
   * Reconciles the store with a fresh page of the newest messages from the
   * SDK. Within the time window the page covers, sent messages the SDK no
   * longer returns are removed and changed ones (edits, recall notices) are
   * replaced. Unsent local echoes are kept. An empty page changes nothing.
   */
  reconcileWindow(page: readonly Message[]): boolean {
    const mine = page.filter((m) => sameChannel(m.channel, this.channel));
    if (mine.length === 0) return false;
    const oldest = Math.min(...mine.map((m) => m.sentTime));
    const present = new Set(mine.flatMap(messageKeys));
    const stale = this.items.filter(
      (m) =>
        m.messageId !== undefined &&
        m.sentTime >= oldest &&
        !messageKeys(m).some((k) => present.has(k))
    );
    const removed = this.remove(stale);
    return this.upsert(mine) || removed;
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

export interface MessageReadState {
  /** Read by at least one recipient (direct: the peer has read it). */
  readonly read: boolean;
  /** Recipients who read it, when the SDK reported receipt counts. */
  readonly readCount?: number;
  /** Recipients expected to read it (group size minus sender). */
  readonly totalCount?: number;
}

/**
 * Read state of an outgoing message from the SDK's `sentStatus` and the
 * receipt counts the SDK reported. Never invents a read: without a receipt
 * or `sentStatus === read` it reports unread.
 */
export function readStateOf(
  message: Message,
  receipt: ReadReceiptInfo | undefined
): MessageReadState {
  if (receipt) {
    return {
      read: receipt.readCount > 0 || message.sentStatus === SentStatus.read,
      readCount: receipt.readCount,
      totalCount: receipt.totalCount,
    };
  }
  return { read: message.sentStatus === SentStatus.read };
}
