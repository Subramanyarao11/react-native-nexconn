#import <NexconnSpec/NexconnSpec.h>
#import <React/RCTInvalidating.h>

/// TurboModule shell. All SDK work happens in the Swift `NexconnBridge`.
@interface Nexconn : NativeNexconnSpecBase <NativeNexconnSpec, RCTInvalidating>

@end
