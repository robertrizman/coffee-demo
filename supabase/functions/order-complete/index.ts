import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;
const TEALIUM_ACCOUNT = 'success-robert-rizman';
const TEALIUM_PROFILE = 'coffee-demo';
const TEALIUM_DATASOURCE = '945h52';

serve(async (req) => {
  const url = new URL(req.url);
  const orderId = url.searchParams.get('order_id');

  if (!orderId) {
    return new Response('Missing order_id', { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Get order
  const { data: order, error: fetchError } = await supabase
    .from('orders').select('*').eq('id', orderId).single();

  if (fetchError || !order) {
    return new Response('Order not found', { status: 404 });
  }

  const customerName = order.name || 'Guest';
  const customerEmail = order.email || '';
  const station = order.station || '';
  const deviceId = (order.teal_app_uuid || order.device_id || '').toLowerCase();

  console.log('[EdgeFn] order_id:', orderId, 'deviceId:', deviceId, 'teal_app_uuid:', order.teal_app_uuid);

  const alreadyDone = order.status === 'complete';

  // Check if order was JUST completed (within last 5 seconds) - handles race condition
  const justCompleted = alreadyDone && order.fulfilled_at && (Date.now() - order.fulfilled_at) < 5000;

  // Only skip if order was completed MORE than 5 seconds ago (likely a re-scan)
  const shouldSkip = alreadyDone && !justCompleted;

  // Mark order complete and send push notification
  if (!shouldSkip) {
    const fulfilledAt = Date.now();
    await supabase.from('orders')
      .update({ status: 'complete', fulfilled_at: fulfilledAt })
      .eq('id', orderId);

    // Build drink summary
    const items = order.items || [];
    const drinkSummary = items.map((item: any) => {
      return [item.category, item.milk && item.milk !== 'No Milk' ? item.milk : null, item.name, item.size]
        .filter(Boolean).map((p: string) => p.replace(/\s+/g, '_')).join('_');
    }).join(',');

    // Tealium event
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
          platform: 'qr_scan',
        }),
      });
      const body = await tealRes.text();
      console.log('[EdgeFn] Tealium collect status:', tealRes.status, body);
    } catch (e) {
      console.error('[EdgeFn] Tealium collect error:', e.message);
    }

    // Send push notification (ONLY on first completion)
    if (deviceId) {
      const { data: tokenRow } = await supabase
        .from('push_tokens').select('push_token').eq('device_id', deviceId).single();

      if (tokenRow?.push_token) {
        console.log('[EdgeFn] Sending push to:', tokenRow.push_token);

        try {
          const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: tokenRow.push_token,
              title: '☕ Your order is ready!',
              body: `Hey ${customerName}! Order ${orderId} is ready. Head over to ${station || 'the coffee cart'} and enjoy! ☕`,
              data: { order_id: orderId, station },
              sound: 'default',
              priority: 'high',
            }),
          });

          const pushResult = await pushRes.json();
          console.log('[EdgeFn] Push sent:', JSON.stringify(pushResult));
        } catch (e) {
          console.error('[EdgeFn] Push error:', e.message);
        }
      } else {
        console.log('[EdgeFn] No push token found for device_id:', deviceId);
      }
    }
  } else {
    console.log('[EdgeFn] Order completed more than 5s ago, skipping push notification');
  }

  const message = shouldSkip
    ? `Order ${orderId} was already scanned by the Barista, thanks for trying!`
    : `Order ${orderId} is now ready! Push notification sent to ${customerName}.`;

  return new Response(message, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  });
});
