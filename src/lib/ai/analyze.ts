import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { quoteTradeIn } from './tradein';
import type { Analysis } from './types';

interface ChatTurn { sender: 'customer' | 'ai' | 'agent'; body: string }

const clamp = (n: number, a = 0, b = 100) => Math.max(a, Math.min(b, Math.round(n)));

/** Score determinista a partir de lo que se detectó. Se mezcla con el del LLM. */
export function heuristicScore(a: Pick<Analysis, 'intent' | 'interested_model' | 'budget_usd' | 'has_trade_in' | 'signals'>, text: string): number {
  let s = 10;
  if (a.intent === 'comprar') s += 30;
  if (a.intent === 'plan_canje') s += 25;
  if (a.intent === 'consulta_precio') s += 15;
  if (a.interested_model) s += 15;
  if (a.budget_usd) s += 10;
  if (a.has_trade_in) s += 10;
  const t = text.toLowerCase();
  if (/(reserv|seña|senia|retiro|paso hoy|hoy mismo|ahora|cuando puedo ir|donde est[aá]n|direcci[oó]n|mercado ?pago|transferencia)/.test(t)) s += 20;
  if (/(disponible|stock|colores?|en cuotas|financi)/.test(t)) s += 8;
  if (/(solo (miro|consulto)|despu[eé]s veo|m[aá]s adelante|caro)/.test(t)) s -= 15;
  return clamp(s);
}

async function loadContext(interestedModel?: string | null) {
  const [{ data: stock }, { data: faqs }, { data: settings }] = await Promise.all([
    supabaseAdmin.from('devices').select('suggested_price_usd, condition, battery_health, products(model, capacity, color)').ilike('status', 'disponible').limit(200),
    supabaseAdmin.from('ai_faqs').select('question, answer').eq('active', true),
    supabaseAdmin.from('ai_settings').select('*').eq('id', 1).single(),
  ]);
  // Agrupar stock por modelo+capacidad
  const groups: Record<string, { qty: number; min: number; max: number; cond: Set<string> }> = {};
  (stock || []).forEach((d: any) => {
    const k = `${d.products?.model} ${d.products?.capacity || ''}`.trim();
    const p = Number(d.suggested_price_usd || 0);
    if (!groups[k]) groups[k] = { qty: 0, min: p, max: p, cond: new Set() };
    groups[k].qty++; groups[k].min = Math.min(groups[k].min, p); groups[k].max = Math.max(groups[k].max, p);
    if (d.condition) groups[k].cond.add(d.condition);
  });
  const stockText = Object.entries(groups)
    .map(([k, g]) => `- ${k}: ${g.qty} u. USD ${g.min}${g.max !== g.min ? `-${g.max}` : ''} (${[...g.cond].join('/')})`)
    .join('\n') || 'Sin stock cargado.';
  return {
    stockText,
    faqText: (faqs || []).map((f: any) => `P: ${f.question}\nR: ${f.answer}`).join('\n\n'),
    settings: settings as any,
    stockGroups: groups,
  };
}

const SYSTEM = (ctx: Awaited<ReturnType<typeof loadContext>>) => `Sos el asistente comercial de ${ctx.settings?.business_name || '38iPhone'}, un local que vende iPhones nuevos y usados y recibe usados en Plan Canje.
Tono: ${ctx.settings?.tone}. Mensajes cortos (máx 4 líneas), WhatsApp/Instagram, 0-1 emoji. Hablás de "vos".

STOCK REAL (únicas fuentes de precio y disponibilidad, en USD):
${ctx.stockText}

PREGUNTAS FRECUENTES:
${ctx.faqText}

REGLAS ESTRICTAS:
1. NUNCA inventes precios, modelos ni stock. Si no está en STOCK REAL, decí que lo consultás y poné needs_human=true.
2. Cotización de usados: SOLO usá el bloque COTIZACION_USADO si te lo paso. Siempre como rango estimado sujeto a revisión del equipo. Si no te lo paso, pedí modelo, capacidad y % de batería.
3. Si el cliente reclama, pide descuento especial, habla de garantía/reparación puntual, reclama un pago o el tema es delicado: needs_human=true.
4. Guiá al cliente al siguiente paso (visitar el local, reservar, pasar datos del usado). Hacé UNA pregunta como máximo.
5. Respondé SOLO un JSON válido con esta forma exacta:
{"intent":"comprar|consulta_precio|plan_canje|soporte|saludo|otro","lead_score":0-100,"signals":["..."],"interested_model":string|null,"interested_capacity":string|null,"budget_usd":number|null,"has_trade_in":boolean,"trade_in_model":string|null,"trade_in_battery":number|null,"needs_human":boolean,"reply":"texto a enviar","reasoning":"1 línea"}
lead_score: 0-20 curioseo, 21-40 interés vago, 41-69 interés concreto (modelo/precio), 70-100 listo para comprar (reserva, visita, medio de pago, cierra precio).`;

export async function analyzeConversation(history: ChatTurn[], lastText: string): Promise<{ analysis: Analysis; ctx: Awaited<ReturnType<typeof loadContext>> }> {
  const ctx = await loadContext();
  const apiKey = process.env.OPENAI_API_KEY;

  // ── Fallback sin API key: respuesta segura y score heurístico
  if (!apiKey) {
    const base: Analysis = {
      intent: /canje|permut|entrego|usado/i.test(lastText) ? 'plan_canje' : /precio|cu[aá]nto|sale|vale/i.test(lastText) ? 'consulta_precio' : 'otro',
      lead_score: 0, signals: ['sin OPENAI_API_KEY: análisis básico'],
      interested_model: /iphone\s*\d{1,2}(\s*(pro max|pro|plus|mini))?/i.exec(lastText)?.[0] ?? null,
      interested_capacity: /\b(64|128|256|512)\s*gb\b/i.exec(lastText)?.[0]?.toUpperCase().replace(/\s/g, '') ?? null,
      budget_usd: null, has_trade_in: /canje|permut|entrego|mi iphone|tengo un/i.test(lastText),
      trade_in_model: null, trade_in_battery: null, needs_human: true,
      reply: '¡Hola! Gracias por escribirnos. En un momento te responde alguien del equipo 🙌',
      reasoning: 'Fallback sin IA',
    };
    base.lead_score = heuristicScore(base, lastText);
    return { analysis: base, ctx };
  }

  // Pre-cálculo de cotización si el cliente ya mencionó su usado (2 pasos: extraer y luego responder)
  const extract = await callLLM(apiKey, SYSTEM(ctx), history, lastText, null);
  let quoteBlock: string | null = null;
  if (extract.has_trade_in && extract.trade_in_model) {
    const q = await quoteTradeIn(extract.trade_in_model, extract.interested_capacity, extract.trade_in_battery);
    if (q) {
      quoteBlock = `COTIZACION_USADO: ${q.model}${q.capacity ? ' ' + q.capacity : ''} → USD ${q.min_usd} a ${q.max_usd}. ${q.note}`;
    }
  }
  const final = quoteBlock ? await callLLM(apiKey, SYSTEM(ctx), history, lastText, quoteBlock) : extract;

  // Mezcla LLM (60%) + heurística (40%) para un score más estable
  const h = heuristicScore(final, lastText);
  final.lead_score = clamp(0.6 * clamp(final.lead_score) + 0.4 * h);
  return { analysis: final, ctx };
}

async function callLLM(apiKey: string, system: string, history: ChatTurn[], lastText: string, extra: string | null): Promise<Analysis> {
  const msgs = [
    { role: 'system', content: system + (extra ? `\n\n${extra}` : '') },
    ...history.slice(-12).map((m) => ({ role: m.sender === 'customer' ? 'user' : 'assistant', content: m.body })),
  ];
  // El último mensaje del cliente ya está en history; si no, lo agregamos
  if (!history.length || history[history.length - 1].body !== lastText) msgs.push({ role: 'user', content: lastText });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      messages: msgs,
      temperature: 0.4,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const p = JSON.parse(data.choices[0].message.content);
  return {
    intent: p.intent ?? 'otro',
    lead_score: Number(p.lead_score) || 0,
    signals: Array.isArray(p.signals) ? p.signals : [],
    interested_model: p.interested_model ?? null,
    interested_capacity: p.interested_capacity ?? null,
    budget_usd: p.budget_usd != null ? Number(p.budget_usd) : null,
    has_trade_in: !!p.has_trade_in,
    trade_in_model: p.trade_in_model ?? null,
    trade_in_battery: p.trade_in_battery != null ? Number(p.trade_in_battery) : null,
    needs_human: !!p.needs_human,
    reply: String(p.reply || '').trim(),
    reasoning: String(p.reasoning || ''),
  };
}
