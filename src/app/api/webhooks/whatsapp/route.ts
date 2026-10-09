import { NextResponse, after } from 'next/server';
import { verifyMetaSignature } from '@/lib/channels/meta';
import { processIncoming } from '@/lib/ai/pipeline';
import type { IncomingMessage } from '@/lib/ai/types';


export const maxDuration = 60;

/** Meta verifica la URL con un GET (hub.challenge). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('hub.mode') === 'subscribe' && searchParams.get('hub.verify_token') === process.env.META_VERIFY_TOKEN) {
    return new Response(searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'))) {
    return new Response('Invalid signature', { status: 401 });
  }
  const body = JSON.parse(raw);
  const jobs: IncomingMessage[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v?.messages) continue; // statuses (delivered/read) se ignoran acá
      const names: Record<string, string> = {};
      (v.contacts ?? []).forEach((c: any) => (names[c.wa_id] = c.profile?.name));
      for (const m of v.messages) {
        const text: string | undefined =
          m.type === 'text' ? m.text?.body :
          m.type === 'button' ? m.button?.text :
          m.type === 'interactive' ? (m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title) : undefined;
        jobs.push({
          channel: 'whatsapp',
          externalContactId: m.from,
          contactName: names[m.from] ?? null,
          text: text ?? `[${m.type}]`,
          externalMessageId: m.id,
          timestamp: new Date(Number(m.timestamp) * 1000),
          skipAI: !text,
        });
      }
    }
  }

  // Responder 200 YA (Meta reintenta si tardás) y procesar después
  after(async () => {
    for (const j of jobs) {
      try { await processIncoming(j); } catch (e) { console.error('[wa] error procesando', j.externalMessageId, e); }
    }
  });
  return NextResponse.json({ received: jobs.length });
}
