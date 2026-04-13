import NetInfo from '@react-native-community/netinfo';

const PRINTER_PORTS = [631, 9100]; // Check IPP (631) first for Brother QL, then raw TCP (9100)
const BATCH_SIZE = 30; // Increased for faster scanning
const PROBE_TIMEOUT = 1500; // Reduced timeout for faster scanning

export async function getDeviceIP() {
  try {
    const state = await NetInfo.fetch();
    if (state.type !== 'wifi' || !state.details?.ipAddress) return null;
    return state.details.ipAddress;
  } catch {
    return null;
  }
}

export function deriveSubnet(ip) {
  return ip.split('.').slice(0, 3).join('.');
}

async function probePrinterOnPort(ip, port) {
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), PROBE_TIMEOUT) : null;

    // Use HEAD instead of GET to avoid triggering prints
    const res = await fetch(`http://${ip}:${port}/`, {
      method: 'HEAD',
      signal: controller?.signal,
    });

    if (timer) clearTimeout(timer);
    if (!res || (!res.ok && res.status !== 401 && res.status !== 403)) {
      // Some printers don't support HEAD, try GET as fallback but with shorter timeout
      const timer2 = controller ? setTimeout(() => controller.abort(), 800) : null;
      const res2 = await fetch(`http://${ip}:${port}/`, {
        method: 'GET',
        signal: controller?.signal,
      });
      if (timer2) clearTimeout(timer2);
      if (!res2 || (!res2.ok && res2.status !== 401 && res2.status !== 403)) return null;
      
      const text = await res2.text();
      if (!text || text.length < 10) return null;
      
      console.log(`[Scanner] Found at ${ip}:${port} (GET) - ${text.length} bytes`);
      return { text, port };
    }

    // HEAD request succeeded - now get the actual content
    const res2 = await fetch(`http://${ip}:${port}/`, {
      method: 'GET',
      signal: controller?.signal,
    });
    
    const text = await res2.text();
    if (!text || text.length < 10) return null;

    console.log(`[Scanner] Found at ${ip}:${port} (HEAD+GET) - ${text.length} bytes`);
    
    return { text, port };
  } catch (err) {
    // Silently ignore connection failures (most IPs won't have printers)
    return null;
  }
}

function parsePrinterInfo(text, port) {
  const lower = text.toLowerCase();

  // Brother QL series detection (port 631 = IPP, preferred)
  if (port === 631) {
    if (lower.includes('ql-820')) {
      console.log('[Scanner] ✓ Brother QL-820NWB (port 631)');
      return { 
        name: 'Brother QL-820NWB', 
        model: 'QL-820NWB', 
        printer_type: 'brother_ql', 
        supports_auto_cut: true, 
        isPreferred: true,
        port: 631 
      };
    }
    if (lower.includes('ql-810')) {
      console.log('[Scanner] ✓ Brother QL-810W (port 631)');
      return { 
        name: 'Brother QL-810W', 
        model: 'QL-810W', 
        printer_type: 'brother_ql', 
        supports_auto_cut: true, 
        isPreferred: true,
        port: 631 
      };
    }
    if (lower.includes('ql-800')) {
      console.log('[Scanner] ✓ Brother QL-800 (port 631)');
      return { 
        name: 'Brother QL-800', 
        model: 'QL-800', 
        printer_type: 'brother_ql', 
        supports_auto_cut: true, 
        isPreferred: true,
        port: 631 
      };
    }
    if (lower.includes('ql-')) {
      console.log('[Scanner] ✓ Brother QL Series (port 631)');
      return { 
        name: 'Brother QL Series', 
        model: 'QL', 
        printer_type: 'brother_ql', 
        supports_auto_cut: true, 
        isPreferred: true,
        port: 631 
      };
    }
    
    // MFC on port 631
    if (lower.includes('mfc-l2730')) {
      console.log('[Scanner] ✓ Brother MFC-L2730DW (port 631)');
      return { 
        name: 'Brother MFC-L2730DW', 
        model: 'MFC-L2730DW', 
        printer_type: 'brother_mfc', 
        supports_auto_cut: false, 
        isPreferred: false,
        port: 631
      };
    }
  }

  // Port 9100 detection
  if (port === 9100) {
    if (lower.includes('mfc-l2730')) {
      console.log('[Scanner] ✓ Brother MFC-L2730DW (port 9100)');
      return { 
        name: 'Brother MFC-L2730DW', 
        model: 'MFC-L2730DW', 
        printer_type: 'brother_mfc', 
        supports_auto_cut: false, 
        isPreferred: false,
        port: 9100
      };
    }
  }
  
  // Generic Brother detection (any port)
  if (lower.includes('brother')) {
    const titleMatch = text.match(/<title[^>]*>([^<]{3,60})<\/title>/i);
    const printerName = titleMatch ? titleMatch[1].trim() : 'Brother Printer';
    console.log(`[Scanner] ✓ Generic Brother: ${printerName} (port ${port})`);
    return { 
      name: printerName, 
      model: 'Brother', 
      printer_type: 'generic', 
      supports_auto_cut: false, 
      isPreferred: false,
      port 
    };
  }

  // Generic printer detection
  const titleMatch = text.match(/<title[^>]*>([^<]{3,60})<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].trim();
    const t = title.toLowerCase();
    if (t.includes('print') || t.includes('hp ') ||
        t.includes('epson') || t.includes('canon') || t.includes('xerox') ||
        t.includes('lexmark') || t.includes('label')) {
      console.log(`[Scanner] ✓ Generic printer: ${title} (port ${port})`);
      return { 
        name: title, 
        model: 'Unknown', 
        printer_type: 'generic', 
        supports_auto_cut: false, 
        isPreferred: false,
        port 
      };
    }
  }

  return null;
}

async function identifyPrinter(ip) {
  // Check both ports in parallel for faster scanning
  const results = await Promise.all(
    PRINTER_PORTS.map(port => probePrinterOnPort(ip, port))
  );
  
  // CHANGED: Collect ALL printers found on this IP (different ports)
  const foundPrinters = [];
  
  for (const result of results) {
    if (result) {
      const printerInfo = parsePrinterInfo(result.text, result.port);
      if (printerInfo) {
        foundPrinters.push(printerInfo);
      }
    }
  }
  
  // Return all printers found (could be multiple on different ports)
  return foundPrinters;
}

export async function scanForPrinters(onProgress, onFound, signal = {}) {
  const deviceIP = await getDeviceIP();
  if (!deviceIP) throw new Error('Not connected to WiFi. Please connect and try again.');

  const subnet = deriveSubnet(deviceIP);
  const total = 254;
  let scanned = 0;
  const found = [];
  const seenPrinters = new Set(); // Track unique printers by IP:port

  // Prioritize common printer IP addresses
  const commonLast = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 1, 2, 200, 201, 254];
  const allLast = Array.from({ length: 254 }, (_, i) => i + 1);
  const ordered = [...commonLast, ...allLast.filter((n) => !commonLast.includes(n))];

  console.log('[Scanner] Starting scan of', total, 'addresses...');

  for (let i = 0; i < ordered.length; i += BATCH_SIZE) {
    if (signal.cancelled) {
      console.log('[Scanner] Scan cancelled at', scanned, 'addresses');
      break;
    }
    
    const batch = ordered.slice(i, i + BATCH_SIZE);
    
    // Process batch in parallel
    await Promise.all(
      batch.map(async (last) => {
        if (signal.cancelled) return;
        const ip = `${subnet}.${last}`;

        const printers = await identifyPrinter(ip);
        scanned++;
        const percent = Math.round((scanned / total) * 100);
        onProgress(percent, total);
        
        // CHANGED: Handle multiple printers per IP
        if (printers && printers.length > 0) {
          for (const printer of printers) {
            const key = `${ip}:${printer.port}`;
            if (!seenPrinters.has(key)) {
              seenPrinters.add(key);
              const result = { ip, ...printer };
              found.push(result);
              onFound(result);
              console.log(`[Scanner] Added: ${printer.name} at ${ip}:${printer.port}`);
            }
          }
        }
      })
    );
  }

  console.log(`[Scanner] Scan complete. Found ${found.length} printers.`);
  return found;
}
