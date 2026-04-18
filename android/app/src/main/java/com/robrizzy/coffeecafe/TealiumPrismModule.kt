package com.robrizzy.coffeecafe

import android.app.Application
import com.facebook.react.bridge.*
import com.tealium.prism.core.api.Modules
import com.tealium.prism.core.api.Tealium
import com.tealium.prism.core.api.TealiumConfig
import com.tealium.prism.core.api.data.DataObject

class TealiumPrismModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "TealiumPrismModule"

    companion object {
        private var tealium: Tealium? = null
        private var initialized = false
    }

    @ReactMethod
    fun initialize(account: String, profile: String, environment: String, datasource: String, promise: Promise) {
        if (initialized) { promise.resolve(true); return }
        try {
            val app = reactApplicationContext.applicationContext as Application
            val config = TealiumConfig.Builder(
                application = app,
                accountName = account,
                profileName = profile,
                environment = environment,
                modules = listOf(
                    Modules.appData(),
                    Modules.collect(),
                    Modules.connectivityData(),
                    Modules.deviceData(),
                    Modules.timeData(),
                    Modules.trace(),
                )
            ).setDataSource(datasource).build()

            tealium = Tealium.create(config)
            initialized = true
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun track(eventName: String, data: ReadableMap?, promise: Promise) {
        val t = tealium ?: run { promise.reject("NOT_INITIALIZED", "PRISM not initialized"); return }
        try {
            t.track(eventName, buildDataObject(data))
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("TRACK_ERROR", e.message, e) }
    }

    @ReactMethod
    fun trackView(screenName: String, data: ReadableMap?, promise: Promise) {
        val t = tealium ?: run { promise.reject("NOT_INITIALIZED", "PRISM not initialized"); return }
        try {
            t.track(screenName, buildDataObject(data))
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("TRACK_ERROR", e.message, e) }
    }

    @ReactMethod
    fun setDataLayer(data: ReadableMap, promise: Promise) {
        val t = tealium ?: run { promise.reject("NOT_INITIALIZED", "PRISM not initialized"); return }
        try {
            val iter = data.keySetIterator()
            while (iter.hasNextKey()) {
                val key = iter.nextKey()
                when (data.getType(key)) {
                    ReadableType.String -> t.dataLayer.put(key, data.getString(key) ?: "")
                    ReadableType.Number -> t.dataLayer.put(key, data.getDouble(key))
                    ReadableType.Boolean -> t.dataLayer.put(key, data.getBoolean(key))
                    else -> {}
                }
            }
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("DATALAYER_ERROR", e.message, e) }
    }

    @ReactMethod
    fun joinTrace(traceId: String, promise: Promise) {
        val t = tealium ?: run { promise.reject("NOT_INITIALIZED", "PRISM not initialized"); return }
        try { t.trace.join(traceId); promise.resolve(true) }
        catch (e: Exception) { promise.reject("TRACE_ERROR", e.message, e) }
    }

    @ReactMethod
    fun leaveTrace(promise: Promise) {
        try { tealium?.trace?.leave(); promise.resolve(true) }
        catch (e: Exception) { promise.reject("TRACE_ERROR", e.message, e) }
    }

    private fun buildDataObject(map: ReadableMap?): DataObject {
        return DataObject.create {
            map?.keySetIterator()?.let { iter ->
                while (iter.hasNextKey()) {
                    val key = iter.nextKey()
                    when (map.getType(key)) {
                        ReadableType.String -> put(key, map.getString(key) ?: "")
                        ReadableType.Number -> put(key, map.getDouble(key))
                        ReadableType.Boolean -> put(key, map.getBoolean(key))
                        else -> {}
                    }
                }
            }
        }
    }

    @ReactMethod
    fun getAppUuid(promise: Promise) {
        val t = tealium ?: run { promise.reject("NOT_INITIALIZED", "PRISM not initialized"); return }
        try {
            t.dataLayer.getString("app_uuid").subscribe { result ->
                val uuid = result.getOrNull()
                if (!uuid.isNullOrEmpty()) {
                    println("[TealiumPrism] app_uuid: $uuid")
                    promise.resolve(uuid.lowercase())
                } else {
                    promise.reject("NO_UUID", "app_uuid not available")
                }
            }
        } catch (e: Exception) {
            promise.reject("UUID_ERROR", e.message, e)
        }
    }
}