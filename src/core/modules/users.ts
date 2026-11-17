import type { Bridge } from '../bridge.ts';
import { compact, requireString, requireStringList } from '../encode.ts';
import type {
  FriendAddPermission,
  SubscribeType,
  UserProfileVisibility,
} from '../enums.ts';
import { normalizeValue } from '../normalize.ts';
import { PagedQuery } from '../query.ts';
import type {
  FriendApplication,
  FriendApplicationsQueryParams,
  FriendInfo,
  FriendRelation,
  StringMap,
  SubscribeQueryParams,
  SubscriptionStatusInfo,
  UserOnlineStatus,
  UserProfile,
  UserProfileInput,
} from '../types.ts';

function asList<T>(value: unknown): T[] {
  const normalized = normalizeValue(value);
  return (Array.isArray(normalized) ? normalized : []) as T[];
}

/** Profiles, block list, friends and presence subscriptions. */
export class UsersModule {
  private readonly bridge: Bridge;

  constructor(bridge: Bridge) {
    this.bridge = bridge;
  }

  // Subscriptions ----------------------------------------------------------

  /** Resolves with the user ids that failed to subscribe. */
  async subscribe(params: {
    subscribeType: SubscribeType;
    userIds: readonly string[];
    expiry?: number;
  }): Promise<string[]> {
    return asList(
      await this.bridge.invoke(
        'user.subscribeEvent',
        compact({
          ...params,
          userIds: requireStringList(params.userIds, 'userIds'),
        })
      )
    );
  }

  async unsubscribe(params: {
    subscribeType: SubscribeType;
    userIds: readonly string[];
  }): Promise<string[]> {
    return asList(
      await this.bridge.invoke('user.unsubscribeEvent', {
        ...params,
        userIds: requireStringList(params.userIds, 'userIds'),
      })
    );
  }

  async getSubscriptions(params: {
    subscribeType: SubscribeType;
    userIds: readonly string[];
  }): Promise<SubscriptionStatusInfo[]> {
    return asList(
      await this.bridge.invoke('user.getSubscribeEvent', {
        ...params,
        userIds: requireStringList(params.userIds, 'userIds'),
      })
    );
  }

  createSubscribeQuery(
    params: SubscribeQueryParams
  ): PagedQuery<SubscriptionStatusInfo> {
    return new PagedQuery(
      this.bridge,
      'subscribe',
      compact({ ...params }),
      (v) => normalizeValue(v) as SubscriptionStatusInfo
    );
  }

  async getOnlineStatus(
    userIds: readonly string[]
  ): Promise<UserOnlineStatus[]> {
    return asList(
      await this.bridge.invoke('user.getSubscribeUsersOnlineStatus', {
        userIds: requireStringList(userIds, 'userIds'),
      })
    );
  }

  // Block list -------------------------------------------------------------

  addToBlocklist(userId: string): Promise<void> {
    return this.bridge.invoke('user.addToBlocklist', {
      userId: requireString(userId, 'userId'),
    });
  }

  removeFromBlocklist(userId: string): Promise<void> {
    return this.bridge.invoke('user.removeFromBlocklist', {
      userId: requireString(userId, 'userId'),
    });
  }

  async getBlocklist(): Promise<string[]> {
    return asList(await this.bridge.invoke('user.getBlocklist'));
  }

  checkBlocked(userId: string): Promise<boolean> {
    return this.bridge.invoke('user.checkBlocked', {
      userId: requireString(userId, 'userId'),
    });
  }

  // Profiles ---------------------------------------------------------------

  /** Resolves with keys rejected by moderation (empty on full success). */
  async updateMyProfile(profile: UserProfileInput): Promise<string[]> {
    return asList(
      await this.bridge.invoke('user.updateMyUserProfile', {
        profile: compact({ ...profile }),
      })
    );
  }

  async getProfiles(userIds: readonly string[]): Promise<UserProfile[]> {
    return asList(
      await this.bridge.invoke('user.getUserProfiles', {
        userIds: requireStringList(userIds, 'userIds'),
      })
    );
  }

  async getMyProfile(): Promise<UserProfile> {
    return normalizeValue(
      await this.bridge.invoke('user.getMyUserProfile')
    ) as UserProfile;
  }

  setMyProfileVisibility(visibility: UserProfileVisibility): Promise<void> {
    return this.bridge.invoke('user.updateMyUserProfileVisibility', {
      visibility,
    });
  }

  getMyProfileVisibility(): Promise<UserProfileVisibility> {
    return this.bridge.invoke('user.getMyUserProfileVisibility');
  }

  // Friends ----------------------------------------------------------------

  setFriendAddPermission(permission: FriendAddPermission): Promise<void> {
    return this.bridge.invoke('user.setFriendAddPermission', { permission });
  }

  getFriendAddPermission(): Promise<FriendAddPermission> {
    return this.bridge.invoke('user.getFriendAddPermission');
  }

  /** Resolves with the SDK process code (e.g. awaiting verification). */
  addFriend(userId: string, extra?: string): Promise<number> {
    return this.bridge.invoke(
      'user.addFriend',
      compact({ userId: requireString(userId, 'userId'), extra })
    );
  }

  removeFriends(userIds: readonly string[]): Promise<void> {
    return this.bridge.invoke('user.removeFriends', {
      userIds: requireStringList(userIds, 'userIds'),
    });
  }

  acceptFriendApplication(userId: string): Promise<void> {
    return this.bridge.invoke('user.acceptFriendApplication', {
      userId: requireString(userId, 'userId'),
    });
  }

  refuseFriendApplication(userId: string): Promise<void> {
    return this.bridge.invoke('user.refuseFriendApplication', {
      userId: requireString(userId, 'userId'),
    });
  }

  async setFriendInfo(params: {
    userId: string;
    remark?: string;
    extProfile?: StringMap;
  }): Promise<string[]> {
    return asList(
      await this.bridge.invoke(
        'user.setFriendInfo',
        compact({ ...params, userId: requireString(params.userId, 'userId') })
      )
    );
  }

  async checkFriends(userIds: readonly string[]): Promise<FriendRelation[]> {
    return asList(
      await this.bridge.invoke('user.checkFriends', {
        userIds: requireStringList(userIds, 'userIds'),
      })
    );
  }

  async getFriends(): Promise<FriendInfo[]> {
    return asList(await this.bridge.invoke('user.getFriends'));
  }

  async getFriendsInfo(userIds: readonly string[]): Promise<FriendInfo[]> {
    return asList(
      await this.bridge.invoke('user.getFriendsInfo', {
        userIds: requireStringList(userIds, 'userIds'),
      })
    );
  }

  async searchFriends(name: string): Promise<FriendInfo[]> {
    return asList(
      await this.bridge.invoke('user.searchFriendsInfo', {
        name: requireString(name, 'name'),
      })
    );
  }

  createFriendApplicationsQuery(
    params: FriendApplicationsQueryParams = {}
  ): PagedQuery<FriendApplication> {
    return new PagedQuery(
      this.bridge,
      'friendApplications',
      compact({ ...params }),
      (v) => normalizeValue(v) as FriendApplication
    );
  }
}
