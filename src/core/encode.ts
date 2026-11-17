import { ChannelType } from './enums.ts';
import { NexconnError } from './errors.ts';
import type {
  ChannelIdentifier,
  MessageRef,
  OutgoingContent,
  SendOptions,
} from './types.ts';

const CHANNEL_TYPES: ReadonlySet<number> = new Set(Object.values(ChannelType));

function invalid(message: string): NexconnError {
  return new NexconnError({ category: 'invalid_argument', message });
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw invalid(`${label} must be a non-empty string`);
  }
  return value;
}

export function requireStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v)) {
    throw invalid(`${label} must be an array of non-empty strings`);
  }
  return [...value] as string[];
}

export function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalid(`${label} must be a finite number`);
  }
  return value;
}

export function encodeChannel(
  channel: ChannelIdentifier
): Record<string, unknown> {
  if (typeof channel !== 'object' || channel === null) {
    throw invalid('channel must be an object');
  }
  if (!CHANNEL_TYPES.has(channel.channelType)) {
    throw invalid(`Unknown channelType ${String(channel.channelType)}`);
  }
  requireString(channel.channelId, 'channelId');
  if (channel.subChannelId !== undefined) {
    if (channel.channelType !== ChannelType.community) {
      throw invalid('subChannelId is only valid for community channels');
    }
    requireString(channel.subChannelId, 'subChannelId');
  }
  return {
    channelType: channel.channelType,
    channelId: channel.channelId,
    ...(channel.subChannelId ? { subChannelId: channel.subChannelId } : {}),
  };
}

export function encodeChannelList(
  channels: readonly ChannelIdentifier[]
): Record<string, unknown>[] {
  if (!Array.isArray(channels)) throw invalid('channels must be an array');
  return channels.map(encodeChannel);
}

export function encodeMessageRef(ref: MessageRef): Record<string, unknown> {
  if (typeof ref !== 'object' || ref === null) {
    throw invalid('message reference must be an object');
  }
  const hasClient = typeof ref.clientId === 'number' && ref.clientId > 0;
  const hasServer =
    typeof ref.messageId === 'string' && ref.messageId.length > 0;
  if (!hasClient && !hasServer) {
    throw invalid('message reference needs clientId or messageId');
  }
  return {
    ...(hasClient ? { clientId: ref.clientId } : {}),
    ...(hasServer ? { messageId: ref.messageId } : {}),
  };
}

const MEDIA_TYPES = new Set([
  'image',
  'file',
  'voice',
  'gif',
  'video',
  'combine',
]);

export function isMediaContent(content: OutgoingContent): boolean {
  return MEDIA_TYPES.has(content.type);
}

/** Validates outgoing content and converts nested references. */
export function encodeContent(
  content: OutgoingContent
): Record<string, unknown> {
  if (typeof content !== 'object' || content === null) {
    throw invalid('content must be an object');
  }
  const { ...out } = content as unknown as Record<string, unknown>;
  switch (content.type) {
    case 'text':
      if (typeof content.text !== 'string')
        throw invalid('text must be a string');
      break;
    case 'image':
    case 'file':
      requireString(content.localPath, `${content.type}.localPath`);
      break;
    case 'voice':
      requireString(content.localPath, 'voice.localPath');
      requireNumber(content.duration, 'voice.duration');
      break;
    case 'gif':
      requireString(content.localPath, 'gif.localPath');
      requireNumber(content.width, 'gif.width');
      requireNumber(content.height, 'gif.height');
      break;
    case 'video':
      requireString(content.localPath, 'video.localPath');
      requireNumber(content.duration, 'video.duration');
      break;
    case 'location':
      requireNumber(content.latitude, 'location.latitude');
      requireNumber(content.longitude, 'location.longitude');
      if (typeof content.poi !== 'string')
        throw invalid('location.poi must be a string');
      break;
    case 'reference':
      requireString(content.referMsgId, 'reference.referMsgId');
      if (typeof content.content !== 'string') {
        throw invalid('reference.content must be a string');
      }
      if (content.referMsg) {
        out.referMsg = encodeContent(content.referMsg as OutgoingContent);
      }
      break;
    case 'combine':
      if (!Array.isArray(content.messages) || content.messages.length === 0) {
        throw invalid('combine.messages must contain message references');
      }
      out.messages = content.messages.map(encodeMessageRef);
      break;
    case 'custom':
      requireString(content.messageType, 'custom.messageType');
      if (typeof content.fields !== 'object' || content.fields === null) {
        throw invalid('custom.fields must be an object');
      }
      break;
    default:
      throw invalid(
        `Unsupported outgoing content type ${String((content as { type?: unknown }).type)}`
      );
  }
  return out;
}

export function encodeSendOptions(
  options: SendOptions | undefined
): Record<string, unknown> {
  if (!options) return {};
  const out: Record<string, unknown> = { ...options };
  if (options.directedUserIds) {
    out.directedUserIds = requireStringList(
      options.directedUserIds,
      'directedUserIds'
    );
  }
  return out;
}

/** Drops `undefined` values so native decoders see absent keys. */
export function compact<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}
