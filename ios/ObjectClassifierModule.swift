import Foundation
import React
import Vision
import UIKit

@objc(ObjectClassifierModule)
class ObjectClassifierModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  @objc func constantsToExport() -> [AnyHashable: Any]! {
    return ["available": true]
  }

  private let personTerms = ["person", "face", "man", "woman", "boy", "girl",
                              "human", "portrait", "selfie", "people", "adult",
                              "child", "crowd", "individual"]

  @objc func classify(
    _ base64Jpeg: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let imageData = Data(base64Encoded: base64Jpeg, options: .ignoreUnknownCharacters),
          let uiImage  = UIImage(data: imageData),
          let cgImage  = uiImage.cgImage else {
      reject("INVALID_IMAGE", "Could not decode base64 image", nil)
      return
    }

    // VNClassifyImageRequest automatically routes to the ANE on A12+ iPhones
    let request = VNClassifyImageRequest()

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try handler.perform([request])

        guard let observations = request.results as? [VNClassificationObservation],
              !observations.isEmpty else {
          resolve(NSNull())
          return
        }

        // Top result is already sorted by confidence
        guard let top = observations.first, top.confidence > 0.15 else {
          resolve(NSNull())
          return
        }

        let label = top.identifier
          .replacingOccurrences(of: "_", with: " ")
          .capitalized

        let isPerson = self.personTerms.contains(where: {
          top.identifier.lowercased().contains($0)
        })

        resolve([
          "label":      label,
          "confidence": Int(top.confidence * 100),
          "isPerson":   isPerson,
          "engine":     "Apple Vision · ANE",
        ] as [String: Any])
      } catch {
        reject("CLASSIFY_ERROR", error.localizedDescription, error)
      }
    }
  }
}
