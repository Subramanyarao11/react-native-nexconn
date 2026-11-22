/**
 * Small, pure builders for common outgoing content. They only shape data for
 * `messages.send`; the SDK still validates and delivers it.
 */
import { MentionedType } from './enums.ts';
import { NexconnError } from './errors.ts';
import type {
  MentionedInfo,
  Message,
  OutgoingContent,
  ReferenceContent,
} from './types.ts';

function invalid(message: string): NexconnError {
  return new NexconnError({ category: 'invalid_argument', message });
}

/**
 * A reply that quotes `target` (sent as a reference message). The quoted
 * message must have been acknowledged by the server (`messageId`).
 */
export function replyTo(
  target: Message,
  text: string,
  options: { mentionSender?: boolean } = {}
): ReferenceContent {
  if (!target.messageId) {
    throw invalid('Only sent messages (with a messageId) can be quoted');
  }
  if (!target.senderUserId) {
    throw invalid('The quoted message has no senderUserId');
  }
  if (typeof text !== 'string') throw invalid('reply text must be a string');
  const quoted =
    target.content.type === 'stream' ||
    target.content.type === 'recallNotification' ||
    target.content.type === 'unknown'
      ? undefined
      : (target.content as OutgoingContent);
  const reply: ReferenceContent = {
    type: 'reference',
    content: text,
    referMsgId: target.messageId,
    referMsgSenderId: target.senderUserId,
    ...(quoted ? { referMsg: quoted } : {}),
  };
  return options.mentionSender
    ? withMentions(reply, [target.senderUserId])
    : reply;
}

/**
 * Adds an @-mention of specific users (`userIds`) or of everyone (`'all'`)
 * to text-like content. Recipients see it as a mention in their unread
 * counts; `mentionedContent` overrides the push text.
 */
export function withMentions<T extends OutgoingContent>(
  content: T,
  mention: readonly string[] | 'all',
  mentionedContent?: string
): T {
  let info: MentionedInfo;
  if (mention === 'all') {
    info = { type: MentionedType.all };
  } else {
    const ids = [...new Set(mention.filter((id) => typeof id === 'string'))];
    if (ids.length === 0) throw invalid('mention needs at least one userId');
    if (ids.some((id) => id.length === 0)) {
      throw invalid('mentioned userIds must be non-empty strings');
    }
    info = { type: MentionedType.users, userIdList: ids };
  }
  if (mentionedContent !== undefined) info.mentionedContent = mentionedContent;
  return { ...content, mentionedInfo: info };
}

/** Whether `message` @-mentions `userId` directly or through @all. */
export function mentionsUser(message: Message, userId: string): boolean {
  const info = message.content.mentionedInfo;
  if (!info) return false;
  if (info.isMentionedMe) return true;
  if (info.type === MentionedType.all) return true;
  return info.userIdList?.includes(userId) ?? false;
}
