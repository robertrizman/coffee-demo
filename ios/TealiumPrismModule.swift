import Foundation
#if COCOAPODS
import TealiumPrism
#else
import TealiumPrismCore
import TealiumPrismLifecycle
#endif
import React

@objc(TealiumPrismModule)
class TealiumPrismModule: NSObject {

  private var tealium: Tealium?
  private var cachedVisitorId: String?

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

    // Release any previous instance so TealiumInstanceManager doesn't hand back a cached
    // instance keyed by account+profile — otherwise a JS-only reload would never re-fetch settingsUrl.
    tealium = nil

    let settingsUrl = "https://tags.tiqcdn.com/dle/success-robert-rizman/coffee-demo/mobile_settings_dev.json?cb=\(Int.random(in: 100000...999999))"

    let config = TealiumConfig(account: account,
                               profile: profile,
                               environment: environment,
                               dataSource: datasource,
                               modules: [],
                               settingsUrl: settingsUrl)

    tealium = Tealium.create(config: config)

    NSLog("[TealiumPrism] Initialized - account: \(account), profile: \(profile)")
    resolver(true)
  }

  private func cacheVisitorIdIfNeeded(from trackResult: TrackResult) {
    guard cachedVisitorId == nil,
          let vid: String = trackResult.dispatch.payload.get(key: TealiumDataKey.visitorId),
          !vid.isEmpty else { return }
    cachedVisitorId = vid
    NSLog("[TealiumPrism] Cached tealium_visitor_id: \(vid)")
  }

  private func dataObject(from data: NSDictionary?) -> DataObject {
    guard let dict = data as? [String: Any],
          let dataObject = try? DataObject(jsonObject: dict) else {
      return DataObject()
    }
    return dataObject
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

    let payload = dataObject(from: data)

    tealium.track(eventName, type: .event, data: payload).onSuccess { [weak self] trackResult in
      self?.cacheVisitorIdIfNeeded(from: trackResult)
    }

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

    var payload = dataObject(from: data)
    payload.set(screenName, key: "screen_name")

    tealium.track(screenName, type: .view, data: payload).onSuccess { [weak self] trackResult in
      self?.cacheVisitorIdIfNeeded(from: trackResult)
    }

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

    tealium.dataLayer.put(data: dataObject(from: data))

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

    tealium.trace.join(id: traceId)
    NSLog("[TealiumPrism] Joined trace: \(traceId)")
    resolver(true)
  }

  @objc
  func leaveTrace(_ resolver: @escaping RCTPromiseResolveBlock,
                  rejecter: @escaping RCTPromiseRejectBlock) {

    guard let tealium = tealium else {
      resolver(false)
      return
    }

    tealium.trace.leave()
    NSLog("[TealiumPrism] Left trace")
    resolver(true)
  }

  @objc
  func getAppUuid(_ resolver: @escaping RCTPromiseResolveBlock,
                  rejecter: @escaping RCTPromiseRejectBlock) {

    guard let tealium = tealium else {
      rejecter("NOT_INITIALIZED", "Tealium not initialized", nil)
      return
    }

    tealium.dataLayer.get(key: TealiumDataKey.appUUID, as: String.self).onSuccess { uuid in
      if let uuid, !uuid.isEmpty {
        resolver(uuid.lowercased())
      } else {
        rejecter("NO_UUID", "app_uuid not available", nil)
      }
    }
  }

  @objc
  func getVisitorId(_ resolver: @escaping RCTPromiseResolveBlock,
                    rejecter: @escaping RCTPromiseRejectBlock) {

    if let vid = cachedVisitorId, !vid.isEmpty {
      NSLog("[TealiumPrism] getVisitorId: \(vid)")
      resolver(vid)
    } else {
      rejecter("NO_VISITOR_ID", "tealium_visitor_id not available", nil)
    }
  }
}
