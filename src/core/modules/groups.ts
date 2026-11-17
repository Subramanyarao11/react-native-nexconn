import type { Bridge } from '../bridge.ts';
import { compact, requireString, requireStringList } from '../encode.ts';
import { isRecord, normalizeValue } from '../normalize.ts';
import { PagedQuery } from '../query.ts';
import type {
  CreateGroupInput,
  CreateGroupResult,
  GroupApplicationInfo,
  GroupApplicationsQueryParams,
  GroupFavorite,
  GroupInfo,
  GroupMemberInfo,
  GroupMembersByRoleQueryParams,
  JoinedGroupsByRoleQueryParams,
  LeaveGroupConfig,
  SearchGroupMembersQueryParams,
  SearchJoinedGroupsQueryParams,
  UpdateGroupInput,
} from '../types.ts';

function asList<T>(value: unknown): T[] {
  const normalized = normalizeValue(value);
  return (Array.isArray(normalized) ? normalized : []) as T[];
}

function errorKeys(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

/** Group channel lifecycle, membership and administration. */
export class GroupsModule {
  private readonly bridge: Bridge;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  async create(input: CreateGroupInput): Promise<CreateGroupResult> {
    requireString(input.groupId, 'groupId');
    requireString(input.groupName, 'groupName');
    const raw = await this.bridge.invoke('group.create', compact({ ...input }));
    const record = isRecord(raw) ? raw : {};
    return {
      processCode:
        typeof record.processCode === 'number' ? record.processCode : 0,
      errorKeys: errorKeys(record.errorKeys),
    };
  }

  async getGroupsInfo(groupIds: readonly string[]): Promise<GroupInfo[]> {
    return asList(
      await this.bridge.invoke('group.getGroupsInfo', {
        groupIds: requireStringList(groupIds, 'groupIds'),
      })
    );
  }

  async getJoinedGroups(groupIds: readonly string[]): Promise<GroupInfo[]> {
    return asList(
      await this.bridge.invoke('group.getJoinedGroups', {
        groupIds: requireStringList(groupIds, 'groupIds'),
      })
    );
  }

  /** Resolves with keys rejected by moderation (empty on full success). */
  async updateInfo(
    groupId: string,
    input: UpdateGroupInput
  ): Promise<string[]> {
    return errorKeys(
      await this.bridge.invoke('group.updateInfo', {
        groupId: requireString(groupId, 'groupId'),
        ...compact({ ...input }),
      })
    );
  }

  /** Resolves with the SDK process code (e.g. pending approval). */
  join(groupId: string): Promise<number> {
    return this.bridge.invoke('group.join', {
      groupId: requireString(groupId, 'groupId'),
    });
  }

  leave(groupId: string, config?: LeaveGroupConfig): Promise<void> {
    return this.bridge.invoke('group.leave', {
      groupId: requireString(groupId, 'groupId'),
      ...(config ? { config } : {}),
    });
  }

  dismiss(groupId: string): Promise<void> {
    return this.bridge.invoke('group.dismiss', {
      groupId: requireString(groupId, 'groupId'),
    });
  }

  transferOwner(
    groupId: string,
    params: {
      newOwnerId: string;
      leaveAfterTransfer?: boolean;
      config?: LeaveGroupConfig;
    }
  ): Promise<void> {
    return this.bridge.invoke('group.transferOwner', {
      groupId: requireString(groupId, 'groupId'),
      newOwnerId: requireString(params.newOwnerId, 'newOwnerId'),
      leaveAfterTransfer: params.leaveAfterTransfer ?? false,
      ...(params.config ? { config: params.config } : {}),
    });
  }

  inviteUsers(groupId: string, userIds: readonly string[]): Promise<number> {
    return this.bridge.invoke('group.inviteUsers', {
      groupId: requireString(groupId, 'groupId'),
      userIds: requireStringList(userIds, 'userIds'),
    });
  }

  kickMembers(
    groupId: string,
    userIds: readonly string[],
    config?: LeaveGroupConfig
  ): Promise<void> {
    return this.bridge.invoke('group.kickMembers', {
      groupId: requireString(groupId, 'groupId'),
      userIds: requireStringList(userIds, 'userIds'),
      ...(config ? { config } : {}),
    });
  }

  addAdmins(groupId: string, userIds: readonly string[]): Promise<void> {
    return this.memberOp('group.addAdmins', groupId, userIds);
  }

  removeAdmins(groupId: string, userIds: readonly string[]): Promise<void> {
    return this.memberOp('group.removeAdmins', groupId, userIds);
  }

  /** Android only (`unsupported` on iOS). */
  addManagers(groupId: string, userIds: readonly string[]): Promise<void> {
    return this.memberOp('group.addManagers', groupId, userIds);
  }

  /** Android only (`unsupported` on iOS). */
  removeManagers(groupId: string, userIds: readonly string[]): Promise<void> {
    return this.memberOp('group.removeManagers', groupId, userIds);
  }

  acceptInvite(groupId: string, inviterId: string): Promise<void> {
    return this.bridge.invoke('group.acceptInvite', {
      groupId: requireString(groupId, 'groupId'),
      inviterId: requireString(inviterId, 'inviterId'),
    });
  }

  refuseInvite(
    groupId: string,
    inviterId: string,
    reason?: string
  ): Promise<void> {
    return this.bridge.invoke(
      'group.refuseInvite',
      compact({
        groupId: requireString(groupId, 'groupId'),
        inviterId: requireString(inviterId, 'inviterId'),
        reason,
      })
    );
  }

  acceptApplication(
    groupId: string,
    applicantId: string,
    inviterId?: string
  ): Promise<number> {
    return this.bridge.invoke(
      'group.acceptApplication',
      compact({
        groupId: requireString(groupId, 'groupId'),
        applicantId: requireString(applicantId, 'applicantId'),
        inviterId,
      })
    );
  }

  refuseApplication(
    groupId: string,
    applicantId: string,
    options: { inviterId?: string; reason?: string } = {}
  ): Promise<void> {
    return this.bridge.invoke(
      'group.refuseApplication',
      compact({
        groupId: requireString(groupId, 'groupId'),
        applicantId: requireString(applicantId, 'applicantId'),
        inviterId: options.inviterId,
        reason: options.reason,
      })
    );
  }

  async getMembers(
    groupId: string,
    userIds: readonly string[]
  ): Promise<GroupMemberInfo[]> {
    return asList(
      await this.bridge.invoke('group.getMembers', {
        groupId: requireString(groupId, 'groupId'),
        userIds: requireStringList(userIds, 'userIds'),
      })
    );
  }

  async setMemberInfo(
    groupId: string,
    params: { userId: string; nickname?: string; extra?: string }
  ): Promise<string[]> {
    return errorKeys(
      await this.bridge.invoke(
        'group.setMemberInfo',
        compact({
          groupId: requireString(groupId, 'groupId'),
          userId: requireString(params.userId, 'userId'),
          nickname: params.nickname,
          extra: params.extra,
        })
      )
    );
  }

  addFavorites(groupId: string, userIds: readonly string[]): Promise<void> {
    return this.memberOp('group.addFavorites', groupId, userIds);
  }

  removeFavorites(groupId: string, userIds: readonly string[]): Promise<void> {
    return this.memberOp('group.removeFavorites', groupId, userIds);
  }

  async getFavorites(groupId: string): Promise<GroupFavorite[]> {
    return asList(
      await this.bridge.invoke('group.getFavorites', {
        groupId: requireString(groupId, 'groupId'),
      })
    );
  }

  createApplicationsQuery(
    params: GroupApplicationsQueryParams = {}
  ): PagedQuery<GroupApplicationInfo> {
    return new PagedQuery(
      this.bridge,
      'groupApplications',
      compact({ ...params }),
      (v) => normalizeValue(v) as GroupApplicationInfo
    );
  }

  createJoinedGroupsByRoleQuery(
    params: JoinedGroupsByRoleQueryParams = {}
  ): PagedQuery<GroupInfo> {
    return new PagedQuery(
      this.bridge,
      'joinedGroupsByRole',
      compact({ ...params }),
      (v) => normalizeValue(v) as GroupInfo
    );
  }

  createSearchJoinedGroupsQuery(
    params: SearchJoinedGroupsQueryParams
  ): PagedQuery<GroupInfo> {
    requireString(params.groupName, 'groupName');
    return new PagedQuery(
      this.bridge,
      'searchJoinedGroups',
      compact({ ...params }),
      (v) => normalizeValue(v) as GroupInfo
    );
  }

  createSearchMembersQuery(
    params: SearchGroupMembersQueryParams
  ): PagedQuery<GroupMemberInfo> {
    requireString(params.groupId, 'groupId');
    return new PagedQuery(
      this.bridge,
      'searchGroupMembers',
      compact({ ...params }),
      (v) => normalizeValue(v) as GroupMemberInfo
    );
  }

  createMembersByRoleQuery(
    params: GroupMembersByRoleQueryParams
  ): PagedQuery<GroupMemberInfo> {
    requireString(params.groupId, 'groupId');
    return new PagedQuery(
      this.bridge,
      'groupMembersByRole',
      compact({ ...params }),
      (v) => normalizeValue(v) as GroupMemberInfo
    );
  }

  private memberOp(
    method: string,
    groupId: string,
    userIds: readonly string[]
  ): Promise<void> {
    return this.bridge.invoke(method, {
      groupId: requireString(groupId, 'groupId'),
      userIds: requireStringList(userIds, 'userIds'),
    });
  }
}
