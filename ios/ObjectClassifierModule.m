#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ObjectClassifierModule, NSObject)

RCT_EXTERN_METHOD(classify:(NSString *)base64Jpeg
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
