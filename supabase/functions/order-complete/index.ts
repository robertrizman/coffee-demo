import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;
const TEALIUM_ACCOUNT = 'success-robert-rizman';
const TEALIUM_PROFILE = 'coffee-demo';
const TEALIUM_DATASOURCE = '945h52';


serve(async (req) => {
  const url = new URL(req.url);
  const orderId  = url.searchParams.get('order_id');
  const source   = url.searchParams.get('source') || '';

  if (!orderId) {
    return new Response(errorPage('Invalid QR code.'), { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: order, error: fetchError } = await supabase
    .from('orders').select('*').eq('id', orderId).single();

  if (fetchError || !order) {
    return new Response(errorPage('Order not found.'), { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 404 });
  }

  // All sensitive data comes from DB, not URL
  const customerName  = order.name || 'Guest';
  const customerEmail = order.email || '';
  const station       = order.station || '';
  const deviceId      = (order.teal_app_uuid || order.device_id || '').toLowerCase();
  console.log('[EdgeFn] order_id:', orderId, 'deviceId:', deviceId, 'teal_app_uuid:', order.teal_app_uuid);

  // Detect customer browser scan vs barista in-app
  const userAgent = req.headers.get('user-agent') || '';
  const isBrowserScan = userAgent.includes('Mozilla');
  const isBaristaScan = source === 'barista' || source === 'barista_manual' || !isBrowserScan;

  // Customer scanned with phone camera — show waiting page
  if (isBrowserScan && !isBaristaScan) {
    const deepLink = `com.robrizzy.coffeedemo://order-status?order_id=${encodeURIComponent(orderId)}`;
    return new Response(customerWaitPage(customerName, orderId, station, deepLink), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const alreadyDone = order.status === 'complete';

  if (!alreadyDone) {
    const fulfilledAt = Date.now();
    await supabase.from('orders')
      .update({ status: 'complete', fulfilled_at: fulfilledAt })
      .eq('id', orderId);

    // Build drink summary from order items
    const items = order.items || [];
    const drinkSummary = items.map((item: any) => {
      return [item.category, item.milk && item.milk !== 'No Milk' ? item.milk : null, item.name, item.size]
        .filter(Boolean).map((p: string) => p.replace(/\s+/g, '_')).join('_');
    }).join(',');

    // Tealium event against customer profile
    const customerVisitorId = deviceId
      ? `__${TEALIUM_ACCOUNT}_${TEALIUM_PROFILE}__5120_${deviceId.toLowerCase()}__`
      : '';

    try {
      const tealRes = await fetch('https://collect.tealiumiq.com/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tealium_account: TEALIUM_ACCOUNT,
          tealium_profile: TEALIUM_PROFILE,
          tealium_datasource: TEALIUM_DATASOURCE,
          tealium_event: 'order_ready',
          tealium_visitor_id: customerVisitorId,
          customer_uuid: deviceId,
          customer_name: customerName,
          order_id: orderId,
          drink_summary: drinkSummary,
          station,
          platform: source || 'qr_scan',
        }),
      });
      const body = await tealRes.text();
      console.log('[EdgeFn] Tealium collect status:', tealRes.status, body);
    } catch (e) {
      console.error('[EdgeFn] Tealium collect error:', e.message);
    }
  }

  // Push notification — always send for barista calls
  if (deviceId) {
    const { data: tokenRow } = await supabase
      .from('push_tokens').select('push_token').eq('device_id', deviceId).single();

    if (tokenRow?.push_token) {
      console.log('[EdgeFn] Sending push to:', tokenRow.push_token);
      fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: tokenRow.push_token,
          title: '☕ Your order is ready!',
          body: `Hey ${customerName}! Your barista has finished your order. Head over to ${station || 'the coffee cart'} and enjoy! ☕`,
          data: { order_id: orderId, station },
          sound: 'default',
          priority: 'high',
        }),
      }).catch(() => {});
    }
  }

  return new Response(readyPage(customerName, order.items, station, alreadyDone), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

function customerWaitPage(name: string, orderId: string, station: string, deepLink: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="refresh" content="1;url=${deepLink}"/>
  <title>Order Status</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#051838;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:20px;padding:40px 32px;max-width:400px;width:100%;text-align:center}
    .icon{width:72px;height:72px;background:#006D80;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:36px}
    h1{font-size:24px;color:#051838;margin-bottom:8px}
    .subtitle{color:#4a7a85;font-size:15px;margin-bottom:28px;line-height:1.5}
    .order-id{display:inline-block;background:#e8f6f8;color:#006D80;font-weight:700;font-size:16px;padding:8px 20px;border-radius:100px;border:2px solid #b3dde3;margin-bottom:24px}
    .btn{display:block;background:#006D80;color:#fff;font-weight:700;font-size:16px;padding:14px 24px;border-radius:100px;text-decoration:none;margin-bottom:12px}
    .hint{font-size:12px;color:#8ab0b8;margin-top:16px}
    .brand{margin-top:24px;font-size:10px;color:#8ab0b8;letter-spacing:1px;text-transform:uppercase}
  </style>
  <script>
    function tryRedirect() { window.location.href = '${deepLink}'; }
    setTimeout(tryRedirect, 500);
    document.addEventListener('DOMContentLoaded', function() { setTimeout(tryRedirect, 300); });
  </script>
</head>
<body>
  <div class="card">
    <div class="icon">&#9749;</div>
    <h1>Hi ${esc(name)}!</h1>
    <p class="subtitle">Your order is being prepared. We'll notify you when it's ready for pickup.</p>
    <div class="order-id">${esc(orderId)}</div>
    ${station ? `<p class="subtitle">&#128205; Pickup from <strong>${esc(station)}</strong></p>` : ''}
    <a href="${deepLink}" class="btn">&#128241; Open in App</a>
    <p class="hint">Your barista will notify you when it's ready.</p>
    <p class="brand">Powered by Tealium PRISM</p>
  </div>
</body>
</html>`;
}


function readyPage(name: string, items: any[], station: string, alreadyDone: boolean) {
  const itemList = (items || []).map((item: any) => {
    const details = [item.size, item.milk !== 'No Milk' ? item.milk : null].filter(Boolean).join(' · ');
    return `<li><strong>${esc(item.name)}</strong>${details ? ` <span>${esc(details)}</span>` : ''}</li>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Order Ready</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#051838;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:20px;padding:40px 32px;max-width:400px;width:100%;text-align:center}
    .tick{width:72px;height:72px;background:#006D80;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:36px}
    h1{font-size:26px;color:#051838;margin-bottom:8px}
    .subtitle{color:#4a7a85;font-size:15px;margin-bottom:28px}
    .station{display:inline-block;background:#e8f6f8;color:#006D80;font-weight:700;font-size:18px;padding:10px 24px;border-radius:100px;border:2px solid #b3dde3;margin-bottom:28px}
    .items{text-align:left;background:#f5fbfc;border-radius:12px;padding:16px 20px;border:1px solid #d6eff2}
    .items ul{list-style:none}
    .items li{padding:8px 0;border-bottom:1px solid #e8f0f2;font-size:15px;color:#051838}
    .items li:last-child{border-bottom:none}
    .items li span{color:#4a7a85;font-size:13px;display:block}
    .already{color:#8ab0b8;font-size:13px;margin-bottom:8px}
    .brand{margin-top:28px;font-size:10px;color:#8ab0b8;letter-spacing:1px;text-transform:uppercase}
  </style>
</head>
<body>
  <div class="card">
    <div class="tick">☕</div>
    ${alreadyDone ? '<p class="already">Already collected</p>' : ''}
    <h1>Hi ${esc(name)}!</h1>
    <p class="subtitle">Your order is ready${alreadyDone ? '' : ' 🎉'}</p>
    ${station ? `<div class="station">📍 ${esc(station)}</div>` : ''}
    ${itemList ? `<div class="items"><ul>${itemList}</ul></div>` : ''}
    <p class="brand">Powered by Tealium PRISM</p>
  </div>
</body>
</html>`;
}

function errorPage(msg: string) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>body{font-family:sans-serif;background:#051838;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{background:#fff;border-radius:16px;padding:32px;text-align:center;max-width:360px}h2{color:#c0392b;margin-bottom:8px}p{color:#666}</style>
</head><body><div class="card"><h2>⚠️ Oops</h2><p>${msg}</p></div></body></html>`;
}

function esc(s: string) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
