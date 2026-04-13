import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;

async function sendBroadcast(supabase: any, broadcast: any): Promise<number> {
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('push_token, platform');

  if (!tokens?.length) {
    await supabase.from('push_broadcasts')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', broadcast.id);
    return 0;
  }

  const messages = tokens.map((t: any) => ({
    to: t.push_token,
    title: broadcast.title,
    body: broadcast.message,
    sound: 'default',
    priority: 'high',
    data: { type: 'broadcast', broadcast_id: broadcast.id },
  }));

  let sent = 0;
  const batchSize = 100;
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    const result = await res.json();
    const data = Array.isArray(result.data) ? result.data : [result.data];
    sent += data.filter((d: any) => d?.status === 'ok').length;
  }

  await supabase.from('push_broadcasts')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', broadcast.id);

  console.log(`[Broadcast] Sent ${sent}/${tokens.length} for broadcast ${broadcast.id}`);
  return sent;
}

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Cron job: check for due scheduled broadcasts ──────────────
    if (body.check_scheduled) {
      const now = new Date();
      const twoMinsAgo = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
      const nowIso = now.toISOString();

      const { data: due } = await supabase
        .from('push_broadcasts')
        .select('*')
        .eq('status', 'scheduled')
        .gte('scheduled_at', twoMinsAgo)  // not too old
        .lte('scheduled_at', nowIso);     // due now or past

      if (!due?.length) {
        return new Response(JSON.stringify({ checked: true, found: 0 }), { status: 200 });
      }

      let totalSent = 0;
      for (const broadcast of due) {
        totalSent += await sendBroadcast(supabase, broadcast);
      }
      return new Response(JSON.stringify({ checked: true, found: due.length, sent: totalSent }), { status: 200 });
    }

    // ── Manual send by broadcast_id ───────────────────────────────
    const { broadcast_id } = body;
    if (!broadcast_id) {
      return new Response(JSON.stringify({ error: 'broadcast_id required' }), { status: 400 });
    }

    const { data: broadcast, error } = await supabase
      .from('push_broadcasts')
      .select('*')
      .eq('id', broadcast_id)
      .single();

    if (error || !broadcast) {
      return new Response(JSON.stringify({ error: 'Broadcast not found' }), { status: 404 });
    }
    if (broadcast.status === 'sent' || broadcast.status === 'cancelled') {
      return new Response(JSON.stringify({ error: 'Already processed' }), { status: 400 });
    }

    const sent = await sendBroadcast(supabase, broadcast);
    return new Response(JSON.stringify({ sent, total: sent }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (e) {
    console.error('[Broadcast] Error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
