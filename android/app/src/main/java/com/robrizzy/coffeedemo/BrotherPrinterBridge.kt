package com.robrizzy.coffeedemo

import com.facebook.react.bridge.*
import com.brother.sdk.lmprinter.Channel
import com.brother.sdk.lmprinter.PrinterDriverGenerator
import com.brother.sdk.lmprinter.PrinterModel
import com.brother.sdk.lmprinter.setting.QLPrintSettings
import java.io.File

class BrotherPrinterBridge(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "BrotherPrinter"

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
}