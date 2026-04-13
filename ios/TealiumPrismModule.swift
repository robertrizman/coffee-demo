import Foundation
import TealiumSwift
import React

@objc(TealiumPrismModule)
class TealiumPrismModule: NSObject {
  
  private var tealium: Tealium?
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
  
  @objc
  func initialize(_ account: String,
                  profile: String,
                  environment: String,
                  datasource: String,
                  resolver: @escaping RCTPromiseResolveBlock,
                  rejecter: @escaping RCTPromiseRejectBlock) {
    
    let config = TealiumConfig(account: account,
                               profile: profile,
                               environment: environment,
                               dataSource: datasource)
    
    // Enable modules
    config.dispatchers = [Dispatchers.Collect]
    config.collectors = [Collectors.AppData,
                         Collectors.Connectivity,
                         Collectors.Device,
                         Collectors.Lifecycle]
    
    // Enable consent manager if needed
    // config.consentPolicy = .gdpr
    
    tealium = Tealium(config: config)
    
    NSLog("[TealiumPRISM] Initialized - account: \(account), profile: \(profile)")
    resolver(true)
  }
  
  @objc
  func track(_ eventName: String,
             data: NSDictionary,
             resolver: @escaping RCTPromiseResolveBlock,
             rejecter: @escaping RCTPromiseRejectBlock) {
    
    guard let tealium = tealium else {
      rejecter("NOT_INITIALIZED", "Tealium not initialized", nil)
      return
    }
    
    var dispatch = [String: Any]()
    dispatch["tealium_event"] = eventName
    
    // Merge in additional data
    if let dataDict = data as? [String: Any] {
      for (key, value) in dataDict {
        dispatch[key] = value
      }
    }
    
    let event = TealiumEvent(eventName, dataLayer: dispatch)
    tealium.track(event)
    
    resolver(true)
  }
  
  @objc
  func trackView(_ screenName: String,
                 data: NSDictionary,
                 resolver: @escaping RCTPromiseResolveBlock,
                 rejecter: @escaping RCTPromiseRejectBlock) {
    
    guard let tealium = tealium else {
      rejecter("NOT_INITIALIZED", "Tealium not initialized", nil)
      return
    }
    
    var dispatch = [String: Any]()
    dispatch["screen_name"] = screenName
    
    if let dataDict = data as? [String: Any] {
      for (key, value) in dataDict {
        dispatch[key] = value
      }
    }
    
    let view = TealiumView(screenName, dataLayer: dispatch)
    tealium.track(view)
    
    resolver(true)
  }
  
  @objc
  func setDataLayer(_ data: NSDictionary,
                    resolver: @escaping RCTPromiseResolveBlock,
                    rejecter: @escaping RCTPromiseRejectBlock) {
    
    guard let tealium = tealium else {
      rejecter("NOT_INITIALIZED", "Tealium not initialized", nil)
      return
    }
    
    if let dataDict = data as? [String: Any] {
      for (key, value) in dataDict {
        tealium.dataLayer.add(key: key, value: value, expiry: .forever)
      }
    }
    
    resolver(true)
  }
  
  @objc
  func joinTrace(_ traceId: String,
                 resolver: @escaping RCTPromiseResolveBlock,
                 rejecter: @escaping RCTPromiseRejectBlock) {
    
    guard let tealium = tealium else {
      rejecter("NOT_INITIALIZED", "Tealium not initialized", nil)
      return
    }
    
    tealium.joinTrace(id: traceId)
    NSLog("[TealiumPRISM] Joined trace: \(traceId)")
    resolver(true)
  }
  
  @objc
  func leaveTrace(_ resolver: @escaping RCTPromiseResolveBlock,
                  rejecter: @escaping RCTPromiseRejectBlock) {
    
    guard let tealium = tealium else {
      resolver(false)
      return
    }
    
    tealium.leaveTrace()
    NSLog("[TealiumPRISM] Left trace")
    resolver(true)
  }
  
  @objc
  func getAppUuid(_ resolver: @escaping RCTPromiseResolveBlock,
                  rejecter: @escaping RCTPromiseRejectBlock) {
    
    guard let tealium = tealium else {
      rejecter("NOT_INITIALIZED", "Tealium not initialized", nil)
      return
    }
    
    if let uuid = tealium.dataLayer.all["app_uuid"] as? String {
      resolver(uuid.lowercased())
    } else {
      rejecter("NO_UUID", "app_uuid not available", nil)
    }
  }
}
