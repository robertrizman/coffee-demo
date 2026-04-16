package com.robrizzy.coffeedemo

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import com.facebook.react.bridge.*
import com.brother.sdk.lmprinter.Channel
import com.brother.sdk.lmprinter.PrinterDriverGenerator
import com.brother.sdk.lmprinter.PrinterModel
import com.brother.sdk.lmprinter.PrinterSearcher
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

        // Check Bluetooth is available and enabled
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val adapter = bluetoothManager?.adapter
        if (adapter == null || !adapter.isEnabled) {
            promise.reject("BLUETOOTH_OFF", "Bluetooth is not enabled. Please enable Bluetooth and try again.")
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val result = PrinterSearcher.startBluetoothSearch(context)
                val printers = Arguments.createArray()

                result.channels.forEach { channel ->
                    val printer = Arguments.createMap().apply {
                        putString("name", channel.extraInfo[Channel.ExtraInfoKey.ModelName] ?: "Brother Printer")
                        putString("address", channel.channelInfo)
                        putString("type", "bluetooth")
                    }
                    printers.pushMap(printer)
                }

                withContext(Dispatchers.Main) {
                    promise.resolve(printers)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("DISCOVERY_ERROR", "Bluetooth discovery failed: ${e.message}", e)
                }
            }
        }
    }
}
