/**
 * Pure JavaScript QR Code generator
 * Outputs an SVG string — no native modules, works in expo-print HTML
 *
 * Uses the qrcode-generator algorithm (Reed-Solomon, mode auto)
 * Lightweight implementation sufficient for short URLs (~200 chars)
 */

// ── Reed-Solomon GF(256) tables ──────────────────────────
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = x << 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGenerator(degree) {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const ng = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      ng[j] ^= gfMul(g[j], GF_EXP[i]);
      ng[j + 1] ^= g[j];
    }
    g = ng;
  }
  return g;
}

function rsEncode(data, ecLen) {
  const gen = rsGenerator(ecLen);
  const msg = [...data, ...new Array(ecLen).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

// ── QR spec constants (version 3, ECC L) ────────────────
// We target version 3 (29×29) which holds up to ~127 alphanum chars
// For longer strings we bump to version 4 (33×33, ~187 chars)

const VERSIONS = {
  1: { size: 21, ecBlocks: [{ ecLen: 7, dataLen: 19 }] },
  2: { size: 25, ecBlocks: [{ ecLen: 10, dataLen: 34 }] },
  3: { size: 29, ecBlocks: [{ ecLen: 15, dataLen: 55 }] },
  4: { size: 33, ecBlocks: [{ ecLen: 20, dataLen: 80 }] },
  5: { size: 37, ecBlocks: [{ ecLen: 26, dataLen: 108 }] },
  6: { size: 41, ecBlocks: [{ ecLen: 18, dataLen: 68 }] }, // 2 blocks
};

// ── Byte-mode encoder ─────────────────────────────────────
function encodeBytes(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) {
      bytes.push(code);
    } else {
      // UTF-8 encode
      if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
  }
  return bytes;
}

function pickVersion(byteLen) {
  // ECC level L capacities (byte mode)
  if (byteLen <= 17) return 1;
  if (byteLen <= 32) return 2;
  if (byteLen <= 53) return 3;
  if (byteLen <= 78) return 4;
  if (byteLen <= 106) return 5;
  return 6;
}

// ── Bit stream helpers ────────────────────────────────────
function BitStream() {
  const bits = [];
  return {
    push(val, len) {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    },
    padTo(target) {
      while (bits.length % 8 !== 0) bits.push(0);
      const pads = [0xec, 0x11];
      let pi = 0;
      while (bits.length < target * 8) {
        const p = pads[pi++ % 2];
        for (let i = 7; i >= 0; i--) bits.push((p >> i) & 1);
      }
    },
    toBytes() {
      const out = [];
      for (let i = 0; i < bits.length; i += 8) {
        let b = 0;
        for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] || 0);
        out.push(b);
      }
      return out;
    },
    get length() { return bits.length; },
  };
}

// ── Matrix helpers ────────────────────────────────────────
function makeMatrix(size) {
  return Array.from({ length: size }, () => new Int8Array(size).fill(-1));
}

function setRect(m, r, c, h, w, val) {
  for (let i = r; i < r + h; i++)
    for (let j = c; j < c + w; j++) m[i][j] = val;
}

function addFinder(m, r, c) {
  setRect(m, r, c, 7, 7, 1);
  setRect(m, r + 1, c + 1, 5, 5, 0);
  setRect(m, r + 2, c + 2, 3, 3, 1);
}

function addAlignment(m, r, c) {
  setRect(m, r - 2, c - 2, 5, 5, 1);
  setRect(m, r - 1, c - 1, 3, 3, 0);
  m[r][c] = 1;
}

const ALIGN_POS = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };

function buildMatrix(version, data) {
  const size = 17 + 4 * version;
  const m = makeMatrix(size);

  // Finder patterns + separators
  addFinder(m, 0, 0);
  addFinder(m, 0, size - 7);
  addFinder(m, size - 7, 0);
  // Separators
  for (let i = 0; i < 8; i++) {
    [m[7][i], m[i][7], m[7][size - 1 - i], m[i][size - 8]] = [0, 0, 0, 0];
    [m[size - 8][i], m[size - 1 - i][7]] = [0, 0];
  }
  // Format info area
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === -1) m[8][i] = 2;
    if (m[i][8] === -1) m[i][8] = 2;
    if (m[8][size - 1 - i] === -1) m[8][size - 1 - i] = 2;
    if (m[size - 1 - i][8] === -1) m[size - 1 - i][8] = 2;
  }
  // Dark module
  m[size - 8][8] = 1;

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (m[6][i] === -1) m[6][i] = i % 2 === 0 ? 1 : 0;
    if (m[i][6] === -1) m[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // Alignment patterns
  const ap = ALIGN_POS[version];
  if (ap.length) {
    for (const r of ap) for (const c of ap) {
      if (m[r][c] === -1) addAlignment(m, r, c);
    }
  }

  // Place data bits (zigzag)
  let di = 0;
  let up = true;
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5;
    for (let rowStep = 0; rowStep < size; rowStep++) {
      const row = up ? size - 1 - rowStep : rowStep;
      for (let dx = 0; dx < 2; dx++) {
        const c = col - dx;
        if (m[row][c] === -1) {
          m[row][c] = di < data.length * 8
            ? (data[Math.floor(di / 8)] >> (7 - di % 8)) & 1
            : 0;
          di++;
        }
      }
    }
    up = !up;
  }

  // Apply mask 0 (checkerboard) and mark format
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (m[r][c] <= 1 && (r + c) % 2 === 0) m[r][c] ^= 1;
    }
  }

  // Format string (ECC L, mask 0) = 0b111011111000100 = 0x77C4 → pre-computed
  const fmt = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  const fpos = [0, 1, 2, 3, 4, 5, 7, 8, size - 8, size - 7, size - 6, size - 5, size - 4, size - 3, size - 2, size - 1];
  for (let i = 0; i < 6; i++) { m[8][fpos[i]] = fmt[i]; m[fpos[i]][8] = fmt[i]; }
  m[8][7] = fmt[6]; m[7][8] = fmt[6];
  m[8][8] = fmt[7];
  for (let i = 8; i < 15; i++) { m[8][fpos[i]] = fmt[i]; m[fpos[i - 7]][8] = fmt[i]; }

  return m;
}

// ── Public API ────────────────────────────────────────────

/**
 * Generate a QR code as an SVG string.
 * @param {string} text  — content to encode
 * @param {object} opts  — { size: number (px), color: string, bg: string }
 * @returns {string}     — full <svg>…</svg> string
 */
export function generateQRSvg(text, opts = {}) {
  const { size = 200, color = '#000000', bg = '#ffffff' } = opts;

  const rawBytes = encodeBytes(text);
  const version = pickVersion(rawBytes.length);
  const { ecBlocks } = VERSIONS[version];
  const { ecLen, dataLen } = ecBlocks[0];

  const bs = BitStream();
  // Mode indicator: byte = 0100
  bs.push(0b0100, 4);
  // Character count
  bs.push(rawBytes.length, version < 10 ? 8 : 16);
  // Data
  for (const b of rawBytes) bs.push(b, 8);
  // Terminator
  bs.push(0, Math.min(4, dataLen * 8 - bs.length));
  bs.padTo(dataLen);

  const dataBytes = bs.toBytes();
  const ecBytes = rsEncode(dataBytes, ecLen);
  const allBytes = [...dataBytes, ...ecBytes];

  const matrix = buildMatrix(version, allBytes);
  const n = matrix.length;
  const cellSize = size / (n + 8); // 4-module quiet zone each side
  const offset = 4 * cellSize;

  let rects = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c] === 1 || (matrix[r][c] > 1 && matrix[r][c] % 2 === 1)) {
        const x = (offset + c * cellSize).toFixed(2);
        const y = (offset + r * cellSize).toFixed(2);
        const s = (cellSize + 0.5).toFixed(2); // slight overlap to avoid gaps
        rects += `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${color}"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${bg}"/>${rects}</svg>`;
}

/**
 * Convert an SVG string to a data URI for use in <img src="...">
 */
export function svgToDataUri(svgString) {
  const encoded = svgString
    .replace(/"/g, "'")
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/#/g, '%23')
    .replace(/\n/g, ' ');
  return `data:image/svg+xml,${encoded}`;
}

/**
 * Build the Tealium order-ready URL that the QR code encodes.
 * When scanned, the device's browser fires a GET request to Tealium Collect,
 * which records the order_ready event and triggers any configured notifications.
 */
export function buildOrderReadyUrl({ orderId, visitorId, email, account, profile, env, datasourceKey }) {
  const params = new URLSearchParams({
    tealium_account: account,
    tealium_profile: profile,
    tealium_env: env,
    tealium_datasource: datasourceKey,
    tealium_event: 'order_ready',
    order_id: orderId,
    tealium_visitor_id: visitorId,
    customer_email: email,
    user_id: email,
    order_status: 'ready_for_pickup',
    event_timestamp: new Date().toISOString(),
  });
  return `https://collect.tealiumiq.com/event?${params.toString()}`;
}
