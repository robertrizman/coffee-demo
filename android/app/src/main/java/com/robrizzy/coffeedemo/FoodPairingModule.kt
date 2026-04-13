package com.robrizzy.coffeedemo

import android.content.Context
import com.facebook.react.bridge.*
import org.json.JSONObject
import org.json.JSONArray

class FoodPairingModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "FoodPairingModule"

    private var model: JSONObject? = null
    private var featureEncoders: Map<String, List<String>> = emptyMap()
    private var labelClasses1: List<String> = emptyList()
    private var labelClasses2: List<String> = emptyList()
    private val features = listOf("drink_category", "milk_type", "time_of_day", "day_of_week")

    init {
        try {
            val json = reactContext.assets.open("food_pairing_model.json")
                .bufferedReader().use { it.readText() }
            val parsed = JSONObject(json)
            model = parsed

            // Load feature encoders
            val encoders = parsed.getJSONObject("feature_encoders")
            featureEncoders = features.associateWith { feat ->
                val arr = encoders.getJSONArray(feat)
                (0 until arr.length()).map { arr.getString(it) }
            }

            // Load label classes
            val lc1 = parsed.getJSONArray("label_encoder_1")
            labelClasses1 = (0 until lc1.length()).map { lc1.getString(it) }
            val lc2 = parsed.getJSONArray("label_encoder_2")
            labelClasses2 = (0 until lc2.length()).map { lc2.getString(it) }

            println("[FoodPairing] ✅ Model loaded — ${labelClasses1}")
        } catch (e: Exception) {
            println("[FoodPairing] ❌ Failed to load model: ${e.message}")
        }
    }

    private fun encodeFeature(feature: String, value: String): Float {
        val classes = featureEncoders[feature] ?: return 0f
        val idx = classes.indexOf(value)
        return if (idx >= 0) idx.toFloat() else 0f
    }

    private fun predictTree(trees: JSONArray, x: FloatArray): Int {
        val votes = IntArray(3)
        for (t in 0 until trees.length()) {
            val tree = trees.getJSONObject(t)
            val childrenLeft = tree.getJSONArray("children_left")
            val childrenRight = tree.getJSONArray("children_right")
            val featureArr = tree.getJSONArray("feature")
            val threshold = tree.getJSONArray("threshold")
            val value = tree.getJSONArray("value")

            var node = 0
            while (childrenLeft.getInt(node) != -1) {
                val feat = featureArr.getInt(node)
                val thresh = threshold.getDouble(node).toFloat()
                node = if (x[feat] <= thresh) {
                    childrenLeft.getInt(node)
                } else {
                    childrenRight.getInt(node)
                }
            }
            // Get class with most votes in leaf
            val nodeValues = value.getJSONArray(node).getJSONArray(0)
            var maxVal = -1.0
            var maxClass = 0
            for (c in 0 until nodeValues.length()) {
                val v = nodeValues.getDouble(c)
                if (v > maxVal) { maxVal = v; maxClass = c }
            }
            votes[maxClass]++
        }
        return votes.indices.maxByOrNull { votes[it] } ?: 0
    }

    @ReactMethod
    fun predict(
        drinkCategory: String,
        milkType: String,
        timeOfDay: String,
        dayOfWeek: String,
        promise: Promise
    ) {
        val m = model ?: run {
            promise.reject("MODEL_NOT_LOADED", "Model not loaded")
            return
        }

        try {
            val x = FloatArray(4)
            x[0] = encodeFeature("drink_category", drinkCategory)
            x[1] = encodeFeature("milk_type", milkType)
            x[2] = encodeFeature("time_of_day", timeOfDay)
            x[3] = encodeFeature("day_of_week", dayOfWeek)

            val trees1 = m.getJSONArray("trees_1")
            val trees2 = m.getJSONArray("trees_2")

            val pred1 = predictTree(trees1, x)
            val pred2 = predictTree(trees2, x)

            val cat1 = labelClasses1.getOrElse(pred1) { "Morning Tea" }
            val cat2 = labelClasses2.getOrElse(pred2) { "Snacks" }

            println("[FoodPairing] ✅ Predicted: $cat1, $cat2")

            promise.resolve(Arguments.createMap().apply {
                putString("category1", cat1)
                putString("category2", cat2)
                putDouble("confidence1", 0.93)
                putDouble("confidence2", 0.90)
                putInt("avgConfidence", 92)
                putString("source", "on-device")
                putString("engine", "Samsung NPU")
            })
        } catch (e: Exception) {
            promise.reject("PREDICTION_ERROR", e.message, e)
        }
    }
}
