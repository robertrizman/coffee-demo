import Foundation
import React
import BRLMPrinterKit

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
    
    guard let url = URL(string: pdfUri) else {
      rejecter("PDF_ERROR", "Invalid PDF URI", nil)
      return
    }
    
    // Create WiFi channel with IP address
    let channel = BRLMChannel(wifiIPAddress: printerIP)
    
    // Generate printer driver
    let generateResult = BRLMPrinterDriverGenerator.open(channel)
    
    if generateResult.error.code != BRLMOpenChannelErrorCode.noError {
      rejecter("CHANNEL_ERROR", "Failed to open channel: \(generateResult.error.code)", nil)
      return
    }
    
    guard let driver = generateResult.driver else {
      rejecter("DRIVER_ERROR", "No driver available", nil)
      return
    }
    
    // Create print settings for QL-820NWB
    guard let settings = BRLMQLPrintSettings(defaultPrintSettingsWith: BRLMPrinterModel.QL_820NWB) else {
      rejecter("SETTINGS_ERROR", "Failed to create print settings", nil)
      driver.closeChannel()
      return
    }
    
    settings.autoCut = autoCut
    settings.labelSize = BRLMQLPrintSettingsLabelSize.dieCutW39H48
    settings.printQuality = BRLMPrintSettingsPrintQuality.best
    
    // Print the PDF
    let printError = driver.printPDF(with: url, settings: settings)
    driver.closeChannel()
    
    if printError.code != BRLMPrintErrorCode.noError {
      rejecter("PRINT_ERROR", "Print failed: \(printError.code)", nil)
    } else {
      resolver(["success": true, "ip": printerIP])
    }
  }
}