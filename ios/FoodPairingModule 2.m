// FoodPairingModule.m
// Place at: ios/FoodPairingModule.m

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(FoodPairingModule, NSObject)

RCT_EXTERN_METHOD(
  predict:(NSString *)drinkCategory
  milkType:(NSString *)milkType
  timeOfDay:(NSString *)timeOfDay
  dayOfWeek:(NSString *)dayOfWeek
  resolve:(RCTPromiseResolveBlock)resolve
  reject:(RCTPromiseRejectBlock)reject
)

@end
