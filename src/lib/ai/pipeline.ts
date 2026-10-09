import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendChannelMessage } from '@/lib/channels/meta';
import { analyzeConversation } from './analyze';
import { buildRecommendations } from './recommend';
import type { IncomingMessage, LeadTemp } from './types';

const WINDOW_MS = 24 * 60 * 60 * 1000; // ventana de respuesta libre de Meta

const tempFor = (score: number, hot: number, warm: number): LeadTemp => (score >= hot ? 'caliente' : score >= warm ? 'tibio' : 'frio');

/** Busca un cliente del ERP por teléfono (últimos 8 dígitos) para enlazar la conversación. */
async function findCustomer(phone?: string | null) {
  const digits = (phone || '').replace(/\D/g, '').slice(-8);
  if (digits.length < 8) return null;
  const { data } = await supabaseAdmin.from('customers').select('id').ilike('phone', `%${digits}%`).limit(1);
  return data?.[0]?.id ?? null;
}

/**
 * Flujo completo de un mensaje entrante:
 * guardar → analizar → scoring → (autónomo: responder | copiloto: sugerir)
 */
export async function processIncoming(msg: IncomingMessage) {
  // 1) Conversación (upsert)
  let { data: conv } = await supabaseAdmin
    .from('conversations').select('*').eq('channel', msg.channel).eq('external_id', msg.externalContactId).maybeSingle();

  if (!conv) {
    const customerId = msg.channel === 'whatsapp' ? await findCustomer(msg.externalContactId) : null;
    const { data, error } = await supabaseAdmin.from('conversations').insert({
      channel: msg.channel, external_id: msg.externalContactId,
      contact_name: msg.contactName ?? null,
      contact_handle: msg.handle ?? (msg.channel === 'whatsapp' ? `+${msg.externalContactId}` : null),
      customer_id: customerId,
    }).select('*').single();
    if (error) throw error;
    conv = data;
  } else if (msg.contactName && !conv.contact_name) {
    await supabaseAdmin.from('conversations').update({ contact_name: msg.contactName }).eq('id', conv.id);
  }

  // 2) Guardar mensaje (idempotente: Meta reintenta webhooks)
  const { data: saved, error: msgErr } = await supabaseAdmin.from('messages').insert({
    conversation_id: conv!.id, direction: 'in', sender: 'customer', body: msg.text,
    external_id: msg.externalMessageId,
    ...(msg.timestamp ? { created_at: msg.timestamp.toISOString() } : {}),
  }).select('id').single();
  if (msgErr) {
    if (msgErr.code === '23505') return { skipped: 'duplicate' };
    throw msgErr;
  }

  if (msg.skipAI) return { ok: true, skipped: 'non-text' };

  // 3) Modo efectivo
  const { data: settings } = await supabaseAdmin.from('ai_settings').select('*').eq('id', 1).single();
  const effective = conv!.mode === 'inherit' ? settings?.default_mode ?? 'copilot' : conv!.mode === 'human' ? 'off' : conv!.mode;

  // 4) Análisis (siempre, también en modo humano: el scoring sigue vivo)
  const { data: hist } = await supabaseAdmin
    .from('messages').select('sender, body').eq('conversation_id', conv!.id).order('created_at', { ascending: false }).limit(14);
  const history = (hist || []).reverse() as { sender: 'customer' | 'ai' | 'agent'; body: string }[];

  const { analysis: a, ctx } = await analyzeConversation(history, msg.text);
  const temp = tempFor(a.lead_score, settings?.hot_threshold ?? 70, settings?.warm_threshold ?? 40);

  // 5) Recomendaciones deterministas (accesorios / upgrade)
  const recs = await buildRecommendations({
    interestedModel: a.interested_model ?? conv!.interested_model,
    currentModel: a.trade_in_model ?? conv!.trade_in_model,
    budgetUsd: a.budget_usd ?? conv!.budget_usd,
  });

  // 6) Venta estimada = precio más bajo en stock del modelo de interés
  const model = a.interested_model ?? conv!.interested_model;
  let est = Number(conv!.est_sale_usd || 0);
  if (model) {
    const hit = Object.entries(ctx.stockGroups).find(([k]) => k.toLowerCase().startsWith(model.toLowerCase()));
    if (hit) est = hit[1].min;
  }

  await supabaseAdmin.from('conversations').update({
    lead_score: a.lead_score, lead_temp: temp, intent: a.intent,
    interested_model: model, interested_capacity: a.interested_capacity ?? conv!.interested_capacity,
    budget_usd: a.budget_usd ?? conv!.budget_usd,
    has_trade_in: a.has_trade_in || conv!.has_trade_in,
    trade_in_model: a.trade_in_model ?? conv!.trade_in_model,
    trade_in_battery: a.trade_in_battery ?? conv!.trade_in_battery,
    est_sale_usd: est, ai_summary: a.reasoning,
  }).eq('id', conv!.id);

  await supabaseAdmin.from('lead_events').insert({
    conversation_id: conv!.id, score: a.lead_score, temp, intent: a.intent, signals: a.signals,
  });

  if (effective === 'off' || !a.reply) return { ok: true, mode: 'off' };

  // 7) Autónomo vs Copiloto
  const insideWindow = Date.now() - new Date(msg.timestamp ?? Date.now()).getTime() < WINDOW_MS;
  if (effective === 'autonomous' && !a.needs_human && insideWindow) {
    const sent = await sendChannelMessage(msg.channel, msg.externalContactId, a.reply);
    await supabaseAdmin.from('messages').insert({
      conversation_id: conv!.id, direction: 'out', sender: 'ai', body: a.reply,
      external_id: sent.externalId ?? null,
      delivery_status: sent.ok ? 'sent' : 'failed', error: sent.error ?? null,
    });
    if (recs.length) {
      await supabaseAdmin.from('ai_suggestions').insert({
        conversation_id: conv!.id, message_id: saved.id, reply: '(Recomendaciones para seguir la venta)',
        reasoning: a.reasoning, recommendations: recs, status: 'sent',
      });
    }
    return { ok: true, mode: 'autonomous', sent: sent.ok };
  }

  // Copiloto (o autónomo que necesita humano): sugerencia pendiente en pantalla
  await supabaseAdmin.from('ai_suggestions').insert({
    conversation_id: conv!.id, message_id: saved.id, reply: a.reply,
    reasoning: (a.needs_human ? '⚠️ Requiere atención humana. ' : '') + a.reasoning,
    recommendations: recs, status: 'pending',
  });
  return { ok: true, mode: 'copilot' };
}
