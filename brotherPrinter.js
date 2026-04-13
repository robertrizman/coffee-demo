import { NativeModules, Platform } from 'react-native';

export const BrotherPrinter = NativeModules.BrotherPrinter || null;

export function isBrotherPrinterAvailable() {
  return !!BrotherPrinter;
}
