package com.tealium.coffeecafe

import android.content.Context
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import com.facebook.react.bridge.*

class InstallReferrerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "InstallReferrerModule"

    // Reads the Play Store install referrer string once, caches it in SharedPreferences.
    // Subsequent calls return the cached value so we don't reconnect to the Play Store service.
    @ReactMethod
    fun getReferrer(promise: Promise) {
        val prefs = reactApplicationContext.getSharedPreferences("tealium_install_referrer", Context.MODE_PRIVATE)
        val cached = prefs.getString("referrer", null)

        if (cached != null) {
            promise.resolve(cached)
            return
        }

        val client = InstallReferrerClient.newBuilder(reactApplicationContext).build()
        client.startConnection(object : InstallReferrerStateListener {
            override fun onInstallReferrerSetupFinished(responseCode: Int) {
                when (responseCode) {
                    InstallReferrerClient.InstallReferrerResponse.OK -> {
                        try {
                            val referrer = client.installReferrer.installReferrer ?: ""
                            client.endConnection()
                            prefs.edit().putString("referrer", referrer).apply()
                            promise.resolve(referrer)
                        } catch (e: Exception) {
                            client.endConnection()
                            promise.reject("REFERRER_ERROR", e.message ?: "Unknown error")
                        }
                    }
                    InstallReferrerClient.InstallReferrerResponse.FEATURE_NOT_SUPPORTED -> {
                        client.endConnection()
                        promise.reject("REFERRER_NOT_SUPPORTED", "Play Store does not support install referrer")
                    }
                    else -> {
                        client.endConnection()
                        promise.reject("REFERRER_UNAVAILABLE", "Response code: $responseCode")
                    }
                }
            }

            override fun onInstallReferrerServiceDisconnected() {
                promise.reject("REFERRER_DISCONNECTED", "Install referrer service disconnected")
            }
        })
    }
}
