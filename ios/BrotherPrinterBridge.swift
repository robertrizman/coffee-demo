import Foundation
import React
import ExternalAccessory

#if !targetEnvironment(simulator) && canImport(BRLMPrinterKit)
import BRLMPrinterKit
#endif

@objc(BrotherPrinter)
class BrotherPrinter: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  // ── WiFi Print ────────────────────────────────────────

  @objc
  func printQLPdf(_ printerIP: String,
                  pdfUri: String,
                  autoCut: Bool,
                  resolver: @escaping RCTPromiseResolveBlock,
                  rejecter: @escaping RCTPromiseRejectBlock) {

    #if targetEnvironment(simulator)
    rejecter("SIMULATOR", "Brother printing not supported on simulator — use a physical device", nil)
    #elseif canImport(BRLMPrinterKit)
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
    #else
    rejecter("UNAVAILABLE", "Brother printing not available in this build", nil)
    #endif
  }

  // ── Bluetooth Discovery ───────────────────────────────
  //
  // Returns already-connected MFi accessories via EAAccessoryManager.
  // The printer must be paired in iOS Settings > Bluetooth first.
  // The `address` field is the printer's serial number (not a MAC address).

  @objc
  func discoverBluetoothPrinters(_ resolver: @escaping RCTPromiseResolveBlock,
                                 rejecter: @escaping RCTPromiseRejectBlock) {
    #if targetEnvironment(simulator)
    resolver([])
    #else
    let accessories = EAAccessoryManager.shared().connectedAccessories
    var result: [[String: String]] = []

    for accessory in accessories {
      let name = accessory.name
      let isBrother = name.range(of: #"(?i)(QL|PT|TD|MW|RJ|PJ|VC)-|Brother"#,
                                  options: .regularExpression) != nil
        || accessory.protocolStrings.contains("com.brother.ptcbp")

      if isBrother {
        result.append([
          "name": name.isEmpty ? "Brother Printer" : name,
          "address": accessory.serialNumber,  // iOS uses serial number, not MAC
          "type": "bluetooth",
        ])
      }
    }

    resolver(result)
    #endif
  }

  // ── Bluetooth Pairing ─────────────────────────────────
  //
  // iOS does not allow programmatic Bluetooth pairing — the user must
  // pair the printer in Settings > Bluetooth. This method checks if the
  // printer is already connected, or shows the EAAccessory picker sheet.

  @objc
  func pairBluetoothDevice(_ address: String,
                           resolver: @escaping RCTPromiseResolveBlock,
                           rejecter: @escaping RCTPromiseRejectBlock) {
    #if targetEnvironment(simulator)
    rejecter("SIMULATOR", "Pairing not supported on simulator", nil)
    #else
    // Check if already connected as an MFi accessory
    let accessories = EAAccessoryManager.shared().connectedAccessories
    let alreadyPaired = accessories.contains {
      $0.serialNumber == address || $0.name.lowercased().contains("brother")
    }

    if alreadyPaired {
      resolver(["success": true, "alreadyPaired": true])
      return
    }

    // Show the EAAccessory picker so the user can select the printer
    DispatchQueue.main.async {
      EAAccessoryManager.shared().showBluetoothAccessoryPicker(withNameFilter: nil) { error in
        if let error = error {
          let nsError = error as NSError
          // Code 3 = user cancelled
          if nsError.code == 3 {
            rejecter("PAIR_CANCELLED", "Pairing cancelled.", nil)
          } else {
            rejecter("PAIR_FAILED", "Could not pair: \(error.localizedDescription)", nil)
          }
        } else {
          resolver(["success": true, "alreadyPaired": false])
        }
      }
    }
    #endif
  }

  // ── Bluetooth Warmup ──────────────────────────────────
  //
  // Opens and immediately closes a Bluetooth channel so the first real
  // print job connects faster (pre-warms the MFi RFCOMM stream).

  @objc
  func warmupBluetoothConnection(_ address: String,
                                 resolver: @escaping RCTPromiseResolveBlock,
                                 rejecter: @escaping RCTPromiseRejectBlock) {
    #if targetEnvironment(simulator)
    resolver(false)
    #elseif canImport(BRLMPrinterKit)
    guard let serial = resolveSerialNumber(from: address) else {
      resolver(false)
      return
    }

    DispatchQueue.global(qos: .background).async {
      let channel = BRLMChannel(bluetoothSerialNumber: serial)
      let result = BRLMPrinterDriverGenerator.open(channel)
      if result.error.code == BRLMOpenChannelErrorCode.noError {
        result.driver?.closeChannel()
        DispatchQueue.main.async { resolver(true) }
      } else {
        DispatchQueue.main.async { resolver(false) }
      }
    }
    #else
    resolver(false)
    #endif
  }

  // ── Bluetooth Print ───────────────────────────────────

  @objc
  func printQLPdfBluetooth(_ address: String,
                           pdfUri: String,
                           autoCut: Bool,
                           resolver: @escaping RCTPromiseResolveBlock,
                           rejecter: @escaping RCTPromiseRejectBlock) {
    #if targetEnvironment(simulator)
    rejecter("SIMULATOR", "Bluetooth printing not supported on simulator", nil)
    #elseif canImport(BRLMPrinterKit)
    guard let url = URL(string: pdfUri) else {
      rejecter("PDF_ERROR", "Invalid PDF URI", nil)
      return
    }

    guard let serial = resolveSerialNumber(from: address) else {
      rejecter("BLUETOOTH_OFF",
               "No paired Brother printer found. Please pair the printer in Settings > Bluetooth, then try again.",
               nil)
      return
    }

    DispatchQueue.global(qos: .userInitiated).async {
      let channel = BRLMChannel(bluetoothSerialNumber: serial)
      let generateResult = BRLMPrinterDriverGenerator.open(channel)

      if generateResult.error.code != BRLMOpenChannelErrorCode.noError {
        DispatchQueue.main.async {
          rejecter("CHANNEL_ERROR",
                   "Failed to open Bluetooth channel: \(generateResult.error.code). Make sure the printer is paired in Settings > Bluetooth.",
                   nil)
        }
        return
      }

      guard let driver = generateResult.driver else {
        DispatchQueue.main.async { rejecter("DRIVER_ERROR", "No Bluetooth driver available", nil) }
        return
      }

      guard let settings = BRLMQLPrintSettings(defaultPrintSettingsWith: BRLMPrinterModel.QL_820NWB) else {
        driver.closeChannel()
        DispatchQueue.main.async { rejecter("SETTINGS_ERROR", "Failed to create print settings", nil) }
        return
      }

      settings.autoCut = autoCut
      settings.labelSize = BRLMQLPrintSettingsLabelSize.dieCutW39H48
      settings.printQuality = BRLMPrintSettingsPrintQuality.best

      let printError = driver.printPDF(with: url, settings: settings)
      driver.closeChannel()

      DispatchQueue.main.async {
        if printError.code != BRLMPrintErrorCode.noError {
          rejecter("PRINT_ERROR", "Bluetooth print failed: \(printError.code)", nil)
        } else {
          resolver(["success": true, "bluetoothAddress": address, "autoCut": autoCut])
        }
      }
    }
    #else
    rejecter("UNAVAILABLE", "Brother printing not available in this build", nil)
    #endif
  }

  // ── Helpers ───────────────────────────────────────────

  /// Resolves a usable serial number from `address`.
  /// - If `address` looks like a MAC address (from Android), searches connected
  ///   MFi accessories for any Brother printer and returns its serial number.
  /// - Otherwise treats `address` as a serial number directly.
  private func resolveSerialNumber(from address: String) -> String? {
    let macPattern = #"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$"#
    let looksLikeMac = address.range(of: macPattern, options: .regularExpression) != nil

    if !looksLikeMac {
      return address.isEmpty ? nil : address
    }

    // MAC address — find the connected Brother accessory by name/protocol
    let accessories = EAAccessoryManager.shared().connectedAccessories
    let brother = accessories.first {
      $0.name.range(of: #"(?i)(QL|PT|TD|MW|RJ|PJ|VC)-|Brother"#, options: .regularExpression) != nil
        || $0.protocolStrings.contains("com.brother.ptcbp")
    }
    return brother?.serialNumber
  }
}
