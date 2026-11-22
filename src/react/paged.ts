import { useCallback, useEffect, useRef, useState } from 'react';
import type { PagedQuery } from '../core/query.ts';
import { IDLE, detach, useSession, type AsyncState } from './context.ts';
import { KeyedListStore } from './stores.ts';

export interface UsePagedListResult<T> extends AsyncState {
  readonly items: readonly T[];
  readonly hasMore: boolean;
  /** Loads the next page (no-op while loading or at the end). */
  loadMore: () => Promise<void>;
  /**
   * Reloads the first page. The current items stay visible until the new
   * page arrives, then replace them.
   */
  refresh: () => Promise<void>;
}

export interface PagedListOptions<T> {
  /** The list restarts when this key (or the session) changes. */
  readonly key: string;
  /** False keeps the list empty and idle (e.g. an empty search keyword). */
  readonly enabled: boolean;
  readonly create: () => PagedQuery<T>;
  readonly keyOf: (item: T) => string;
  readonly compare?: (a: T, b: T) => number;
}

/** @internal Paged list plus a `mutate` hook for live-event updates. */
export function usePagedList<T>(options: PagedListOptions<T>): {
  result: UsePagedListResult<T>;
  /** Applies a live update; re-renders when it returns true. */
  mutate: (update: (store: KeyedListStore<T>) => boolean) => void;
  /** The current store, for reads inside event handlers. */
  storeRef: { readonly current: KeyedListStore<T> };
} {
  const session = useSession();
  const listKey = `${session.key}|${options.key}`;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const makeStore = () =>
    new KeyedListStore<T>(
      (item) => optionsRef.current.keyOf(item),
      optionsRef.current.compare
        ? (a, b) => optionsRef.current.compare?.(a, b) ?? 0
        : undefined
    );
  const storeRef = useRef<KeyedListStore<T>>(null as never);
  if (storeRef.current === null) storeRef.current = makeStore();
  const queryRef = useRef<PagedQuery<T> | undefined>(undefined);
  const loadedRef = useRef(false);
  const epochRef = useRef(0);
  const [items, setItems] = useState<readonly T[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [state, setState] = useState<AsyncState>(IDLE);

  const loadMore = useCallback(async () => {
    const query = queryRef.current;
    if (!query || !query.hasMore || query.isLoading) return;
    setState({ loading: true, error: undefined });
    try {
      const page = await query.loadNextPage();
      if (queryRef.current !== query) return;
      storeRef.current.upsert(page.items);
      setItems(storeRef.current.list);
      setHasMore(query.hasMore);
      setState(IDLE);
    } catch (error) {
      if (queryRef.current === query) setState({ loading: false, error });
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!optionsRef.current.enabled) return;
    const epoch = epochRef.current;
    const query = optionsRef.current.create();
    setState((s) => ({ ...s, loading: true }));
    try {
      const page = await query.loadNextPage();
      if (epochRef.current !== epoch) {
        detach(query.release());
        return;
      }
      const previous = queryRef.current;
      queryRef.current = query;
      loadedRef.current = true;
      detach(previous?.release());
      const store = makeStore();
      store.upsert(page.items);
      storeRef.current = store;
      setItems(store.list);
      setHasMore(query.hasMore);
      setState(IDLE);
    } catch (error) {
      detach(query.release());
      if (epochRef.current === epoch) setState({ loading: false, error });
    }
    // makeStore only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restart on session or key change.
  useEffect(() => {
    epochRef.current += 1;
    loadedRef.current = false;
    storeRef.current = makeStore();
    setItems([]);
    setHasMore(true);
    setState(IDLE);
    return () => {
      epochRef.current += 1;
      detach(queryRef.current?.release());
      queryRef.current = undefined;
    };
    // makeStore only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey]);

  // First load once connected; on a reconnect, revalidate the first page.
  useEffect(() => {
    if (!options.enabled || !session.connected) return;
    if (!loadedRef.current) {
      loadedRef.current = true;
      queryRef.current = optionsRef.current.create();
      detach(loadMore());
    } else {
      detach(refresh());
    }
  }, [listKey, options.enabled, session.connected, loadMore, refresh]);

  const mutate = useCallback(
    (update: (store: KeyedListStore<T>) => boolean) => {
      const store = storeRef.current;
      if (update(store) && storeRef.current === store) setItems(store.list);
    },
    []
  );

  return {
    result: { items, hasMore, loadMore, refresh, ...state },
    mutate,
    storeRef,
  };
}
