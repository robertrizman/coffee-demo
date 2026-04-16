/**
 * Printing Utility — Coffee Order App
 *
 * Routing:
 * - Brother QL-820NWB -> Brother SDK native silent print
 * - Brother MFC / generic printers -> existing silent IPP/9100 path
 */

import QRCode from 'qrcode';
import * as Print from 'expo-print';
import { loadShorthand, loadAutoCut } from './printerConfig';
import { resolvePrinterForCurrentNetwork } from './printerResolver';
import { toShorthandLines } from './shorthand';
import { BrotherPrinter, isBrotherPrinterAvailable } from './brotherPrinter';

async function buildQrSvg(url, width = 120) {
  try {
    return await QRCode.toString(url, { type: 'svg', width, margin: 1, color: { dark: '#000000', light: '#ffffff' } });
  } catch {
    return `<svg viewBox="0 0 ${width} ${width}"><rect width="${width}" height="${width}" fill="#eee"/></svg>`;
  }
}

function esc(v = '') {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTime(ts) {
  return new Date(ts || Date.now()).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function buildDrinkLine(item, useShorthand = false) {
  if (useShorthand) {
    const lines = toShorthandLines(item);
    return {
      title: lines[0] || '',
      detail: lines.slice(1).join(' · '),
      special: '',
    };
  }
  const details = [];
  if (item.milk && item.milk !== 'No Milk') details.push(item.milk);
  if (item.shots && item.shots > 1) details.push(`${item.shots} shots`);
  if (item.extras?.length) details.push(item.extras.join(', '));
  return {
    title: `${item.size || ''} ${item.name || ''}`.trim(),
    detail: details.join(' · '),
    special: item.specialRequest || '',
  };
}

export function buildQrDeepLink({ order }) {
  const params = new URLSearchParams({ order_id: order.id || '' });
  return `https://zdgmqmamohrybxwhgwby.supabase.co/functions/v1/order-complete?${params.toString()}`;
}

async function buildSingleLabelHtml(order, item, itemIndex, totalItems, visitorId, useShorthand = false) {
  const deepLink = buildQrDeepLink({ order, visitorId });
  const qrSvg = await buildQrSvg(deepLink, 120);

  const customerName = esc(order?.name || 'Guest');
  const placedTime = formatTime(order?.placedAt);
  const drink = buildDrinkLine(item, useShorthand);

  const shorthandLines = useShorthand ? toShorthandLines(item) : null;
  const drinkContent = useShorthand
    ? shorthandLines.map((line) => `<div class="sh-line">${esc(line)}</div>`).join('')
    : `
        <div class="item"><span class="item-text">${esc(drink.title)}</span></div>
        ${drink.detail ? `<div class="item-detail">${esc(drink.detail)}</div>` : ''}
        ${drink.special ? `<div class="special">"${esc(drink.special)}"</div>` : ''}
      `;

  return `
    <div class="page-break-wrap">
      <div class="page">
        <div class="label">
          <div class="header">
            <div class="order-id">${esc(order.id || '')}</div>
            <div class="order-right">
              ${order.station ? `<div class="station">${esc(order.station)}</div>` : ''}
              <div class="order-time">${placedTime}</div>
            </div>
          </div>
          <div class="body">
            <div class="body-left">
              <div class="customer-name">${customerName}</div>
              ${totalItems > 1 ? `<div class="items-label">Drink ${itemIndex + 1} of ${totalItems}</div>` : ''}
              ${drinkContent}
            </div>
            <div class="body-right">
              <div class="qr-wrap">${qrSvg}</div>
              <div class="scan">SCAN WHEN READY</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function buildLabelsHtml(order, visitorId = '', useShorthand = false) {
  const items = order?.items || [];
  const labelParts = await Promise.all(items.map((item, index) => buildSingleLabelHtml(order, item, index, items.length, visitorId, useShorthand)));
  const labelsHtml = labelParts.join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><style>
    @page { size: 48mm 39mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { width: 48mm; }
    .page-break-wrap { page-break-after: always; break-after: page; }
    .page-break-wrap:last-child { page-break-after: auto; break-after: auto; }
    .page { width: 48mm; padding: 1.5mm; }
    .label { width: 45mm; border: 0.4mm solid #1a7a7a; border-radius: 1.5mm; overflow: hidden; background: #fff; }
    .header { background: #1a7a7a; padding: 1.2mm 2mm; display: flex; justify-content: space-between; align-items: center; }
    .order-id { font-size: 3mm; font-weight: 700; color: #fff; }
    .order-right { text-align: right; }
    .station { font-size: 2.2mm; font-weight: 800; color: #fff; }
    .order-time { font-size: 2mm; color: rgba(255,255,255,0.88); text-align: right; }
    .body { padding: 1.5mm 2mm; display: flex; gap: 1.5mm; align-items: flex-start; }
    .body-left { flex: 1; min-width: 0; }
    .body-right { width: 13mm; text-align: right; flex-shrink: 0; }
    .customer-name { font-size: 3mm; font-weight: 800; color: #0d2b2b; line-height: 1; margin-bottom: 1mm; word-break: break-word; }
    .items-label { font-size: 1.8mm; font-weight: 700; color: #5a8888; text-transform: uppercase; margin-bottom: 1mm; }
    .item-text { font-size: 2.6mm; color: #0d2b2b; line-height: 1.25; word-break: break-word; }
    .item-detail { font-size: 2.2mm; color: #5a8888; line-height: 1.2; margin-bottom: 0.5mm; }
    .special { font-size: 2.1mm; color: #1a7a7a; font-style: italic; line-height: 1.2; margin-top: 0.3mm; }
    .sh-line { font-size: 3.2mm; font-weight: 800; color: #0d2b2b; line-height: 1.3; letter-spacing: 0.1mm; }
    .sh-line:first-child { font-size: 3.8mm; color: #1a7a7a; margin-bottom: 0.5mm; }
    .qr-wrap { width: 13mm; height: 13mm; margin-left: auto; padding: 1mm; background: #fff; border: 0.2mm solid #eee; }
    .qr-wrap svg { width: 100%; height: 100%; display: block; }
    .scan { margin-top: 0.8mm; font-size: 1.6mm; color: #8a8a8a; text-align: right; line-height: 1.2; }
  </style></head><body>${labelsHtml}</body></html>`;
}

export async function buildBrotherQLLabelsHtml(order, visitorId = '', useShorthand = false) {
  const items = order?.items || [];
  const parts = await Promise.all(items.map(async (item, index) => {
    const deepLink = buildQrDeepLink({ order, visitorId });
    const qrSvg = await buildQrSvg(deepLink, 180);
    const drink = buildDrinkLine(item, useShorthand);
    const shorthandLines = useShorthand ? toShorthandLines(item) : null;
    const drinkContent = useShorthand
      ? shorthandLines.map((line) => `<div class="sh-line">${esc(line)}</div>`).join('')
      : `<div class="drink-title">${esc(drink.title)}</div>${drink.detail ? `<div class="drink-detail">${esc(drink.detail)}</div>` : ''}${drink.special ? `<div class="special">${esc(drink.special)}</div>` : ''}`;
    return `
      <div class="sheet">
        <div class="label">
          <div class="top">
            <div class="logo-left">
              <img src="data:image/png;base64,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" alt="Tealium" class="logo" />
            </div>
            <div class="order-right">
              <div class="order-id">${esc(order.id || '')}${items.length > 1 ? ` (${index + 1}/${items.length})` : ''}</div>
              <div class="time">Order time: ${formatTime(order?.placedAt)}</div>
            </div>
          </div>
          <div class="middle">
            <div class="customer">${esc(order?.name || 'Guest')}</div>
            ${drinkContent}
          </div>
          <div class="bottom">
            <div class="qr">${qrSvg}</div>
          </div>
        </div>
      </div>`;
  }));

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
  @page { size: 38mm 46mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { width: 38mm; }
  .sheet { width: 38mm; height: 46mm; page-break-after: always; break-after: page; padding: 0; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .label { width: 38mm; height: 46mm; padding: 1.2mm; display: flex; flex-direction: column; }
  .top { background: #1a7a7a; color: #fff; border-radius: 1mm; padding: 1mm 1.5mm; display: flex; justify-content: space-between; align-items: center; }
  .logo-left { height: 5mm; display: flex; align-items: center; }
  .logo { height: 5mm; width: auto; }
  .order-right { text-align: right; }
  .order-id { font-size: 3.2mm; font-weight: 800; }
  .time { font-size: 1.8mm; margin-top: 0.3mm; }
  .middle { flex: 1; margin-top: 1mm; border: 0.3mm solid #1a7a7a; border-radius: 1mm; padding: 1.5mm; overflow: hidden; }
  .customer { font-size: 3.1mm; font-weight: 800; color: #0d2b2b; margin-bottom: 0.6mm; word-break: break-word; }
  .count { font-size: 1.9mm; font-weight: 700; color: #5a8888; text-transform: uppercase; margin-bottom: 0.8mm; }
  .drink-title { font-size: 2.8mm; font-weight: 700; color: #0d2b2b; line-height: 1.2; }
  .drink-detail { font-size: 2.2mm; color: #5a8888; line-height: 1.2; margin-top: 0.5mm; }
  .special { font-size: 2mm; color: #1a7a7a; font-style: italic; line-height: 1.15; margin-top: 0.5mm; }
  .sh-line { font-size: 3.2mm; font-weight: 800; color: #0d2b2b; line-height: 1.25; }
  .sh-line:first-child { font-size: 3.9mm; color: #1a7a7a; margin-bottom: 0.4mm; }
  .bottom { margin-top: 1mm; display: flex; justify-content: center; }
  .qr { width: 17mm; height: 17mm; border: 0.2mm solid #ddd; padding: 0.5mm; background: #fff; }
  .qr svg { width: 100%; height: 100%; display: block; }
  </style></head><body>${parts.join('')}</body></html>`;
}

async function printBrotherQL(printer, order, visitorId, useShorthand, autoCutEnabled) {
  const html = await buildBrotherQLLabelsHtml(order, visitorId, useShorthand);

  if (isBrotherPrinterAvailable()) {
    const pdf = await Print.printToFileAsync({ html, width: 108, height: 130, base64: false });

    const connectionType = printer.connectionType || 'wifi'; // 'wifi' | 'bluetooth'

    if (connectionType === 'bluetooth' && printer.bluetoothAddress) {
      console.log('[Printer] Using Bluetooth:', printer.bluetoothAddress);
      await BrotherPrinter.printQLPdfBluetooth(printer.bluetoothAddress, pdf.uri, !!autoCutEnabled);
      return true;
    }

    if (connectionType === 'wifi' && printer.ip) {
      console.log('[Printer] Using WiFi:', printer.ip);
      await BrotherPrinter.printQLPdf(printer.ip, pdf.uri, !!autoCutEnabled);
      return true;
    }

    throw new Error(`No ${connectionType} printer configured. Please set up a printer in Settings.`);
  }

  // iOS fallback — IPP over WiFi
  console.log('[Printer] BrotherPrinter SDK not available, falling back to IPP');
  const success = await printToIPSilent(printer, html);
  if (success) return true;

  throw new Error('BrotherPrinter native module is not available and IPP fallback failed');
}

export async function printOrderReceipt(order, visitorId = '', options = {}) {
  const { silent = false, scanIfNeeded = false } = options;
  const useShorthand = await loadShorthand();
  const autoCutEnabled = await loadAutoCut();
  const { printer } = await resolvePrinterForCurrentNetwork({ scanIfNeeded });

  if (printer) {
    try {
      // Brother QL handles both Bluetooth and WiFi internally
      if (printer.printer_type === 'brother_ql') {
        await printBrotherQL(printer, order, visitorId, useShorthand, autoCutEnabled);
        return { ok: true, printer, fallback: false, route: 'brother_sdk' };
      }

      // WiFi-only path for generic/MFC printers
      if (printer.ip) {
        const html = await buildLabelsHtml(order, visitorId, useShorthand);
        const success = await printToIPSilent(printer, html);
        if (success) return { ok: true, printer, fallback: false, route: 'legacy' };
      }
    } catch (err) {
      console.warn('[Printer] Native/legacy silent print failed:', err.message);
    }
  }

  if (silent) {
    console.warn('[AutoPrint] No reachable printer available — skipping dialog');
    return { ok: false, printer: null, fallback: false };
  }

  const html = await buildLabelsHtml(order, visitorId, useShorthand);
  await Print.printAsync({ html });
  return { ok: true, printer: null, fallback: true };
}

export async function printToIPSilent(printer, html) {
  try {
    const port = printer.port || 631;
    const model = printer.model?.toLowerCase() || '';
    const printerUrl = model.includes('ql-')
      ? `ipp://${printer.ip}:${port}/ipp/print`
      : model.includes('mfc-')
      ? `ipp://${printer.ip}:${port}/ipp/print`
      : `ipp://${printer.ip}:${port}/ipp/port1`;
    console.log('[Print] IPP URL:', printerUrl);
    await Print.printAsync({ html, printerUrl });
    return true;
  } catch (err) {
    console.error('[Print] printToIPSilent error:', err.message);
    return false;
  }
}

export function buildQrDebugHtml() {
  const testLink = buildQrDeepLink({ order: { id: '#1234' }, visitorId: 'test-visitor-id' });
  return `<!doctype html><html><head><meta charset="utf-8" /><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script></head><body><div id="test_qr"></div><script>new QRCode(document.getElementById('test_qr'), { text: '${testLink.replace(/'/g, "\'")}', width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });<\/script></body></html>`;
}