import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { NexconnClient } from '../core/client.ts';
import {
  SubscribeType,
  type FriendApplicationStatus,
  type FriendApplicationType,
} from '../core/enums.ts';
import type {
  FriendApplication,
  FriendInfo,
  UserOnlineStatus,
  UserProfile,
} from '../core/types.ts';
import {
  detach,
  IDLE,
  idsFromKey,
  idsKey,
  useNexconnClient,
  useSession,
  type AsyncState,
} from './context.ts';
import { usePagedList, type UsePagedListResult } from './paged.ts';
import { UserProfileCache } from './profiles.ts';

const caches = new WeakMap<
  NexconnClient,
  { key: string; cache: UserProfileCache; off: () => void }
>();

/**
 * The session's shared profile cache. A new session (connect, account
 * switch) gets an empty cache, so profiles never leak across accounts.
 */
export function getUserProfileCache(
  client: NexconnClient,
  session: string
): UserProfileCache {
  const current = caches.get(client);
  if (current && current.key === session) return current.cache;
  current?.off();
  current?.cache.dispose();
  const cache = new UserProfileCache((ids) => client.users.getProfiles(ids));
  const off = client.on('subscriptionChanged', ({ events }) => {
    cache.set(events.flatMap((e) => (e.userProfile ? [e.userProfile] : [])));
  });
  caches.set(client, { key: session, cache, off });
  return cache;
}

/**
 * Profiles for `userIds`, fetched in batches and shared by every component
 * in the session. Ids the SDK has no profile for are absent from the map.
 */
export function useUsers(
  userIds: readonly string[]
): ReadonlyMap<string, UserProfile> {
  const client = useNexconnClient();
  const { key, connected } = useSession();
  const cache = getUserProfileCache(client, key);
  const ids = idsKey(userIds);
  const version = useSyncExternalStore(
    cache.subscribe,
    cache.getVersion,
    cache.getVersion
  );
  useEffect(() => {
    if (connected) cache.request(idsFromKey(ids));
  }, [cache, ids, connected]);
  return useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const id of idsFromKey(ids)) {
      const profile = cache.get(id);
      if (profile) map.set(id, profile);
    }
    return map;
    // `version` invalidates the memo when the cache changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, ids, version]);
}

/** One user's profile (see `useUsers`). */
export function useUser(userId: string | undefined): UserProfile | undefined {
  const map = useUsers(userId ? [userId] : []);
  return userId ? map.get(userId) : undefined;
}

export interface UseOnlineStatusOptions {
  /**
   * Subscribe to online-status changes for these users (default false: one
   * read only). Subscriptions are server-side and expire after `expiry`
   * seconds; they are not removed on unmount because other screens may
   * rely on them. Call `client.users.unsubscribe` to remove them.
   */
  readonly subscribe?: boolean;
  /** Subscription lifetime in seconds (SDK default when omitted). */
  readonly expiry?: number;
}

/**
 * Online status per user id, re-read when the SDK reports an online-status
 * subscription change for one of them.
 */
export function useOnlineStatus(
  userIds: readonly string[],
  options: UseOnlineStatusOptions = {}
): ReadonlyMap<string, UserOnlineStatus> {
  const client = useNexconnClient();
  const { key, connected } = useSession();
  const ids = idsKey(userIds);
  const { subscribe = false, expiry } = options;
  const [statuses, setStatuses] = useState<
    ReadonlyMap<string, UserOnlineStatus>
  >(() => new Map());

  useEffect(() => {
    setStatuses(new Map());
    const list = idsFromKey(ids);
    if (!connected || list.length === 0) return undefined;
    let active = true;
    const read = (which: readonly string[]) => {
      client.users
        .getOnlineStatus(which)
        .then((found) => {
          if (!active || found.length === 0) return;
          setStatuses((prev) => {
            const next = new Map(prev);
            found.forEach((s) => next.set(s.userId, s));
            return next;
          });
        })
        .catch(() => undefined);
    };
    const start = subscribe
      ? client.users
          .subscribe({
            subscribeType: SubscribeType.onlineStatus,
            userIds: list,
            ...(expiry !== undefined ? { expiry } : {}),
          })
          .catch(() => undefined)
      : Promise.resolve();
    detach(start.then(() => active && read(list)));
    const wanted = new Set(list);
    const off = client.on('subscriptionChanged', ({ events }) => {
      const changed = events
        .filter(
          (e) =>
            (e.subscribeType === SubscribeType.onlineStatus ||
              e.subscribeType === SubscribeType.friendOnlineStatus) &&
            wanted.has(e.userId)
        )
        .map((e) => e.userId);
      if (changed.length > 0) read([...new Set(changed)]);
    });
    return () => {
      active = false;
      off();
    };
  }, [client, key, ids, connected, subscribe, expiry]);

  return statuses;
}

export interface UseBlockedUsersResult extends AsyncState {
  readonly userIds: readonly string[];
  block: (userId: string) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * The block list. The SDK has no block-list event, so the list is re-read
 * after `block`/`unblock` and on `refresh`.
 */
export function useBlockedUsers(): UseBlockedUsersResult {
  const client = useNexconnClient();
  const { key, connected } = useSession();
  const [userIds, setUserIds] = useState<readonly string[]>([]);
  const [state, setState] = useState<AsyncState>(IDLE);
  const tokenRef = useRef(0);

  const refresh = useCallback(async () => {
    const token = ++tokenRef.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const list = await client.users.getBlocklist();
      if (tokenRef.current !== token) return;
      setUserIds(list);
      setState(IDLE);
    } catch (error) {
      if (tokenRef.current === token) setState({ loading: false, error });
    }
  }, [client]);

  useEffect(() => {
    tokenRef.current += 1;
    setUserIds([]);
    setState(IDLE);
    if (connected) detach(refresh());
  }, [key, connected, refresh]);

  const block = useCallback(
    async (userId: string) => {
      await client.users.addToBlocklist(userId);
      await refresh();
    },
    [client, refresh]
  );
  const unblock = useCallback(
    async (userId: string) => {
      await client.users.removeFromBlocklist(userId);
      await refresh();
    },
    [client, refresh]
  );

  return { userIds, block, unblock, refresh, ...state };
}

export interface UseFriendsResult extends AsyncState {
  readonly friends: readonly FriendInfo[];
  refresh: () => Promise<void>;
}

function byFriendName(a: FriendInfo, b: FriendInfo): number {
  const an = a.remark || a.name || a.userId;
  const bn = b.remark || b.name || b.userId;
  return an.localeCompare(bn);
}

/**
 * The friend list (sorted by remark, then name), kept current from friend
 * events: added friends are read and inserted, removed and cleared friends
 * disappear, and remark/extProfile syncs are applied in place.
 */
export function useFriends(): UseFriendsResult {
  const client = useNexconnClient();
  const { key, connected } = useSession();
  const [friends, setFriends] = useState<readonly FriendInfo[]>([]);
  const [state, setState] = useState<AsyncState>(IDLE);
  const tokenRef = useRef(0);

  const refresh = useCallback(async () => {
    const token = ++tokenRef.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const list = await client.users.getFriends();
      if (tokenRef.current !== token) return;
      setFriends([...list].sort(byFriendName));
      setState(IDLE);
    } catch (error) {
      if (tokenRef.current === token) setState({ loading: false, error });
    }
  }, [client]);

  useEffect(() => {
    tokenRef.current += 1;
    setFriends([]);
    setState(IDLE);
    if (!connected) return undefined;
    detach(refresh());
    let active = true;
    const subs = [
      client.on('friendAdded', ({ userId }) => {
        client.users
          .getFriendsInfo([userId])
          .then((found) => {
            if (!active || found.length === 0) return;
            setFriends((prev) =>
              [...prev.filter((f) => f.userId !== userId), ...found].sort(
                byFriendName
              )
            );
          })
          .catch(() => undefined);
      }),
      client.on('friendsRemoved', ({ userIds }) => {
        const gone = new Set(userIds);
        setFriends((prev) => prev.filter((f) => !gone.has(f.userId)));
      }),
      client.on('friendsCleared', () => setFriends([])),
      client.on('friendInfoChangedSync', ({ userId, remark, extProfile }) => {
        setFriends((prev) =>
          prev
            .map((f) =>
              f.userId === userId
                ? {
                    ...f,
                    ...(remark !== undefined ? { remark } : {}),
                    ...(extProfile !== undefined ? { extProfile } : {}),
                  }
                : f
            )
            .sort(byFriendName)
        );
      }),
    ];
    return () => {
      active = false;
      subs.forEach((unsubscribe) => unsubscribe());
    };
  }, [client, key, connected, refresh]);

  return { friends, refresh, ...state };
}

/**
 * Paged friend applications (sent and received), re-read when the SDK
 * reports an application status change.
 */
export function useFriendApplications(
  options: {
    applicationTypes?: readonly FriendApplicationType[];
    applicationStatuses?: readonly FriendApplicationStatus[];
    pageSize?: number;
  } = {}
): UsePagedListResult<FriendApplication> {
  const client = useNexconnClient();
  const { applicationTypes, applicationStatuses, pageSize = 20 } = options;
  const filterKey = JSON.stringify([applicationTypes, applicationStatuses]);
  const { result } = usePagedList<FriendApplication>({
    key: `${filterKey}|${pageSize}`,
    enabled: true,
    create: () =>
      client.users.createFriendApplicationsQuery({
        pageSize,
        ...(applicationTypes ? { applicationTypes } : {}),
        ...(applicationStatuses ? { applicationStatuses } : {}),
      }),
    keyOf: (a) => `${a.applicationType}:${a.userId}`,
    compare: (a, b) => b.operationTime - a.operationTime,
  });
  const { refresh } = result;
  useEffect(
    () => client.on('friendApplicationStatusChanged', () => detach(refresh())),
    [client, refresh]
  );
  return result;
}
