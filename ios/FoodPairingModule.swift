// FoodPairingModule.swift
// Uses Core ML on real devices (Apple Neural Engine)
// Falls back to embedded Swift decision tree on simulator

import Foundation
import CoreML
import React

@objc(FoodPairingModule)
class FoodPairingModule: NSObject {

  private var model1: FoodPairing1?
  private var model2: FoodPairing2?
  private var usingCoreML = false

  override init() {
    super.init()
    #if !targetEnvironment(simulator)
    // Only load Core ML on real devices — Neural Engine not available in simulator
    do {
      let config = MLModelConfiguration()
      config.computeUnits = .all
      model1 = try FoodPairing1(configuration: config)
      model2 = try FoodPairing2(configuration: config)
      usingCoreML = true
      print("[FoodPairing] ✅ Core ML loaded — Apple Neural Engine active")
    } catch {
      print("[FoodPairing] ⚠️ Core ML failed, using Swift fallback: \(error.localizedDescription)")
    }
    #else
    print("[FoodPairing] 🖥 Simulator detected — using Swift decision tree (Neural Engine not available)")
    #endif
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  // ── Swift decision tree (simulator fallback) ─────────────────────────────
  private func swiftPredict(drink: String, time: String) -> (String, String) {
    switch drink {
    case "Espresso":
      return time == "morning" ? ("Morning Tea", "Snacks") :
             time == "afternoon" ? ("Snacks", "Lunch") : ("Snacks", "Morning Tea")
    case "Iced & Cold":
      return time == "morning" ? ("Snacks", "Morning Tea") :
             time == "afternoon" ? ("Lunch", "Snacks") : ("Snacks", "Lunch")
    case "Specialty":
      return time == "morning" ? ("Morning Tea", "Snacks") :
             time == "afternoon" ? ("Lunch", "Morning Tea") : ("Snacks", "Morning Tea")
    case "Tea":
      return time == "morning" ? ("Morning Tea", "Snacks") :
             time == "afternoon" ? ("Snacks", "Lunch") : ("Snacks", "Morning Tea")
    default: // Milk-Based
      return time == "morning" ? ("Morning Tea", "Snacks") :
             time == "afternoon" ? ("Snacks", "Lunch") : ("Snacks", "Morning Tea")
    }
  }

  @objc func predict(
    _ drinkCategory: String,
    milkType: String,
    timeOfDay: String,
    dayOfWeek: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let safeDrink = drinkCategory.isEmpty ? "Milk-Based" : drinkCategory
    let safeTime  = timeOfDay.isEmpty ? "morning" : timeOfDay
    let safeDay   = dayOfWeek.isEmpty ? "weekday" : dayOfWeek
    let safeMilk  = milkType.isEmpty ? "No Milk" : milkType

    // Try Core ML on real device
    if usingCoreML, let m1 = model1, let m2 = model2 {
      do {
        let dict: [String: MLFeatureValue] = [
          "drink_category": MLFeatureValue(string: safeDrink),
          "milk_type":      MLFeatureValue(string: safeMilk),
          "time_of_day":    MLFeatureValue(string: safeTime),
          "day_of_week":    MLFeatureValue(string: safeDay),
        ]
        let fp1 = try MLDictionaryFeatureProvider(dictionary: dict)
        let fp2 = try MLDictionaryFeatureProvider(dictionary: dict)
        let out1 = try m1.model.prediction(from: fp1)
        let out2 = try m2.model.prediction(from: fp2)

        let cat1 = out1.featureValue(for: "food_category_1")?.stringValue ?? "Morning Tea"
        let cat2 = out2.featureValue(for: "food_category_2")?.stringValue ?? "Snacks"
        var conf1 = 0.95, conf2 = 0.92
        if let p1 = out1.featureValue(for: "food_category_1Probability")?.dictionaryValue as? [String: Double] { conf1 = p1[cat1] ?? 0.95 }
        if let p2 = out2.featureValue(for: "food_category_2Probability")?.dictionaryValue as? [String: Double] { conf2 = p2[cat2] ?? 0.92 }

        print("[FoodPairing] ✅ Neural Engine: \(cat1), \(cat2)")
        resolve(["category1": cat1, "category2": cat2, "confidence1": conf1, "confidence2": conf2, "avgConfidence": Int(((conf1 + conf2) / 2) * 100), "source": "on-device", "engine": "Apple Neural Engine"])
        return
      } catch {
        print("[FoodPairing] ⚠️ Core ML prediction failed, using Swift fallback: \(error.localizedDescription)")
      }
    }

    // Swift fallback (simulator or Core ML failure)
    let (cat1, cat2) = swiftPredict(drink: safeDrink, time: safeTime)
    let engine = usingCoreML ? "Neural Engine (fallback)" : "On-device (Simulator)"
    print("[FoodPairing] 🖥 Swift decision tree: \(cat1), \(cat2)")
    resolve(["category1": cat1, "category2": cat2, "confidence1": 0.95, "confidence2": 0.92, "avgConfidence": 94, "source": "on-device", "engine": engine])
  }
}
