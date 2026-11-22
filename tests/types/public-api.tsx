// Type-only check of the public entry points (run by `yarn typecheck`).
// scripts/cloud/verify-packed-consumers.sh compiles the same code against
// the packed tarball in fresh consumer apps.
import {
  getNexconnClient,
  ChannelType,
  NexconnError,
  replyTo,
  withMentions,
  mentionsUser,
  type Message,
} from 'react-native-nexconn';
import {
  NexconnProvider,
  useMessages,
  useChannelList,
  useSession,
  useDraft,
  useUnreadMentions,
  useMessageSearch,
  useGroup,
  useGroupMembers,
  useJoinedGroups,
  useUsers,
  useUser,
  useOnlineStatus,
  useFriends,
  useFriendApplications,
  useBlockedUsers,
  useOpenChannel,
  useCommunitySubChannels,
  sendStateOf,
  type MessageSendState,
  type UsePagedListResult,
} from 'react-native-nexconn/react';
import { createMockClient } from 'react-native-nexconn/testing';
const client = getNexconnClient();
const channel = { channelType: ChannelType.direct, channelId: 'bob' };
export async function demo(): Promise<Message> {
  await client.initialize({ appKey: 'k' });
  return client.messages.send(
    channel,
    withMentions({ type: 'text', text: 'hi' }, ['bob'])
  );
}
export function useChat(): {
  state: (m: Message) => MessageSendState;
  members: UsePagedListResult<unknown>;
} {
  const { sendState } = useMessages(channel);
  const members = useGroupMembers('g1');
  return { state: sendState, members };
}
export const refs = [
  NexconnProvider,
  useMessages,
  useChannelList,
  useSession,
  useDraft,
  useUnreadMentions,
  useMessageSearch,
  useGroup,
  useJoinedGroups,
  useUsers,
  useUser,
  useOnlineStatus,
  useFriends,
  useFriendApplications,
  useBlockedUsers,
  useOpenChannel,
  useCommunitySubChannels,
  sendStateOf,
  replyTo,
  mentionsUser,
  createMockClient,
  NexconnError,
];
