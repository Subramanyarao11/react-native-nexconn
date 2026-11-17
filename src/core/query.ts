import type { Bridge } from './bridge.ts';
import { NexconnError } from './errors.ts';
import { isRecord } from './normalize.ts';
import type { Page } from './types.ts';

export type QueryKind =
  | 'channels'
  | 'unreadMentionMeChannels'
  | 'messages'
  | 'localMessagesByTime'
  | 'searchMessagesByUser'
  | 'searchMessagesByTimeRange'
  | 'searchMessages'
  | 'messagesReadReceiptUsers'
  | 'openChannelMessages'
  | 'groupApplications'
  | 'joinedGroupsByRole'
  | 'searchJoinedGroups'
  | 'searchGroupMembers'
  | 'groupMembersByRole'
  | 'friendApplications'
  | 'subscribe'
  | 'taggedChannels'
  | 'untaggedChannels';

/**
 * Cursor over a native SDK pageable query. The native query object is created
 * lazily on the first `loadNextPage()` and must be released when no longer
 * needed (`release()`), otherwise it lives until the session ends.
 */
export class PagedQuery<T> {
  private readonly bridge: Bridge;
  private readonly kind: QueryKind;
  private readonly params: Readonly<Record<string, unknown>>;
  private readonly mapItem: (value: unknown) => T;
  private queryId: string | undefined;
  private generation: number | undefined;
  private loading: Promise<Page<T>> | undefined;
  private released = false;
  private hasMoreValue = true;
  private totalCountValue: number | undefined;

  constructor(
    bridge: Bridge,
    kind: QueryKind,
    params: Readonly<Record<string, unknown>>,
    mapItem: (value: unknown) => T
  ) {
    this.bridge = bridge;
    this.kind = kind;
    this.params = params;
    this.mapItem = mapItem;
  }

  /** False once a page with no further data has been returned. */
  get hasMore(): boolean {
    return this.hasMoreValue;
  }

  get totalCount(): number | undefined {
    return this.totalCountValue;
  }

  get isLoading(): boolean {
    return this.loading !== undefined;
  }

  /** Loads the next page. Concurrent calls share the in-flight request. */
  loadNextPage(): Promise<Page<T>> {
    if (this.released) {
      return Promise.reject(
        new NexconnError({
          category: 'not_found',
          message: 'Query was released',
        })
      );
    }
    if (this.loading) return this.loading;
    const pending = this.load().finally(() => {
      this.loading = undefined;
    });
    this.loading = pending;
    return pending;
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    const id = this.queryId;
    this.queryId = undefined;
    if (id !== undefined && this.generation === this.bridge.generation) {
      try {
        await this.bridge.invoke('query.release', { queryId: id });
      } catch {
        // The native side may already have dropped it with the session.
      }
    }
  }

  private async load(): Promise<Page<T>> {
    if (
      this.queryId !== undefined &&
      this.generation !== this.bridge.generation
    ) {
      throw new NexconnError({
        category: 'stale_session',
        message: 'Query belongs to a previous connection session',
      });
    }
    if (this.queryId === undefined) {
      const created = await this.bridge.invoke<{ queryId: string }>(
        'query.create',
        {
          kind: this.kind,
          params: this.params,
        }
      );
      this.queryId = created.queryId;
      this.generation = this.bridge.generation;
    }
    const raw = await this.bridge.invoke('query.loadNextPage', {
      queryId: this.queryId,
    });
    const record = isRecord(raw) ? raw : {};
    const items = (Array.isArray(record.items) ? record.items : []).map(
      this.mapItem
    );
    const totalCount =
      typeof record.totalCount === 'number' ? record.totalCount : undefined;
    const hasMore =
      typeof record.hasMore === 'boolean' ? record.hasMore : items.length > 0;
    this.hasMoreValue = hasMore;
    this.totalCountValue = totalCount;
    return { items, totalCount, hasMore };
  }
}
