#import "Nexconn.h"

// Swift interface of this pod (static library or framework builds).
#if __has_include(<Nexconn/Nexconn-Swift.h>)
#import <Nexconn/Nexconn-Swift.h>
#else
#import "Nexconn-Swift.h"
#endif

@implementation Nexconn {
  NSInteger _emitterToken;
}

- (instancetype)init
{
  if (self = [super init]) {
    __weak Nexconn *weakSelf = self;
    _emitterToken = [[NexconnBridge shared] attachEmitter:^(NSString *json) {
      Nexconn *strongSelf = weakSelf;
      if (strongSelf != nil) {
        [strongSelf emitOnNativeEvent:json];
      }
    }];
  }
  return self;
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (void)invalidate
{
  // Stop delivering events into a torn-down JS runtime. SDK handlers stay
  // registered (they are process-wide) and reattach on the next instance.
  [[NexconnBridge shared] detachEmitter:_emitterToken];
}

- (void)getIntegrationStatus:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject
{
  resolve([[NexconnBridge shared] integrationStatusJSON]);
}

- (void)invoke:(NSString *)method
      argsJson:(NSString *)argsJson
       resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject
{
  [[NexconnBridge shared] invoke:method
                            args:argsJson
                         resolve:^(NSString *json) {
                           resolve(json);
                         }
                          reject:^(NSString *json) {
                            reject(@"NEXCONN_ERROR", json, nil);
                          }];
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
