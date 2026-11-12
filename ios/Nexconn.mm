#import "Nexconn.h"
#import "NexconnChatAdapter.h"

#import <React/RCTInvalidating.h>

@interface Nexconn () <RCTInvalidating>
@end

@implementation Nexconn {
  NexconnChatAdapter *_adapter;
}

- (instancetype)init
{
  if (self = [super init]) {
    _adapter = [NexconnChatAdapter new];
    __weak Nexconn *weakSelf = self;
    _adapter.onConnectionStatus = ^(NSString *payload) {
      [weakSelf emitOnConnectionStatusChanged:payload];
    };
    _adapter.onMessage = ^(NSString *payload) {
      [weakSelf emitOnMessageReceived:payload];
    };
  }
  return self;
}

- (void)invalidate
{
  [_adapter invalidate];
}

static NexconnFailure Rejecter(RCTPromiseRejectBlock reject)
{
  return ^(NSString *code, NSString *message) {
    reject(code, message, nil);
  };
}

- (void)getIntegrationStatus:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject
{
  NSDictionary *status = @{
    @"platform" : @"ios",
    @"nativeModuleLinked" : @YES,
    @"sdkIntegrated" : @YES,
    @"sdkVersion" : [NexconnChatAdapter sdkVersion],
  };
  NSData *data = [NSJSONSerialization dataWithJSONObject:status options:0 error:nil];
  resolve([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]);
}

- (void)initialize:(NSString *)appKey
          areaCode:(NSString *)areaCode
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  [_adapter initializeWithAppKey:appKey
                        areaCode:areaCode
                         success:^{
                           resolve(nil);
                         }
                         failure:Rejecter(reject)];
}

- (void)connect:(NSString *)token
 timeoutSeconds:(double)timeoutSeconds
      sessionId:(NSString *)sessionId
        resolve:(RCTPromiseResolveBlock)resolve
         reject:(RCTPromiseRejectBlock)reject
{
  [_adapter connectWithToken:token
              timeoutSeconds:(int32_t)timeoutSeconds
                   sessionId:sessionId
                     success:^(NSString *payload) {
                       resolve(payload);
                     }
                     failure:Rejecter(reject)];
}

- (void)disconnect:(BOOL)disablePush
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
{
  [_adapter disconnect:disablePush
               failure:Rejecter(reject)
               success:^{
                 resolve(nil);
               }];
}

- (void)getConnectionStatus:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject
{
  [_adapter
      connectionStatusWithSuccess:^(NSInteger status) {
        resolve(@(status));
      }
                          failure:Rejecter(reject)];
}

- (void)sendDirectText:(NSString *)targetUserId
                  text:(NSString *)text
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
  [_adapter sendDirectText:text
              targetUserId:targetUserId
                   success:^(NSString *payload) {
                     resolve(payload);
                   }
                   failure:Rejecter(reject)];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeNexconnSpecJSI>(params);
}

+ (NSString *)moduleName
{
  return @"Nexconn";
}

@end
