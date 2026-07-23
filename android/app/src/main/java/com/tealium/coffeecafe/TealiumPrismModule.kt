package com.tealium.coffeecafe

import android.app.Application
import android.util.Log
import com.facebook.react.bridge.*
import com.tealium.prism.core.api.Tealium
import com.tealium.prism.core.api.TealiumConfig
import com.tealium.prism.core.api.data.DataObject
import com.tealium.prism.core.api.logger.LogHandler
import com.tealium.prism.core.api.logger.LogLevel

class TealiumPrismModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "TealiumPrismModule"

    companion object {
        private var tealium: Tealium? = null
        private var cachedVisitorId: String? = null
    }

    private fun cacheVisitorIdIfNeeded(result: com.tealium.prism.core.api.misc.TealiumResult<com.tealium.prism.core.api.tracking.TrackResult>) {
        if (cachedVisitorId != null) return
        result.getOrNull()?.dispatch?.payload()?.getString("tealium_visitor_id")?.let { vid ->
            if (vid.isNotEmpty()) {
                cachedVisitorId = vid
                println("[TealiumPrism] Cached tealium_visitor_id: $vid")
            }
        }
    }

    @ReactMethod
    fun initialize(account: String, profile: String, environment: String, datasource: String, promise: Promise) {
        try {
            // Unlike iOS's weak-referenced instance registry (where releasing our reference lets
            // the old instance deallocate automatically), Android's TealiumInstanceManager holds
            // instances in a plain MutableMap with strong references — Tealium.create(config) will
            // keep handing back the original instance forever, ignoring any new settingsUrl, unless
            // we explicitly shut it down first.
            tealium = null
            Tealium.shutdown("$account-$profile")

            val app = reactApplicationContext.applicationContext as Application
            val settingsUrl = "https://tags.tiqcdn.com/dle/success-robert-rizman/coffee-demo/mobile_settings_dev.json?cb=${(100000..999999).random()}"
            val config = TealiumConfig.Builder(
                application = app,
                accountName = account,
                profileName = profile,
                environment = environment,
                modules = listOf()
            ).setDataSource(datasource)
                .setSettingsUrl(settingsUrl)
                .configureCoreSettings { it.setLogLevel(LogLevel.TRACE) }
                .setLogHandler(object : LogHandler {
                    override fun log(tag: String, message: String, level: LogLevel) {
                        Log.d("TealiumPrismSDK", "[${level.name}] $tag: $message")
                    }
                })
                .build()

            tealium = Tealium.create(config)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun track(eventName: String, data: ReadableMap?, promise: Promise) {
        val t = tealium ?: run { promise.reject("NOT_INITIALIZED", "PRISM not initialized"); return }
        try {
            t.track(eventName, buildDataObject(data)).subscribe { result ->
                if (result.isFailure) {
                    Log.e("TealiumPrismSDK", "track('$eventName') failed", result.exceptionOrNull())
                }
                cacheVisitorIdIfNeeded(result)
            }
            promise.resolve(true)
        } catch (e: Exception) { promise.reject("TRACK_ERROR", e.message, e) }
    }

    @ReactMethod
    fun trackView(screenName: String, data: ReadableMap?, promise: Promise) {
        val t = tealium ?: run { promise.reject("NOT_INITIALIZED", "PRISM not initialized"); return }
        try {
            t.track(screenName, buildDataObject(data)).subscribe { result ->
                if (result.isFailure) {
                    Log.e("TealiumPrismSDK", "trackView('$screenName') failed", result.exceptionOrNull())
                }
                cacheVisitorIdIfNeeded(result)
            }
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

    @ReactMethod
    fun getVisitorId(promise: Promise) {
        // Return the value intercepted from the enriched track() payload
        val cached = cachedVisitorId
        if (!cached.isNullOrEmpty()) {
            println("[TealiumPrism] getVisitorId from cache: $cached")
            promise.resolve(cached)
            return
        }
        // Not cached yet — events haven't fired or the dispatch payload didn't contain it
        promise.reject("NO_VISITOR_ID", "tealium_visitor_id not yet available")
    }
}