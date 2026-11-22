import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GroupMemberRole,
  GroupOperation,
  type GroupMemberFilterRobotType,
} from '../core/enums.ts';
import type { GroupInfo, GroupMemberInfo } from '../core/types.ts';
import {
  detach,
  IDLE,
  useNexconnClient,
  useSession,
  type AsyncState,
} from './context.ts';
import { usePagedList, type UsePagedListResult } from './paged.ts';

export interface UseGroupResult extends AsyncState {
  /** Undefined until loaded, or when the SDK has no such group. */
  readonly group: GroupInfo | undefined;
  refresh: () => Promise<void>;
}

/**
 * One group's info, re-read when its info changes or membership operations
 * (join, kick, quit, roles, owner transfer) change its member count or role.
 * After a dismiss the SDK's last known info stays until `refresh`.
 */
export function useGroup(groupId: string): UseGroupResult {
  const client = useNexconnClient();
  const { key, connected } = useSession();
  const [group, setGroup] = useState<GroupInfo | undefined>(undefined);
  const [state, setState] = useState<AsyncState>(IDLE);
  const tokenRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!groupId) return;
    const token = ++tokenRef.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const [info] = await client.groups.getGroupsInfo([groupId]);
      if (tokenRef.current !== token) return;
      setGroup(info);
      setState(IDLE);
    } catch (error) {
      if (tokenRef.current === token) setState({ loading: false, error });
    }
  }, [client, groupId]);

  useEffect(() => {
    tokenRef.current += 1;
    setGroup(undefined);
    setState(IDLE);
  }, [key, groupId]);

  useEffect(() => {
    if (!connected || !groupId) return undefined;
    detach(refresh());
    const subs = [
      client.on('groupInfoChanged', ({ groupInfo }) => {
        if (groupInfo?.groupId === groupId) detach(refresh());
      }),
      client.on('groupOperation', (event) => {
        if (event.groupId === groupId) detach(refresh());
      }),
    ];
    return () => subs.forEach((unsubscribe) => unsubscribe());
  }, [client, key, groupId, connected, refresh]);

  return { group, refresh, ...state };
}

export interface UseGroupMembersOptions {
  /** Only members with this role. Omit (or `undefined` role) for all. */
  readonly role?: GroupMemberRole;
  readonly pageSize?: number;
  readonly filterRobotType?: GroupMemberFilterRobotType;
}

const ROLE_ORDER: Record<number, number> = {
  [GroupMemberRole.owner]: 0,
  [GroupMemberRole.admin]: 1,
  [GroupMemberRole.normal]: 2,
};

function compareMembers(a: GroupMemberInfo, b: GroupMemberInfo): number {
  return (
    (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3) ||
    a.joinedTime - b.joinedTime ||
    a.userId.localeCompare(b.userId)
  );
}

/**
 * Paged group members (owner, then admins, then members by join time) kept
 * current from group events: joins add members, kicks/quits remove them,
 * role changes and owner transfers re-read the affected members, member
 * info changes replace them, and a dismiss empties the list.
 */
export function useGroupMembers(
  groupId: string,
  options: UseGroupMembersOptions = {}
): UsePagedListResult<GroupMemberInfo> {
  const client = useNexconnClient();
  const { role, pageSize = 50, filterRobotType } = options;
  const filtered = role !== undefined && role !== GroupMemberRole.undefined;
  const matches = useCallback(
    (m: GroupMemberInfo) => !filtered || m.role === role,
    [filtered, role]
  );
  const { result, mutate } = usePagedList<GroupMemberInfo>({
    key: `${groupId}|${role ?? ''}|${pageSize}|${filterRobotType ?? ''}`,
    enabled: Boolean(groupId),
    create: () =>
      client.groups.createMembersByRoleQuery({
        groupId,
        pageSize,
        ...(filtered ? { role } : {}),
        ...(filterRobotType !== undefined ? { filterRobotType } : {}),
      }),
    keyOf: (m) => m.userId,
    compare: compareMembers,
  });

  useEffect(() => {
    if (!groupId) return undefined;
    const reread = (userIds: readonly string[]) => {
      const ids = [...new Set(userIds)].filter(Boolean);
      if (ids.length === 0) return;
      client.groups
        .getMembers(groupId, ids)
        .then((fresh) =>
          mutate((store) => {
            const keep = fresh.filter(matches);
            const drop = ids.filter((id) => !keep.some((m) => m.userId === id));
            // Only members already listed (or newly matching a role filter)
            // are shown; paging brings in the rest.
            const removed = store.remove(drop);
            return store.upsert(keep) || removed;
          })
        )
        .catch(() => undefined);
    };
    const subs = [
      client.on('groupOperation', (event) => {
        if (event.groupId !== groupId) return;
        const ids = event.memberInfos.map((m) => m.userId);
        switch (event.operation) {
          case GroupOperation.join:
          case GroupOperation.create:
            mutate((store) => store.upsert(event.memberInfos.filter(matches)));
            break;
          case GroupOperation.kick:
          case GroupOperation.quit:
            mutate((store) => store.remove(ids));
            break;
          case GroupOperation.dismiss:
            mutate((store) => store.retain(() => false));
            break;
          case GroupOperation.addAdmin:
          case GroupOperation.removeAdmin:
          case GroupOperation.transferOwner:
            reread([
              ...ids,
              ...(event.operatorInfo ? [event.operatorInfo.userId] : []),
            ]);
            break;
          default:
            break;
        }
      }),
      client.on('groupMemberInfoChanged', ({ groupId: id, memberInfo }) => {
        if (id !== groupId || !memberInfo) return;
        mutate((store) =>
          matches(memberInfo)
            ? store.has(memberInfo.userId) && store.upsert([memberInfo])
            : store.remove([memberInfo.userId])
        );
      }),
    ];
    return () => subs.forEach((unsubscribe) => unsubscribe());
  }, [client, groupId, matches, mutate]);

  return result;
}

/**
 * Groups the current user has joined (optionally by role), most recently
 * joined first. Groups the user leaves, is kicked from or that are dismissed
 * are removed; groups the user creates or joins are added.
 */
export function useJoinedGroups(
  options: { role?: GroupMemberRole; pageSize?: number } = {}
): UsePagedListResult<GroupInfo> {
  const client = useNexconnClient();
  const { userId } = useSession();
  const { role, pageSize = 30 } = options;
  const { result, mutate, storeRef } = usePagedList<GroupInfo>({
    key: `${role ?? ''}|${pageSize}`,
    enabled: true,
    create: () =>
      client.groups.createJoinedGroupsByRoleQuery({
        pageSize,
        ...(role !== undefined ? { role } : {}),
      }),
    keyOf: (g) => g.groupId,
    compare: (a, b) => b.joinedTime - a.joinedTime,
  });

  useEffect(() => {
    if (!userId) return undefined;
    const reload = (groupId: string) => {
      client.groups
        .getJoinedGroups([groupId])
        .then((groups) =>
          mutate((store) => {
            const mine = groups.filter(
              (g) => role === undefined || g.role === role
            );
            return mine.length > 0
              ? store.upsert(mine)
              : store.remove([groupId]);
          })
        )
        .catch(() => undefined);
    };
    const subs = [
      client.on('groupOperation', (event) => {
        const me =
          event.memberInfos.some((m) => m.userId === userId) ||
          event.operatorInfo?.userId === userId;
        switch (event.operation) {
          case GroupOperation.dismiss:
            mutate((store) => store.remove([event.groupId]));
            break;
          case GroupOperation.kick:
          case GroupOperation.quit:
            if (event.memberInfos.some((m) => m.userId === userId)) {
              mutate((store) => store.remove([event.groupId]));
            } else {
              reload(event.groupId);
            }
            break;
          default:
            if (me || storeRef.current.has(event.groupId)) {
              reload(event.groupId);
            }
        }
      }),
      client.on('groupInfoChanged', ({ groupInfo }) => {
        if (groupInfo) reload(groupInfo.groupId);
      }),
    ];
    return () => subs.forEach((unsubscribe) => unsubscribe());
  }, [client, userId, role, mutate, storeRef]);

  return result;
}
