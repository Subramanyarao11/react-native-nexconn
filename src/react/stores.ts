import type {
  Channel,
  ChannelIdentifier,
  Message,
  MessageContent,
  OutgoingContent,
  ReadReceiptInfo,
  SendOptions,
} from '../core/types.ts';
import { MessageDirection, SentStatus } from '../core/enums.ts';

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
  /**
   * Key (`c:clientId` / `s:messageId`) to absolute position. `items[i]` is at
   * absolute position `base + i`, so trimming the oldest messages only
   * deletes their keys instead of renumbering everything.
   */
  private index = new Map<string, number>();
  private base = 0;

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

  /**
   * Inserts or replaces messages; returns true if anything changed. Messages
   * arriving in order are appended without re-sorting; the list is sorted
   * only when an insert or replacement breaks the order.
   */
  upsert(messages: readonly Message[]): boolean {
    let next: Message[] | undefined;
    let needsSort = false;
    for (const message of messages) {
      if (!sameChannel(message.channel, this.channel)) continue;
      next ??= this.items.slice();
      const keys = messageKeys(message);
      let at: number | undefined;
      for (const key of keys) {
        const position = this.index.get(key);
        if (position !== undefined) {
          at = position - this.base;
          break;
        }
      }
      const existing = at === undefined ? undefined : next[at];
      if (at !== undefined && existing) {
        next[at] = message;
        if (compareMessages(existing, message) !== 0) needsSort = true;
      } else {
        const last = next[next.length - 1];
        next.push(message);
        at = next.length - 1;
        if (last && compareMessages(last, message) > 0) needsSort = true;
      }
      for (const key of keys) this.index.set(key, this.base + at);
    }
    if (!next) return false;
    this.items = next;
    if (needsSort) {
      next.sort(compareMessages);
      this.reindex();
    }
    // Keep the newest messages when the bound is exceeded.
    const excess = this.items.length - this.maxSize;
    if (excess > 0) {
      for (let i = 0; i < excess; i++) {
        for (const key of messageKeys(this.items[i] as Message)) {
          if (this.index.get(key) === this.base + i) this.index.delete(key);
        }
      }
      this.items = this.items.slice(excess);
      this.base += excess;
    }
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
    this.reindex();
    return true;
  }

  private reindex(): void {
    this.base = 0;
    this.index = new Map();
    this.items.forEach((m, i) =>
      messageKeys(m).forEach((key) => this.index.set(key, i))
    );
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
    this.reindex();
  }
}

function compareMessages(a: Message, b: Message): number {
  return a.sentTime - b.sentTime || a.clientId - b.clientId;
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

/**
 * Ordered list keyed by a string id, used by the paged hooks (members,
 * groups, search results, friend applications). `upsert` keeps first-seen
 * order unless a comparator is supplied. All updates replace the array.
 */
export class KeyedListStore<T> {
  private items: T[] = [];
  private readonly keyOf: (item: T) => string;
  private readonly compare: ((a: T, b: T) => number) | undefined;

  constructor(keyOf: (item: T) => string, compare?: (a: T, b: T) => number) {
    this.keyOf = keyOf;
    this.compare = compare;
  }

  get list(): readonly T[] {
    return this.items;
  }

  has(key: string): boolean {
    return this.items.some((item) => this.keyOf(item) === key);
  }

  get(key: string): T | undefined {
    return this.items.find((item) => this.keyOf(item) === key);
  }

  /** Inserts or replaces items; returns true if anything changed. */
  upsert(items: readonly T[]): boolean {
    if (items.length === 0) return false;
    const next = [...this.items];
    const index = new Map(next.map((item, i) => [this.keyOf(item), i]));
    for (const item of items) {
      const key = this.keyOf(item);
      const at = index.get(key);
      if (at === undefined) {
        index.set(key, next.length);
        next.push(item);
      } else {
        next[at] = item;
      }
    }
    if (this.compare) next.sort(this.compare);
    this.items = next;
    return true;
  }

  /** Replaces matching items with `update(item)`; returns true on change. */
  patch(key: string, update: (item: T) => T): boolean {
    const at = this.items.findIndex((item) => this.keyOf(item) === key);
    if (at < 0) return false;
    const next = [...this.items];
    next[at] = update(next[at] as T);
    if (this.compare) next.sort(this.compare);
    this.items = next;
    return true;
  }

  remove(keys: readonly string[]): boolean {
    if (keys.length === 0) return false;
    const doomed = new Set(keys);
    const next = this.items.filter((item) => !doomed.has(this.keyOf(item)));
    if (next.length === this.items.length) return false;
    this.items = next;
    return true;
  }

  /** Keeps only items matching `predicate`; returns true on change. */
  retain(predicate: (item: T) => boolean): boolean {
    const next = this.items.filter(predicate);
    if (next.length === this.items.length) return false;
    this.items = next;
    return true;
  }

  reset(): void {
    this.items = [];
  }
}

/** Send state of one outgoing message tracked by `useMessages`. */
export interface OutboxEntry {
  readonly clientId: number;
  readonly status: 'sending' | 'failed';
  /** Upload progress in percent (media only). */
  readonly progress?: number;
  /** The rejection from the SDK when `status` is `failed`. */
  readonly error?: unknown;
  /** Content and options as sent, reused by `retry`. */
  readonly content: OutgoingContent;
  readonly options?: SendOptions;
}

/**
 * In-flight and failed sends of one list, keyed by the local `clientId` the
 * SDK assigned when it stored the message. Immutable snapshots.
 */
export class OutboxStore {
  private map: ReadonlyMap<number, OutboxEntry> = new Map();

  get entries(): ReadonlyMap<number, OutboxEntry> {
    return this.map;
  }

  get(clientId: number): OutboxEntry | undefined {
    return this.map.get(clientId);
  }

  begin(clientId: number, content: OutgoingContent, options?: SendOptions) {
    this.set({
      clientId,
      status: 'sending',
      content,
      ...(options ? { options } : {}),
    });
  }

  progress(clientId: number, progress: number): boolean {
    const entry = this.map.get(clientId);
    if (!entry || entry.status !== 'sending') return false;
    const value = Math.max(0, Math.min(100, Math.round(progress)));
    if (entry.progress === value) return false;
    this.set({ ...entry, progress: value });
    return true;
  }

  fail(clientId: number, error: unknown): boolean {
    const entry = this.map.get(clientId);
    if (!entry) return false;
    const next: { -readonly [K in keyof OutboxEntry]: OutboxEntry[K] } = {
      ...entry,
      status: 'failed',
      error,
    };
    delete next.progress;
    this.set(next);
    return true;
  }

  delete(clientId: number): boolean {
    if (!this.map.has(clientId)) return false;
    const next = new Map(this.map);
    next.delete(clientId);
    this.map = next;
    return true;
  }

  reset(): void {
    this.map = new Map();
  }

  private set(entry: OutboxEntry): void {
    const next = new Map(this.map);
    next.set(entry.clientId, entry);
    this.map = next;
  }
}

/** What the UI should show for an outgoing message. */
export interface MessageSendState {
  readonly status: 'sending' | 'failed' | 'canceled' | 'sent';
  readonly progress?: number;
  readonly error?: unknown;
  /**
   * True only when the SDK's own copy says the send definitively failed or
   * was canceled, so resending cannot create a server-side duplicate.
   */
  readonly canRetry: boolean;
}

// Combine messages need the original message references, which a stored
// copy no longer has, so they can only be retried from this session's outbox.
const RESENDABLE = new Set<MessageContent['type']>([
  'text',
  'image',
  'file',
  'voice',
  'gif',
  'video',
  'location',
  'reference',
  'custom',
]);

// Fields the SDK fills in on stored/received content; never sent.
const RECEIVED_ONLY = [
  'thumbnailBase64',
  'thumbWidth',
  'thumbHeight',
  'dataSize',
  'numberOfChannels',
  'sampleRate',
  'format',
  'speechToText',
  'referMsgType',
  'referMsgStatus',
] as const;

/**
 * Content of a stored outgoing message that can be sent again, without the
 * fields the SDK adds on storage. Undefined for content that cannot be
 * resent as-is (stream, recall notices, combine, unknown).
 */
export function resendableContent(
  message: Message
): OutgoingContent | undefined {
  if (!RESENDABLE.has(message.content.type)) return undefined;
  const copy = { ...message.content } as Record<string, unknown>;
  for (const key of RECEIVED_ONLY) delete copy[key];
  return copy as unknown as OutgoingContent;
}

/**
 * Send state from the outbox entry (this session's sends) and the SDK's
 * `sentStatus`. Incoming messages are always `sent`.
 */
export function sendStateOf(
  message: Message,
  entry: OutboxEntry | undefined
): MessageSendState {
  if (message.direction !== MessageDirection.send) {
    return { status: 'sent', canRetry: false };
  }
  const definitive =
    message.sentStatus === SentStatus.failed ||
    message.sentStatus === SentStatus.canceled;
  const canRetry =
    definitive &&
    (entry !== undefined || resendableContent(message) !== undefined);
  if (entry?.status === 'sending') {
    return {
      status: 'sending',
      canRetry: false,
      ...(entry.progress !== undefined ? { progress: entry.progress } : {}),
    };
  }
  if (message.sentStatus === SentStatus.canceled) {
    return { status: 'canceled', canRetry };
  }
  if (entry?.status === 'failed' || message.sentStatus === SentStatus.failed) {
    return {
      status: 'failed',
      canRetry,
      ...(entry?.error !== undefined ? { error: entry.error } : {}),
    };
  }
  if (message.sentStatus === SentStatus.sending) {
    return { status: 'sending', canRetry: false };
  }
  return { status: 'sent', canRetry: false };
}
