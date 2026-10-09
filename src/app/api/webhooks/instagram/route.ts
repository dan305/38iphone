import { NextResponse, after } from 'next/server';
import { verifyMetaSignature } from '@/lib/channels/meta';
import { processIncoming } from '@/lib/ai/pipeline';
import type { IncomingMessage } from '@/lib/ai/types';


export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('hub.mode') === 'subscribe' && searchParams.get('hub.verify_token') === process.env.META_VERIFY_TOKEN) {
    return new Response(searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), [process.env.INSTAGRAM_APP_SECRET, process.env.META_APP_SECRET])) {
    return new Response('Invalid signature', { status: 401 });
  }
  const body = JSON.parse(raw);
  const jobs: IncomingMessage[] = [];

  for (const entry of body.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      const msg = ev.message;
      if (!msg || msg.is_echo) continue;            // ecos de lo que enviamos nosotros
      if (ev.sender?.id === entry.id) continue;     // mensaje propio de la cuenta
      jobs.push({
        channel: 'instagram',
        externalContactId: ev.sender.id,
        text: msg.text ?? `[${msg.attachments?.[0]?.type ?? 'adjunto'}]`,
        externalMessageId: msg.mid,
        timestamp: new Date(ev.timestamp),
        skipAI: !msg.text,
      });
    }
  }

  after(async () => {
    for (const j of jobs) {
      try { await processIncoming(j); } catch (e) { console.error('[ig] error procesando', j.externalMessageId, e); }
    }
  });
  return NextResponse.json({ received: jobs.length });
}
