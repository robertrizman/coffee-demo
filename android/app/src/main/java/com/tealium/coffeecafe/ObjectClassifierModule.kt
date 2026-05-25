package com.tealium.coffeecafe

import android.graphics.BitmapFactory
import android.util.Base64
import com.facebook.react.bridge.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions

class ObjectClassifierModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "ObjectClassifierModule"

    // True only on devices that expose dedicated neural-network hardware (NPU/DSP).
    // Snapdragon 8 Gen 2 (S23+), Tensor G2+ (Pixel 7+), Dimensity 9000+, etc.
    // Devices without hardware NN support return null → JS falls back to GPT.
    private val hasNpu: Boolean by lazy {
        reactApplicationContext.packageManager
            .hasSystemFeature("android.hardware.neural_networks")
    }

    override fun getConstants(): Map<String, Any> = mapOf("available" to hasNpu)

    private val personTerms = setOf(
        "person", "face", "man", "woman", "boy", "girl", "human",
        "portrait", "selfie", "people", "adult", "child", "crowd", "individual"
    )

    @ReactMethod
    fun classify(base64Jpeg: String, promise: Promise) {
        if (!hasNpu) {
            // No NPU → resolve null so JS falls back to GPT-4o-mini
            promise.resolve(null)
            return
        }

        val bytes = try {
            Base64.decode(base64Jpeg, Base64.DEFAULT)
        } catch (e: Exception) {
            promise.reject("INVALID_IMAGE", "Could not decode base64", e)
            return
        }

        val bitmap = try {
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                ?: throw IllegalArgumentException("BitmapFactory returned null")
        } catch (e: Exception) {
            promise.reject("INVALID_IMAGE", "Could not decode image", e)
            return
        }

        val image = InputImage.fromBitmap(bitmap, 0)
        val options = ImageLabelerOptions.Builder()
            .setConfidenceThreshold(0.45f)
            .build()

        // ML Kit automatically delegates to NNAPI (Hexagon NPU on Snapdragon) when available
        ImageLabeling.getClient(options)
            .process(image)
            .addOnSuccessListener { labels ->
                if (labels.isEmpty()) {
                    promise.resolve(null)
                    return@addOnSuccessListener
                }
                val top = labels[0]
                val isPerson = personTerms.any { top.text.lowercase().contains(it) }
                val result = Arguments.createMap().apply {
                    putString("label", top.text)
                    putInt("confidence", (top.confidence * 100).toInt())
                    putBoolean("isPerson", isPerson)
                    putString("engine", "ML Kit · NNAPI")
                }
                promise.resolve(result)
            }
            .addOnFailureListener { e ->
                promise.reject("CLASSIFY_ERROR", e.message, e)
            }
    }
}
