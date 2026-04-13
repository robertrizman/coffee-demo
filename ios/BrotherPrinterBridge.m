#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(BrotherPrinter, NSObject)

RCT_EXTERN_METHOD(printQLPdf:(NSString *)printerIP
                  pdfUri:(NSString *)pdfUri
                  autoCut:(BOOL)autoCut
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
