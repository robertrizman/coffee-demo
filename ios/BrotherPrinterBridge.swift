import Foundation
import React

#if !targetEnvironment(simulator)
import BRLMPrinterKit
#endif

@objc(BrotherPrinter)
class BrotherPrinter: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func printQLPdf(_ printerIP: String,
                  pdfUri: String,
                  autoCut: Bool,
                  resolver: @escaping RCTPromiseResolveBlock,
                  rejecter: @escaping RCTPromiseRejectBlock) {

    #if targetEnvironment(simulator)
    rejecter("SIMULATOR", "Brother printing not supported on simulator — use a physical device", nil)
    #else
    guard let url = URL(string: pdfUri) else {
      rejecter("PDF_ERROR", "Invalid PDF URI", nil)
      return
    }

    let channel = BRLMChannel(wifiIPAddress: printerIP)
    let generateResult = BRLMPrinterDriverGenerator.open(channel)

    if generateResult.error.code != BRLMOpenChannelErrorCode.noError {
      rejecter("CHANNEL_ERROR", "Failed to open channel: \(generateResult.error.code)", nil)
      return
    }

    guard let driver = generateResult.driver else {
      rejecter("DRIVER_ERROR", "No driver available", nil)
      return
    }

    guard let settings = BRLMQLPrintSettings(defaultPrintSettingsWith: BRLMPrinterModel.QL_820NWB) else {
      rejecter("SETTINGS_ERROR", "Failed to create print settings", nil)
      driver.closeChannel()
      return
    }

    settings.autoCut = autoCut
    settings.labelSize = BRLMQLPrintSettingsLabelSize.dieCutW39H48
    settings.printQuality = BRLMPrintSettingsPrintQuality.best

    let printError = driver.printPDF(with: url, settings: settings)
    driver.closeChannel()

    if printError.code != BRLMPrintErrorCode.noError {
      rejecter("PRINT_ERROR", "Print failed: \(printError.code)", nil)
    } else {
      resolver(["success": true, "ip": printerIP])
    }
    #endif
  }
}
