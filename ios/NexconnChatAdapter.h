#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Rejection code (`nexconn/...`) and message for a failed operation.
typedef void (^NexconnFailure)(NSString *code, NSString *message);

/// Plain Objective-C boundary around the Nexconn Chat SDK.
///
/// The SDK's generated Swift header is imported only by the implementation, so
/// the Objective-C++ TurboModule never has to parse it. Structured values are
/// returned as JSON strings, matching the Android module.
@interface NexconnChatAdapter : NSObject

/// Called with a JSON payload for each event of the active session.
@property (nonatomic, copy, nullable) void (^onConnectionStatus)(NSString *payload);
@property (nonatomic, copy, nullable) void (^onMessage)(NSString *payload);

+ (NSString *)sdkVersion;

- (void)initializeWithAppKey:(NSString *)appKey
                    areaCode:(NSString *)areaCode
                     success:(void (^)(void))success
                     failure:(NexconnFailure)failure;

- (void)connectWithToken:(NSString *)token
          timeoutSeconds:(int32_t)timeoutSeconds
               sessionId:(NSString *)sessionId
                 success:(void (^)(NSString *payload))success
                 failure:(NexconnFailure)failure;

- (void)disconnect:(BOOL)disablePush failure:(NexconnFailure)failure success:(void (^)(void))success;

- (void)connectionStatusWithSuccess:(void (^)(NSInteger status))success
                            failure:(NexconnFailure)failure;

- (void)sendDirectText:(NSString *)text
          targetUserId:(NSString *)targetUserId
               success:(void (^)(NSString *payload))success
               failure:(NexconnFailure)failure;

/// Removes SDK handlers and stops event delivery. Safe to call repeatedly.
- (void)invalidate;

@end

NS_ASSUME_NONNULL_END
