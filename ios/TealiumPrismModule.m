#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(TealiumPrismModule, NSObject)

RCT_EXTERN_METHOD(initialize:(NSString *)account
                  profile:(NSString *)profile
                  environment:(NSString *)environment
                  datasource:(NSString *)datasource
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(track:(NSString *)eventName
                  data:(NSDictionary *)data
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(trackView:(NSString *)screenName
                  data:(NSDictionary *)data
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(setDataLayer:(NSDictionary *)data
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(joinTrace:(NSString *)traceId
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(leaveTrace:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(getAppUuid:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

@end
