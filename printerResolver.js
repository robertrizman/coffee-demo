import { loadDefaultPrinter, saveDefaultPrinter } from './printerConfig';
import { getDeviceIP, deriveSubnet, scanForPrinters } from './printerScanner';

function withTimeout(ms, fn) {
  return Promise.race([
    fn(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export function isBrotherQLModel(model = '') {
  return String(model).toLowerCase().includes('ql-');
}

export function getPrinterCapabilities(printer = {}) {
  const model = String(printer.model || '').toLowerCase();
  const supportsAutoCut = printer.supports_auto_cut === true || isBrotherQLModel(model);
  const printerType = printer.printer_type
    || (isBrotherQLModel(model) ? 'brother_ql'
      : model.includes('mfc-') ? 'brother_mfc'
      : 'generic');

  return {
    printer_type: printerType,
    printerType,
    supports_auto_cut: supportsAutoCut,
    supportsAutoCut,
  };
}

export async function probePrinter(printer, timeoutMs = 2000) {
  if (!printer?.ip) return false;

  // Use HEAD request to avoid triggering prints
  const port = printer.port || 631;
  const url = `http://${printer.ip}:${port}/`;
  
  console.log('[Resolver] Probing printer at', url);

  try {
    const res = await withTimeout(timeoutMs, () => fetch(url, { method: 'HEAD' }));
    if (res && (res.ok || res.status === 401 || res.status === 403)) {
      console.log('[Resolver] Printer reachable via HEAD');
      return true;
    }
  } catch (err) {
    console.log('[Resolver] HEAD failed, trying GET:', err.message);
  }

  // Fallback to GET if HEAD not supported
  try {
    const res = await withTimeout(timeoutMs, () => fetch(url, { method: 'GET' }));
    if (res && (res.ok || res.status === 401 || res.status === 403)) {
      console.log('[Resolver] Printer reachable via GET');
      return true;
    }
  } catch (err) {
    console.log('[Resolver] GET also failed:', err.message);
  }

  return false;
}

export async function resolvePrinterForCurrentNetwork(options = {}) {
  const { scanIfNeeded = false } = options;
  const localPrinter = await loadDefaultPrinter();
  const deviceIP = await getDeviceIP();
  const subnet = deviceIP ? deriveSubnet(deviceIP) : null;

  console.log('[Resolver] Resolving printer - saved:', localPrinter?.name, localPrinter?.ip);

  if (localPrinter?.ip) {
    const sameSubnet = subnet ? deriveSubnet(localPrinter.ip) === subnet : true;
    console.log('[Resolver] Same subnet:', sameSubnet);

    if (sameSubnet) {
      // Brother QL printers use pure IPP — they don't respond to HTTP probes
      // Trust them if they're on the same subnet
      const isQL = isBrotherQLModel(localPrinter.model || localPrinter.name || '');
      if (isQL) {
        console.log('[Resolver] Brother QL detected — skipping HTTP probe, trusting saved IP');
        return { printer: { ...localPrinter, ...getPrinterCapabilities(localPrinter) }, source: 'local_default' };
      }

      const reachable = await probePrinter(localPrinter);
      console.log('[Resolver] Printer reachable:', reachable);

      if (reachable) {
        return { printer: { ...localPrinter, ...getPrinterCapabilities(localPrinter) }, source: 'local_default' };
      }
    }
  }

  if (!scanIfNeeded || !subnet) {
    console.log('[Resolver] No printer available, scanIfNeeded:', scanIfNeeded);
    return { printer: null, source: null };
  }

  console.log('[Resolver] Scanning network for printers...');
  const found = [];
  try {
    await scanForPrinters(
      () => {},
      (printer) => { found.push(printer); },
      { cancelled: false }
    );
  } catch {
    return { printer: null, source: null };
  }

  const preferred = found.find((p) => p.isPreferred) || found[0] || null;
  if (!preferred) return { printer: null, source: null };

  const enriched = { ...preferred, ...getPrinterCapabilities(preferred) };
  await saveDefaultPrinter(enriched);
  console.log('[Resolver] Found and saved printer:', enriched.name);
  return { printer: enriched, source: 'network_scan' };
}