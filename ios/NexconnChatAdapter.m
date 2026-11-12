#import "NexconnChatAdapter.h"

#import <NexconnChatSDK/NexconnChatSDK.h>

static NSString *const kHandlerId = @"react-native-nexconn";
static NSString *const kInvalidArgument = @"nexconn/invalid_argument";

// The native engine is a process-wide singleton that outlives JS reloads.
static NSString *sInitializedConfig = nil;

static NSString *NexconnJSON(NSDictionary *value)
{
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
  return [[NSString alloc] initWithData:data ?: [NSData data] encoding:NSUTF8StringEncoding];
}

static id NexconnNullable(id _Nullable value)
{
  return value ?: [NSNull null];
}

static NSString *NexconnChannelType(NCChannelType type)
{
  switch (type) {
    case NCChannelTypeDirect:
      return @"direct";
    case NCChannelTypeGroup:
      return @"group";
    case NCChannelTypeOpen:
      return @"open";
    case NCChannelTypeSystem:
      return @"system";
    case NCChannelTypeCommunity:
      return @"community";
  }
  return @"unknown";
}

static NSDictionary *NexconnMessage(NCMessage *message)
{
  NSMutableDictionary *json = [@{
    @"messageId" : NexconnNullable(message.messageId),
    @"clientId" : @(message.clientId),
    @"channelType" : NexconnChannelType(message.channelIdentifier.channelType),
    @"channelId" : message.channelIdentifier.channelId,
    @"direction" : message.direction == NCMessageDirectionSend ? @"send" : @"receive",
    @"senderUserId" : NexconnNullable(message.senderUserId),
    @"sentTime" : @(message.sentTime),
    @"messageType" : NexconnNullable(message.messageType),
  } mutableCopy];
  NCMessageContent *content = message.content;
  if ([content isKindOfClass:[NCTextMessage class]]) {
    json[@"contentType"] = @"text";
    json[@"text"] = ((NCTextMessage *)content).text;
  } else {
    json[@"contentType"] = @"unsupported";
  }
  return json;
}

static void NexconnReject(NexconnFailure failure, NCError *_Nullable error, NSString *fallback)
{
  NSString *code = [NSString stringWithFormat:@"nexconn/native/%ld", error ? (long)error.code : -1L];
  failure(code, error.message.length > 0 ? error.message : fallback);
}

@interface NexconnChatAdapter () <NCConnectionStatusHandler, NCMessageHandler>
/// Session whose events may reach JavaScript; nil when none is active.
@property (atomic, copy, nullable) NSString *sessionId;
@end

@implementation NexconnChatAdapter

+ (NSString *)sdkVersion
{
  return [NCEngine getVersion];
}

- (BOOL)requireInitialized:(NexconnFailure)failure
{
  @synchronized([NexconnChatAdapter class]) {
    if (sInitializedConfig != nil) {
      return YES;
    }
  }
  failure(@"nexconn/not_initialized", @"Call initialize() before using Nexconn Chat");
  return NO;
}

- (void)initializeWithAppKey:(NSString *)appKey
                    areaCode:(NSString *)areaCode
                     success:(void (^)(void))success
                     failure:(NexconnFailure)failure
{
  NSNumber *area = @{
    @"BJ" : @(NCAreaCodeBj),
    @"SG" : @(NCAreaCodeSg),
    @"NA" : @(NCAreaCodeNa),
    @"SA" : @(NCAreaCodeSa),
    @"OM" : @(NCAreaCodeOm),
  }[areaCode];
  if (appKey.length == 0 || area == nil) {
    failure(kInvalidArgument, @"appKey and a known areaCode are required");
    return;
  }
  // Nexconn documents initialization during application launch; run it on the
  // main thread like application:didFinishLaunchingWithOptions: would.
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *requested = [NSString stringWithFormat:@"%@|%@", appKey, areaCode];
    @synchronized([NexconnChatAdapter class]) {
      if (sInitializedConfig == nil) {
        NCInitParams *params = [[NCInitParams alloc] initWithAppKey:appKey];
        params.areaCode = (NCAreaCode)area.integerValue;
        [NCEngine initializeWithParams:params];
        sInitializedConfig = requested;
        success();
      } else if ([sInitializedConfig isEqualToString:requested]) {
        success();
      } else {
        failure(@"nexconn/already_initialized",
                @"The native SDK is already initialized with a different configuration "
                 "and cannot be re-initialized in this process");
      }
    }
  });
}

- (void)connectWithToken:(NSString *)token
          timeoutSeconds:(int32_t)timeoutSeconds
               sessionId:(NSString *)sessionId
                 success:(void (^)(NSString *payload))success
                 failure:(NexconnFailure)failure
{
  if (![self requireInitialized:failure]) {
    return;
  }
  if (token.length == 0 || sessionId.length == 0) {
    failure(kInvalidArgument, @"token and sessionId are required");
    return;
  }
  // Handlers are registered before connecting so offline messages arrive.
  // The SDK holds them weakly; the module keeps this adapter alive.
  self.sessionId = sessionId;
  [NCEngine addConnectionStatusHandlerWithIdentifier:kHandlerId handler:self];
  [NCEngine addMessageHandlerWithIdentifier:kHandlerId handler:self];

  NCConnectParams *params = [[NCConnectParams alloc] initWithToken:token];
  params.timeout = timeoutSeconds;
  __block BOOL settled = NO;
  __weak typeof(self) weakSelf = self;
  [NCEngine connectWithParams:params
        databaseOpenedHandler:nil
            completionHandler:^(NSString *_Nullable userId, NCError *_Nullable error) {
              @synchronized(params) {
                if (settled) {
                  return;
                }
                settled = YES;
              }
              if (error != nil || userId == nil) {
                typeof(self) strongSelf = weakSelf;
                if ([strongSelf.sessionId isEqualToString:sessionId]) {
                  [strongSelf clearSession];
                }
                NexconnReject(failure, error, @"connect failed");
              } else {
                success(NexconnJSON(@{@"userId" : userId}));
              }
            }];
}

- (void)disconnect:(BOOL)disablePush failure:(NexconnFailure)failure success:(void (^)(void))success
{
  if (![self requireInitialized:failure]) {
    return;
  }
  [self clearSession];
  [NCEngine disconnect:disablePush];
  success();
}

- (void)connectionStatusWithSuccess:(void (^)(NSInteger status))success
                            failure:(NexconnFailure)failure
{
  if (![self requireInitialized:failure]) {
    return;
  }
  success([NCEngine getConnectionStatus]);
}

- (void)sendDirectText:(NSString *)text
          targetUserId:(NSString *)targetUserId
               success:(void (^)(NSString *payload))success
               failure:(NexconnFailure)failure
{
  if (![self requireInitialized:failure]) {
    return;
  }
  NCDirectChannel *channel =
      targetUserId.length > 0 ? [[NCDirectChannel alloc] initWithChannelId:targetUserId] : nil;
  if (channel == nil || text.length == 0) {
    failure(kInvalidArgument, @"targetUserId and text are required");
    return;
  }
  NCTextMessage *content = [[NCTextMessage alloc] initWithText:text];
  NCSendMessageParams *params = [[NCSendMessageParams alloc] initWithContent:content];
  __block BOOL settled = NO;
  [channel sendMessageWithParams:params
                 attachedHandler:nil
               completionHandler:^(NCMessage *_Nullable message, NCError *_Nullable error) {
                 @synchronized(params) {
                   if (settled) {
                     return;
                   }
                   settled = YES;
                 }
                 if (error != nil || message == nil) {
                   NexconnReject(failure, error, @"send failed");
                 } else {
                   success(NexconnJSON(NexconnMessage(message)));
                 }
               }];
}

- (void)clearSession
{
  self.sessionId = nil;
  [NCEngine removeConnectionStatusHandlerForIdentifier:kHandlerId];
  [NCEngine removeMessageHandlerForIdentifier:kHandlerId];
}

- (void)invalidate
{
  self.onConnectionStatus = nil;
  self.onMessage = nil;
  @synchronized([NexconnChatAdapter class]) {
    if (sInitializedConfig == nil) {
      self.sessionId = nil;
      return;
    }
  }
  [self clearSession];
}

#pragma mark - NCConnectionStatusHandler

- (void)onConnectionStatusChanged:(NCConnectionStatusChangedEvent *)event
{
  NSString *session = self.sessionId;
  void (^emit)(NSString *) = self.onConnectionStatus;
  if (session == nil || emit == nil) {
    return;
  }
  emit(NexconnJSON(@{@"sessionId" : session, @"status" : @(event.status)}));
}

#pragma mark - NCMessageHandler

- (void)onMessageReceived:(NCMessageReceivedEvent *)event
{
  NSString *session = self.sessionId;
  void (^emit)(NSString *) = self.onMessage;
  NCMessage *message = event.message;
  if (session == nil || emit == nil || message == nil) {
    return;
  }
  emit(NexconnJSON(@{
    @"sessionId" : session,
    @"message" : NexconnMessage(message),
    @"offline" : @(event.offline),
    @"left" : @(event.left),
  }));
}

@end
