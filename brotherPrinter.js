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
