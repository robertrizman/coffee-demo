// Generates pleasant notification sounds as 16-bit mono WAV files.
// Run with: node scripts/generate-sounds.js
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const OUT_DIR = path.join(__dirname, '../assets/sounds');

function writeWAV(filename, samples) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);   // PCM
  buf.writeUInt16LE(1, 22);   // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filename, buf);
  console.log(`Wrote ${filename} (${samples.length} samples, ${(dataSize / 1024).toFixed(1)} KB)`);
}

function sine(freq, t) {
  return Math.sin(2 * Math.PI * freq * t);
}

// Smooth attack/decay envelope
function envelope(t, attack, decay) {
  if (t < attack) return t / attack;
  return Math.exp(-((t - attack) / decay));
}

// Bell-like tone: fundamental + 2nd harmonic at lower amplitude
function bell(freq, t, amp = 1) {
  return amp * (
    0.8 * sine(freq, t) +
    0.15 * sine(freq * 2, t) +
    0.05 * sine(freq * 3, t)
  );
}

// SUCCESS: two ascending notes — A5 (880Hz) then D6 (1174Hz)
// Soft attack, gentle bell decay — like a soft chime notification
function generateSuccess() {
  const duration = 0.55;
  const n = Math.round(SAMPLE_RATE * duration);
  const samples = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;

    // Note 1: 880Hz, starts at 0, peaks at 10ms, decays
    if (t < 0.28) {
      const env = envelope(t, 0.01, 0.09);
      v += 0.55 * bell(880, t) * env;
    }

    // Note 2: 1174Hz, starts at 0.18s, overlaps briefly then rings out
    if (t >= 0.18) {
      const nt = t - 0.18;
      const env = envelope(nt, 0.01, 0.12);
      v += 0.55 * bell(1174.66, nt) * env;
    }

    samples[i] = v;
  }
  return samples;
}

// ERROR: gentle descending pair — E5 (659Hz) then C5 (523Hz)
// Warmer, softer — not alarming, just a quiet notice
function generateError() {
  const duration = 0.5;
  const n = Math.round(SAMPLE_RATE * duration);
  const samples = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;

    // Note 1: 659Hz (E5)
    if (t < 0.26) {
      const env = envelope(t, 0.01, 0.09);
      v += 0.45 * bell(659.25, t) * env;
    }

    // Note 2: 523Hz (C5), slightly lower, resolves down
    if (t >= 0.16) {
      const nt = t - 0.16;
      const env = envelope(nt, 0.01, 0.12);
      v += 0.45 * bell(523.25, nt) * env;
    }

    samples[i] = v;
  }
  return samples;
}

writeWAV(path.join(OUT_DIR, 'scan_success.wav'), generateSuccess());
writeWAV(path.join(OUT_DIR, 'scan_error.wav'), generateError());
