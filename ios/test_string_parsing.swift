// Run with: swift ios/test_string_parsing.swift
//
// Reproduces the exact scenario that caused:
// Swift/StringIndexValidation.swift:254: Fatal error: String index is out of bounds
//
// The crash fired when Apple Intelligence returned a JSON response whose last
// character was `}` (no trailing newline/space). The old code used a closed-range
// subscript `text[start...end.upperBound]`; when `}` is the final character,
// `end.upperBound == text.endIndex`, which is out of range for closed subscripts.

import Foundation

var passed = 0
var failed = 0

func test(_ name: String, _ block: () throws -> Void) {
    do {
        try block()
        print("✅ \(name)")
        passed += 1
    } catch {
        print("❌ \(name): \(error)")
        failed += 1
    }
}

func extractJSON(from text: String) throws -> String {
    guard let start = text.range(of: "{"),
          let end   = text.range(of: "}", options: .backwards) else {
        throw NSError(domain: "Test", code: 1, userInfo: [NSLocalizedDescriptionKey: "No JSON found"])
    }
    // FIXED: lowerBound (index of `}`) — never out of range
    // OLD (crashes): text[start.lowerBound...end.upperBound]
    return String(text[start.lowerBound...end.lowerBound])
}

// ── Tests ────────────────────────────────────────────────────────────────────

// 1. The exact crash scenario: } is the very last character
test("Response ending with } (no trailing whitespace)") {
    let response = #"{"kj_total":500,"kj_per_visit":250,"insight":"You enjoy lattes.","tip":"Try oat milk.","engine":"Apple Intelligence (ANE)"}"#
    let json = try extractJSON(from: response)
    guard json.hasPrefix("{") && json.hasSuffix("}") else {
        throw NSError(domain: "Test", code: 2, userInfo: [NSLocalizedDescriptionKey: "Bad extraction: \(json)"])
    }
}

// 2. Response with trailing newline (should also work)
test("Response ending with } followed by newline") {
    let response = "{\"category1\":\"Morning Tea\",\"category2\":\"Snacks\",\"reason\":\"Perfect pairing\"}\n"
    let json = try extractJSON(from: response)
    guard json == "{\"category1\":\"Morning Tea\",\"category2\":\"Snacks\",\"reason\":\"Perfect pairing\"}" else {
        throw NSError(domain: "Test", code: 2, userInfo: [NSLocalizedDescriptionKey: "Bad extraction: \(json)"])
    }
}

// 3. Response with leading/trailing prose (AI ignoring instructions)
test("JSON embedded in prose text") {
    let response = "Here is the result: {\"category1\":\"Lunch\",\"reason\":\"Great match\"} Hope that helps!"
    let json = try extractJSON(from: response)
    guard json == "{\"category1\":\"Lunch\",\"reason\":\"Great match\"}" else {
        throw NSError(domain: "Test", code: 2, userInfo: [NSLocalizedDescriptionKey: "Bad extraction: \(json)"])
    }
}

// 4. Single-character } at the very end (minimum reproducible crash case)
test("Minimal JSON: {} with } as last character") {
    let response = "{}"
    let json = try extractJSON(from: response)
    guard json == "{}" else {
        throw NSError(domain: "Test", code: 2, userInfo: [NSLocalizedDescriptionKey: "Bad extraction: \(json)"])
    }
}

// 5. No JSON in response — should throw, not crash
test("No JSON in response returns error gracefully") {
    let response = "Sorry, I cannot help with that."
    do {
        _ = try extractJSON(from: response)
        throw NSError(domain: "Test", code: 3, userInfo: [NSLocalizedDescriptionKey: "Should have thrown"])
    } catch let e as NSError where e.domain == "Test" && e.code == 1 {
        // Expected — correct error thrown
    }
}

// ── Summary ──────────────────────────────────────────────────────────────────
print("\n\(passed) passed, \(failed) failed")
if failed > 0 { exit(1) }
