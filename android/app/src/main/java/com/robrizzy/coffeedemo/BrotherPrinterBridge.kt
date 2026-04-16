package com.robrizzy.coffeedemo

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import com.facebook.react.bridge.*
import com.brother.sdk.lmprinter.Channel
import com.brother.sdk.lmprinter.PrinterDriverGenerator
import com.brother.sdk.lmprinter.PrinterModel
import com.brother.sdk.lmprinter.setting.QLPrintSettings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class BrotherPrinterBridge(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "BrotherPrinter"

    // ── WiFi Print ────────────────────────────────────────

    @ReactMethod
    fun printQLPdf(
        printerIP: String,
        pdfUri: String,
        autoCut: Boolean,
        promise: Promise
    ) {
        try {
            val uri = java.net.URI(pdfUri)
            val pdfFile = File(uri.path)

            if (!pdfFile.exists()) {
                promise.reject("PDF_ERROR", "PDF file not found: ${pdfFile.absolutePath}")
                return
            }

            val channel = Channel.newWifiChannel(printerIP)
            val driverResult = PrinterDriverGenerator.openChannel(channel)

            if (driverResult.error.code != com.brother.sdk.lmprinter.OpenChannelError.ErrorCode.NoError) {
                promise.reject("CHANNEL_ERROR", "Failed to open printer channel: ${driverResult.error.code}")
                return
            }

            val driver = driverResult.driver
            val settings = QLPrintSettings(PrinterModel.QL_820NWB)
            settings.isAutoCut = autoCut
            settings.labelSize = QLPrintSettings.LabelSize.DieCutW39H48
            settings.workPath = reactApplicationContext.cacheDir.absolutePath

            val printError = driver.printPDF(pdfFile.absolutePath, settings)
            driver.closeChannel()

            if (printError.code != com.brother.sdk.lmprinter.PrintError.ErrorCode.NoError) {
                promise.reject("PRINT_ERROR", "Print failed: ${printError.code}")
            } else {
                val result = Arguments.createMap().apply {
                    putBoolean("success", true)
                    putString("ip", printerIP)
                    putBoolean("autoCut", autoCut)
                }
                promise.resolve(result)
            }
        } catch (e: Exception) {
            promise.reject("PRINT_ERROR", "Failed to print: ${e.message}", e)
        }
    }

    // ── Bluetooth Print ───────────────────────────────────

    @ReactMethod
    fun printQLPdfBluetooth(
        bluetoothAddress: String,
        pdfUri: String,
        autoCut: Boolean,
        promise: Promise
    ) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val uri = java.net.URI(pdfUri)
                val pdfFile = File(uri.path)

                if (!pdfFile.exists()) {
                    withContext(Dispatchers.Main) {
                        promise.reject("PDF_ERROR", "PDF file not found: ${pdfFile.absolutePath}")
                    }
                    return@launch
                }

                val bluetoothManager = reactApplicationContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                val bluetoothAdapter = bluetoothManager?.adapter
                if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
                    withContext(Dispatchers.Main) {
                        promise.reject("BLUETOOTH_OFF", "Bluetooth is not enabled.")
                    }
                    return@launch
                }

                val channel = Channel.newBluetoothChannel(bluetoothAddress, bluetoothAdapter)
                val driverResult = PrinterDriverGenerator.openChannel(channel)

                if (driverResult.error.code != com.brother.sdk.lmprinter.OpenChannelError.ErrorCode.NoError) {
                    withContext(Dispatchers.Main) {
                        promise.reject("CHANNEL_ERROR", "Failed to open Bluetooth channel: ${driverResult.error.code}")
                    }
                    return@launch
                }

                val driver = driverResult.driver
                val settings = QLPrintSettings(PrinterModel.QL_820NWB)
                settings.isAutoCut = autoCut
                settings.labelSize = QLPrintSettings.LabelSize.DieCutW39H48
                settings.workPath = reactApplicationContext.cacheDir.absolutePath

                val printError = driver.printPDF(pdfFile.absolutePath, settings)
                driver.closeChannel()

                withContext(Dispatchers.Main) {
                    if (printError.code != com.brother.sdk.lmprinter.PrintError.ErrorCode.NoError) {
                        promise.reject("PRINT_ERROR", "Bluetooth print failed: ${printError.code}")
                    } else {
                        val result = Arguments.createMap().apply {
                            putBoolean("success", true)
                            putString("bluetoothAddress", bluetoothAddress)
                            putBoolean("autoCut", autoCut)
                        }
                        promise.resolve(result)
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("PRINT_ERROR", "Bluetooth print failed: ${e.message}", e)
                }
            }
        }
    }

    // ── Bluetooth Discovery ───────────────────────────────

    @ReactMethod
    fun discoverBluetoothPrinters(promise: Promise) {
        val context = reactApplicationContext

        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val adapter = bluetoothManager?.adapter
        if (adapter == null || !adapter.isEnabled) {
            promise.reject("BLUETOOTH_OFF", "Bluetooth is not enabled. Please enable Bluetooth and try again.")
            return
        }

        // Accumulate discovered devices as (name, address) pairs to avoid WritableMap reuse issues
        val discovered = mutableListOf<Pair<String, String>>()
        var resolved = false
        var broadcastReceiver: android.content.BroadcastReceiver? = null

        fun resolveDiscovery() {
            if (resolved) return
            resolved = true
            try { broadcastReceiver?.let { context.unregisterReceiver(it) } } catch (e: Exception) { /* already unregistered */ }
            val result = Arguments.createArray()
            discovered.forEach { (name, address) ->
                val map = Arguments.createMap()
                map.putString("name", name)
                map.putString("address", address)
                map.putString("type", "bluetooth")
                result.pushMap(map)
            }
            promise.resolve(result)
        }

        broadcastReceiver = object : android.content.BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: android.content.Intent?) {
                when (intent?.action) {
                    android.bluetooth.BluetoothDevice.ACTION_FOUND -> {
                        val device: android.bluetooth.BluetoothDevice? =
                            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                                intent.getParcelableExtra(
                                    android.bluetooth.BluetoothDevice.EXTRA_DEVICE,
                                    android.bluetooth.BluetoothDevice::class.java
                                )
                            } else {
                                @Suppress("DEPRECATION")
                                intent.getParcelableExtra(android.bluetooth.BluetoothDevice.EXTRA_DEVICE)
                            }
                        device?.let {
                            val name = try { it.name ?: "" } catch (e: SecurityException) { "" }
                            val address = it.address ?: return@let

                            // Filter 1: Bluetooth device class — printers are under the IMAGING major class
                            val majorClass = try {
                                it.bluetoothClass?.majorDeviceClass
                            } catch (e: Exception) { null }
                            val isImagingClass = majorClass == android.bluetooth.BluetoothClass.Device.Major.IMAGING

                            // Filter 2: Known Brother label/receipt printer model name prefixes
                            val isPrinterName = name.matches(
                                Regex("(?i)(QL|PT|TD|MW|RJ|PJ|VC)-.*|Brother.*")
                            )

                            if (!isImagingClass && !isPrinterName) return@let

                            val displayName = name.ifEmpty { "Brother Printer" }
                            if (discovered.none { d -> d.second == address }) {
                                discovered.add(Pair(displayName, address))
                            }
                        }
                    }
                    BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> resolveDiscovery()
                }
            }
        }

        val filter = android.content.IntentFilter().apply {
            addAction(android.bluetooth.BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        }
        context.registerReceiver(broadcastReceiver, filter)

        if (adapter.isDiscovering) adapter.cancelDiscovery()

        val started = adapter.startDiscovery()
        if (!started) {
            try { context.unregisterReceiver(broadcastReceiver) } catch (e: Exception) { /* ignore */ }
            promise.reject("DISCOVERY_ERROR", "Could not start Bluetooth discovery. Ensure location and Bluetooth permissions are granted.")
            return
        }

        // Safety timeout — Android guarantees ACTION_DISCOVERY_FINISHED but this guards edge cases
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ resolveDiscovery() }, 15_000)
    }

    // ── Bluetooth Pairing ─────────────────────────────────
    //
    // The Brother SDK requires the device to be bonded (paired) before
    // Channel.newBluetoothChannel() can open an RFCOMM stream.
    // This method checks the bond state and initiates pairing if needed.

    @ReactMethod
    fun pairBluetoothDevice(address: String, promise: Promise) {
        val context = reactApplicationContext
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val adapter = bluetoothManager?.adapter

        if (adapter == null || !adapter.isEnabled) {
            promise.reject("BLUETOOTH_OFF", "Bluetooth is not enabled.")
            return
        }

        val device = try {
            adapter.getRemoteDevice(address)
        } catch (e: Exception) {
            promise.reject("DEVICE_ERROR", "Invalid Bluetooth address: $address")
            return
        }

        // Already bonded — nothing to do
        if (device.bondState == android.bluetooth.BluetoothDevice.BOND_BONDED) {
            val result = Arguments.createMap()
            result.putBoolean("success", true)
            result.putBoolean("alreadyPaired", true)
            promise.resolve(result)
            return
        }

        var receiver: android.content.BroadcastReceiver? = null
        var resolved = false

        fun finish(success: Boolean, alreadyPaired: Boolean = false, errorMsg: String? = null) {
            if (resolved) return
            resolved = true
            try { receiver?.let { context.unregisterReceiver(it) } } catch (e: Exception) { /* ignore */ }
            if (success) {
                val result = Arguments.createMap()
                result.putBoolean("success", true)
                result.putBoolean("alreadyPaired", alreadyPaired)
                promise.resolve(result)
            } else {
                promise.reject("PAIR_FAILED", errorMsg ?: "Pairing failed")
            }
        }

        receiver = object : android.content.BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: android.content.Intent?) {
                if (intent?.action != android.bluetooth.BluetoothDevice.ACTION_BOND_STATE_CHANGED) return
                val changed: android.bluetooth.BluetoothDevice? =
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(
                            android.bluetooth.BluetoothDevice.EXTRA_DEVICE,
                            android.bluetooth.BluetoothDevice::class.java
                        )
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(android.bluetooth.BluetoothDevice.EXTRA_DEVICE)
                    }
                if (changed?.address != address) return

                when (changed.bondState) {
                    android.bluetooth.BluetoothDevice.BOND_BONDED ->
                        finish(true)
                    android.bluetooth.BluetoothDevice.BOND_NONE ->
                        finish(false, errorMsg = "Pairing was rejected or cancelled. Make sure the printer is in pairing mode.")
                    // BOND_BONDING — still in progress, wait
                }
            }
        }

        context.registerReceiver(
            receiver,
            android.content.IntentFilter(android.bluetooth.BluetoothDevice.ACTION_BOND_STATE_CHANGED)
        )

        // Cancel any active discovery — Android cannot scan and pair simultaneously
        if (adapter.isDiscovering) adapter.cancelDiscovery()

        val started = try { device.createBond() } catch (e: Exception) { false }
        if (!started) {
            try { context.unregisterReceiver(receiver) } catch (e: Exception) { /* ignore */ }
            promise.reject(
                "PAIR_FAILED",
                "Could not start pairing. Hold the Bluetooth button on the printer for 3 seconds to enter pairing mode, then try again."
            )
            return
        }

        // 30-second safety timeout — gives the user time to accept the system pairing dialog
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            finish(false, errorMsg = "Pairing timed out. Hold the Bluetooth button on the printer to enter pairing mode, then try again.")
        }, 30_000)
    }
}
