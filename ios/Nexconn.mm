#import "Nexconn.h"

@implementation Nexconn

- (void)getIntegrationStatus:(RCTPromiseResolveBlock)resolve
                     reject:(RCTPromiseRejectBlock)reject
{
  resolve(@"{\"platform\":\"ios\",\"nativeModuleLinked\":true,\"sdkIntegrated\":false}");
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
