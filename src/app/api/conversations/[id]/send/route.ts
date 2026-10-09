import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendChannelMessage } from '@/lib/channels/meta';



/**
 * Envía un mensaje al cliente (lo llama el ERP con un clic).
 * Body: { text: string, suggestionId?: string }
 * Auth: Authorization: Bearer <access_token de Supabase del usuario logueado>
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { data: u } = await supabaseAdmin.auth.getUser(token);
  if (!u?.user) return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });

  const { text, suggestionId } = await req.json();
  const body = String(text || '').trim();
  if (!body) return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 });

  const { data: conv } = await supabaseAdmin.from('conversations').select('*').eq('id', id).single();
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });

  // Ventana de 24 hs de Meta: fuera de ella solo se pueden mandar plantillas aprobadas
  const last = conv.last_customer_message_at ? new Date(conv.last_customer_message_at).getTime() : 0;
  if (Date.now() - last > 24 * 3600 * 1000) {
    return NextResponse.json({ error: 'Pasaron más de 24 hs desde el último mensaje del cliente. Meta solo permite plantillas aprobadas fuera de esa ventana.' }, { status: 409 });
  }

  const sent = await sendChannelMessage(conv.channel, conv.external_id, body);
  await supabaseAdmin.from('messages').insert({
    conversation_id: id, direction: 'out', sender: 'agent', body,
    external_id: sent.externalId ?? null,
    delivery_status: sent.ok ? 'sent' : 'failed', error: sent.error ?? null,
  });

  if (suggestionId) {
    const { data: s } = await supabaseAdmin.from('ai_suggestions').select('reply').eq('id', suggestionId).single();
    await supabaseAdmin.from('ai_suggestions')
      .update({ status: s && s.reply.trim() === body ? 'sent' : 'edited_sent' }).eq('id', suggestionId);
  }
  // Al intervenir un humano, el resto de sugerencias pendientes quedan obsoletas
  await supabaseAdmin.from('ai_suggestions').update({ status: 'discarded' }).eq('conversation_id', id).eq('status', 'pending');

  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
