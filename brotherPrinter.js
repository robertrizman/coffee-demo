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

/**
 * Try to connect to the saved BT address. If that fails, scan for any QL
 * printer and reconnect automatically. Returns { connected, address, name }
 * where address/name may differ from saved if the device was re-discovered.
 */
export async function ensureBluetoothConnected(savedAddress, savedName) {
  const direct = await warmupBluetoothConnection(savedAddress);
  if (direct) return { connected: true, address: savedAddress, name: savedName };

  // Direct connect failed — scan for QL printers and try to reconnect
  const found = await discoverBluetoothPrinters();
  const match = found.find(
    (p) => p.address === savedAddress || (p.name || '').toUpperCase().includes('QL')
  );
  if (!match) return { connected: false, address: savedAddress, name: savedName };

  const ok = await warmupBluetoothConnection(match.address);
  return { connected: ok, address: match.address, name: match.name || savedName };
}
