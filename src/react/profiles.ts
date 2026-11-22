import type { UserProfile } from '../core/types.ts';
import { detach } from './context.ts';

export type ProfileFetcher = (
  userIds: readonly string[]
) => Promise<readonly UserProfile[]>;

/**
 * Batched, de-duplicated cache of user profiles for one session. Requests
 * made in the same tick are combined into `getProfiles` calls of at most
 * `batchSize` ids. Ids the SDK returns nothing for are remembered as missing
 * (no refetch loop) until `invalidate`. Failed fetches are not cached.
 */
export class UserProfileCache {
  private readonly fetcher: ProfileFetcher;
  private readonly batchSize: number;
  private readonly profiles = new Map<string, UserProfile | null>();
  private readonly inflight = new Set<string>();
  private queue = new Set<string>();
  private scheduled = false;
  private disposed = false;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(fetcher: ProfileFetcher, batchSize = 20) {
    this.fetcher = fetcher;
    this.batchSize = Math.max(1, batchSize);
  }

  /** The profile, `null` if the SDK has none, `undefined` if not loaded. */
  get(userId: string): UserProfile | null | undefined {
    return this.profiles.get(userId);
  }

  /** Increments on every change; use as a `useSyncExternalStore` snapshot. */
  getVersion = (): number => this.version;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Queues a fetch for ids not cached or in flight. */
  request(userIds: readonly string[]): void {
    if (this.disposed) return;
    for (const id of userIds) {
      if (!id || this.profiles.has(id) || this.inflight.has(id)) continue;
      this.queue.add(id);
    }
    if (this.queue.size === 0 || this.scheduled) return;
    this.scheduled = true;
    detach(Promise.resolve().then(() => this.flush()));
  }

  /** Stores profiles from another source (e.g. a subscription event). */
  set(profiles: readonly UserProfile[]): void {
    let changed = false;
    for (const profile of profiles) {
      if (!profile?.userId) continue;
      this.profiles.set(profile.userId, profile);
      changed = true;
    }
    if (changed) this.emit();
  }

  /** Forgets ids (all when omitted) so the next request refetches them. */
  invalidate(userIds?: readonly string[]): void {
    if (userIds) userIds.forEach((id) => this.profiles.delete(id));
    else this.profiles.clear();
    this.emit();
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  private flush(): void {
    this.scheduled = false;
    const ids = [...this.queue];
    this.queue = new Set();
    for (let i = 0; i < ids.length; i += this.batchSize) {
      const batch = ids.slice(i, i + this.batchSize);
      batch.forEach((id) => this.inflight.add(id));
      this.fetcher(batch)
        .then((found) => {
          if (this.disposed) return;
          const byId = new Map(found.map((p) => [p.userId, p] as const));
          for (const id of batch) this.profiles.set(id, byId.get(id) ?? null);
          this.emit();
        })
        .catch(() => undefined)
        .finally(() => batch.forEach((id) => this.inflight.delete(id)));
    }
  }

  private emit(): void {
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }
}
