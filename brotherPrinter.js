import { NativeModules } from 'react-native';

export const BrotherPrinter = NativeModules.BrotherPrinter || null;

export function isBrotherPrinterAvailable() {
  return !!BrotherPrinter;
}

export async function warmupBluetoothConnection(address) {
  if (!BrotherPrinter?.warmupBluetoothConnection) return false;
  try {
    return await BrotherPrinter.warmupBluetoothConnection(address);
  } catch {
    return false;
  }
}

export async function discoverBluetoothPrinters() {
  if (!BrotherPrinter?.discoverBluetoothPrinters) return [];
  try {
    return await BrotherPrinter.discoverBluetoothPrinters();
  } catch {
    return [];
  }
}

export async function pairBluetoothDevice(address) {
  if (!BrotherPrinter?.pairBluetoothDevice) {
    throw new Error('Bluetooth pairing not supported on this platform');
  }
  return await BrotherPrinter.pairBluetoothDevice(address);
}

export async function printQLPdfBluetooth(address, pdfUri, autoCut) {
  if (!BrotherPrinter?.printQLPdfBluetooth) {
    throw new Error('Bluetooth printing not supported on this platform');
  }
  return await BrotherPrinter.printQLPdfBluetooth(address, pdfUri, autoCut);
}
