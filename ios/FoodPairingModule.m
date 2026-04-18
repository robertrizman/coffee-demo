#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(FoodPairingModule, NSObject)

RCT_EXTERN_METHOD(predict:(NSString *)drinkCategory
                  milkType:(NSString *)milkType
                  timeOfDay:(NSString *)timeOfDay
                  dayOfWeek:(NSString *)dayOfWeek
                  menuItemsJson:(NSString *)menuItemsJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(generateInsight:(NSString *)ordersJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
