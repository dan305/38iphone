import crypto from 'crypto';

/** Verifica la firma X-Hub-Signature-256 que Meta manda en cada webhook. */
export function verifyMetaSignature(rawBody: string, header: string | null, secrets: (string | undefined)[] = [process.env.META_APP_SECRET]): boolean {
  if (!header) return false;
  return secrets.filter(Boolean).some((secret) => {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret as string).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(header);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

const GRAPH = 'https://graph.facebook.com/v21.0';

export interface SendResult { ok: boolean; externalId?: string; error?: string }

/** WhatsApp Cloud API — texto libre (solo dentro de la ventana de 24 hs). */
export async function sendWhatsApp(to: string, text: string): Promise<SendResult> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token) return { ok: false, error: 'Faltan WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN' };
  const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: false } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
  return { ok: true, externalId: json?.messages?.[0]?.id };
}

/** Instagram Messaging API (Instagram Login / Page token). */
export async function sendInstagram(recipientIgsid: string, text: string): Promise<SendResult> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igId = process.env.INSTAGRAM_ACCOUNT_ID || 'me';
  if (!token) return { ok: false, error: 'Falta INSTAGRAM_ACCESS_TOKEN' };
  // Con "Instagram Login" el host es graph.instagram.com. Si usás Facebook Login (token de Página), poné INSTAGRAM_API_HOST=https://graph.facebook.com
  const host = process.env.INSTAGRAM_API_HOST || 'https://graph.instagram.com';
  const res = await fetch(`${host}/v21.0/${igId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientIgsid }, message: { text } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
  return { ok: true, externalId: json?.message_id };
}

export async function sendChannelMessage(channel: 'whatsapp' | 'instagram', to: string, text: string) {
  return channel === 'whatsapp' ? sendWhatsApp(to, text) : sendInstagram(to, text);
}
