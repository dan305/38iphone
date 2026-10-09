'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Flame, MessageCircle, Instagram, Send, Sparkles, Zap, Bot, UserCheck, ArrowLeftRight,
  DollarSign, Inbox, X, ShoppingBag, TrendingUp, Settings2,
} from 'lucide-react';
import Link from 'next/link';

type Temp = 'frio' | 'tibio' | 'caliente';
interface Conversation {
  id: string; channel: 'whatsapp' | 'instagram'; external_id: string; contact_name: string | null; contact_handle: string | null;
  mode: 'inherit' | 'autonomous' | 'copilot' | 'human'; status: string;
  lead_score: number; lead_temp: Temp; intent: string | null;
  interested_model: string | null; interested_capacity: string | null; budget_usd: number | null;
  has_trade_in: boolean; trade_in_model: string | null; trade_in_battery: number | null;
  est_sale_usd: number; ai_summary: string | null;
  last_message_at: string; last_message_preview: string | null; last_customer_message_at: string | null; unread_count: number;
}
interface Message { id: string; conversation_id: string; direction: 'in' | 'out'; sender: 'customer' | 'ai' | 'agent'; body: string; delivery_status: string; error: string | null; created_at: string }
interface Recommendation { type: 'accessory' | 'upgrade'; name: string; price_usd: number; reason: string }
interface Suggestion { id: string; conversation_id: string; reply: string; reasoning: string | null; recommendations: Recommendation[]; status: string; created_at: string }
interface Settings { default_mode: 'autonomous' | 'copilot' | 'off' }

const tempStyle: Record<Temp, string> = {
  caliente: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  tibio: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  frio: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
};
const tempLabel: Record<Temp, string> = { caliente: '🔥 Caliente', tibio: 'Tibio', frio: 'Frío' };
const intentLabel: Record<string, string> = {
  comprar: 'Quiere comprar', consulta_precio: 'Consulta precio', plan_canje: 'Plan Canje', soporte: 'Soporte', saludo: 'Saludo', otro: 'Otro',
};
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const timeAgo = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h`;
  return `${Math.floor(m / 1440)} d`;
};
const displayName = (c: Conversation) => c.contact_name || c.contact_handle || c.external_id;

function ChannelIcon({ ch, className = 'w-3.5 h-3.5' }: { ch: string; className?: string }) {
  return ch === 'instagram' ? <Instagram className={`${className} text-pink-400`} /> : <MessageCircle className={`${className} text-emerald-400`} />;
}

export default function ConversacionesPage() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [settings, setSettings] = useState<Settings>({ default_mode: 'copilot' });
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState<'todas' | 'caliente' | 'sin_leer'>('todas');
  const selectedRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  selectedRef.current = selectedId;

  const selected = useMemo(() => convs.find((c) => c.id === selectedId) ?? null, [convs, selectedId]);
  const pending = useMemo(() => suggestions.find((s) => s.status === 'pending') ?? null, [suggestions]);
  const lastRecs = useMemo(() => suggestions.find((s) => s.recommendations?.length)?.recommendations ?? [], [suggestions]);

  // ── carga inicial
  useEffect(() => {
    (async () => {
      const [{ data: c, error: e1 }, { data: s }] = await Promise.all([
        supabase.from('conversations').select('*').neq('status', 'archived').order('last_message_at', { ascending: false }).limit(200),
        supabase.from('ai_settings').select('default_mode').eq('id', 1).maybeSingle(),
      ]);
      if (e1) setError(`${e1.message}. ¿Ejecutaste la migración 001_ai_commercial.sql?`);
      setConvs((c as Conversation[]) || []);
      if (s) setSettings(s as Settings);
      setLoading(false);
    })();
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const [{ data: m }, { data: s }] = await Promise.all([
      supabase.from('messages').select('*').eq('conversation_id', id).order('created_at'),
      supabase.from('ai_suggestions').select('*').eq('conversation_id', id).order('created_at', { ascending: false }).limit(10),
    ]);
    setMessages((m as Message[]) || []);
    setSuggestions((s as Suggestion[]) || []);
  }, []);

  // ── Supabase Realtime
  useEffect(() => {
    const ch = supabase
      .channel('ia-comercial-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (p) => {
        if (p.eventType === 'DELETE') return setConvs((prev) => prev.filter((c) => c.id !== (p.old as any).id));
        const row = p.new as Conversation;
        setConvs((prev) => {
          const i = prev.findIndex((c) => c.id === row.id);
          const next = i >= 0 ? prev.map((c) => (c.id === row.id ? row : c)) : [row, ...prev];
          return next.sort((a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at));
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        const m = p.new as Message;
        if (m.conversation_id === selectedRef.current) setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_suggestions' }, (p) => {
        const r = (p.new as Suggestion) || (p.old as Suggestion);
        if (r?.conversation_id === selectedRef.current) loadThread(r.conversation_id);
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => { supabase.removeChannel(ch); };
  }, [loadThread]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const selectConv = async (id: string) => {
    setSelectedId(id); setDraft(''); setError(null);
    await loadThread(id);
    await supabase.from('conversations').update({ unread_count: 0 }).eq('id', id);
  };

  // ── KPIs del día (calculados sobre el estado en vivo)
  const kpi = useMemo(() => {
    const open = convs.filter((c) => c.status === 'open');
    const startDay = new Date(); startDay.setHours(0, 0, 0, 0);
    return {
      hot: open.filter((c) => c.lead_temp === 'caliente').length,
      tradeIns: open.filter((c) => c.has_trade_in && new Date(c.last_message_at) >= startDay).length,
      est: open.filter((c) => c.lead_temp !== 'frio').reduce((a, c) => a + Number(c.est_sale_usd || 0), 0),
      unread: open.reduce((a, c) => a + c.unread_count, 0),
      today: convs.filter((c) => new Date(c.last_message_at) >= startDay).length,
    };
  }, [convs]);

  const hotBoard = useMemo(
    () => convs.filter((c) => c.status === 'open' && c.lead_temp === 'caliente').sort((a, b) => b.lead_score - a.lead_score).slice(0, 6),
    [convs]
  );
  const list = useMemo(
    () => convs.filter((c) => (filter === 'caliente' ? c.lead_temp === 'caliente' : filter === 'sin_leer' ? c.unread_count > 0 : true)),
    [convs, filter]
  );

  // ── Acciones
  const send = async (text: string, suggestionId?: string) => {
    if (!selected || !text.trim() || sending) return;
    setSending(true); setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch(`/api/conversations/${selected.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token}` },
        body: JSON.stringify({ text, suggestionId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
      setDraft('');
      await loadThread(selected.id);
    } catch (e: any) {
      setError(e.message);
    } finally { setSending(false); }
  };

  const discard = async (s: Suggestion) => { await supabase.from('ai_suggestions').update({ status: 'discarded' }).eq('id', s.id); loadThread(s.conversation_id); };
  const setGlobalMode = async (mode: Settings['default_mode']) => { setSettings({ default_mode: mode }); await supabase.from('ai_settings').update({ default_mode: mode, updated_at: new Date().toISOString() }).eq('id', 1); };
  const setConvMode = async (mode: Conversation['mode']) => { if (selected) await supabase.from('conversations').update({ mode }).eq('id', selected.id); };
  const closeConv = async (status: 'won' | 'lost') => { if (selected) { await supabase.from('conversations').update({ status }).eq('id', selected.id); setSelectedId(null); } };

  const addRec = (r: Recommendation) =>
    setDraft((d) => `${d}${d ? '\n' : ''}${r.type === 'upgrade' ? `También te puedo mostrar el ${r.name} a USD ${r.price_usd}.` : `Te sumo ${r.name} a USD ${r.price_usd}, ${r.reason.toLowerCase()}.`}`);

  const windowOpen = selected?.last_customer_message_at ? Date.now() - new Date(selected.last_customer_message_at).getTime() < 24 * 3600 * 1000 : false;

  return (
    <div className="space-y-4 pb-6 text-slate-100">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center"><Sparkles className="w-4 h-4 text-purple-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-white">Conversaciones IA</h1>
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              {live ? 'En vivo · WhatsApp + Instagram' : 'Conectando…'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white/5 border border-white/10 rounded-xl p-0.5 text-xs">
            {([['autonomous', 'Autónomo', Bot], ['copilot', 'Copiloto', UserCheck], ['off', 'Apagado', X]] as const).map(([m, label, Icon]) => (
              <button key={m} onClick={() => setGlobalMode(m)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${settings.default_mode === m ? 'bg-purple-500/20 text-purple-300 font-semibold' : 'text-slate-400 hover:text-white'}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
          <Link href="/ia-config" className="btn-secondary !px-3 !py-2" title="Accesorios, cotizaciones y FAQs"><Settings2 className="w-4 h-4" /></Link>
        </div>
      </div>

      {error && <div className="erp-card border-rose-500/30 p-3 text-sm text-rose-300 flex justify-between"><span>{error}</span><button onClick={() => setError(null)}><X className="w-4 h-4" /></button></div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { l: 'Leads calientes', v: kpi.hot, i: Flame, c: 'text-rose-400' },
          { l: 'Oportunidades Plan Canje', v: kpi.tradeIns, i: ArrowLeftRight, c: 'text-purple-400' },
          { l: 'Ventas estimadas', v: money(kpi.est), i: DollarSign, c: 'text-emerald-400' },
          { l: 'Chats hoy', v: kpi.today, i: TrendingUp, c: 'text-sky-400' },
          { l: 'Sin leer', v: kpi.unread, i: Inbox, c: 'text-amber-400' },
        ].map((k) => (
          <div key={k.l} className="erp-card p-4">
            <div className="flex items-center justify-between"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{k.l}</span><k.i className={`w-4 h-4 ${k.c}`} /></div>
            <div className="text-2xl font-bold text-white font-mono mt-1">{k.v}</div>
          </div>
        ))}
      </div>

      {/* Tablero de leads calientes */}
      <div className="erp-card p-4">
        <div className="flex items-center gap-2 mb-3"><Flame className="w-4 h-4 text-rose-400" /><h2 className="text-sm font-semibold text-white">Atender primero</h2></div>
        {hotBoard.length === 0 ? (
          <p className="text-xs text-slate-500">Todavía no hay leads calientes. Cuando alguien esté a punto de comprar, aparece acá en vivo.</p>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {hotBoard.map((c) => (
              <button key={c.id} onClick={() => selectConv(c.id)} className="text-left p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 hover:bg-rose-500/10 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-white truncate"><ChannelIcon ch={c.channel} />{displayName(c)}</span>
                  <span className="text-xs font-mono font-bold text-rose-400">{c.lead_score}</span>
                </div>
                <div className="text-xs text-slate-400 mt-1 truncate">{c.interested_model ? `${c.interested_model} ${c.interested_capacity || ''}` : intentLabel[c.intent || 'otro']}{c.has_trade_in ? ' · Canje' : ''}</div>
                <div className="text-[10px] text-slate-500 mt-1">{timeAgo(c.last_message_at)}{c.unread_count > 0 && <span className="ml-2 text-amber-400 font-bold">{c.unread_count} nuevo(s)</span>}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Inbox + Chat + Contexto */}
      <div className="grid lg:grid-cols-[300px_1fr_300px] gap-4 min-h-[560px]">
        {/* Lista */}
        <div className="erp-card flex flex-col overflow-hidden max-h-[680px]">
          <div className="flex gap-1 p-2 border-b border-white/5 text-[11px]">
            {([['todas', 'Todas'], ['caliente', '🔥 Calientes'], ['sin_leer', 'Sin leer']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`px-2.5 py-1 rounded-lg ${filter === k ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}>{l}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? <p className="p-4 text-xs text-slate-500">Cargando…</p> : list.length === 0 ? (
              <p className="p-4 text-xs text-slate-500">Sin conversaciones. Configurá los webhooks de Meta para empezar a recibir mensajes.</p>
            ) : list.map((c) => (
              <button key={c.id} onClick={() => selectConv(c.id)}
                className={`w-full text-left px-3 py-3 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${selectedId === c.id ? 'bg-purple-500/10' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-white truncate"><ChannelIcon ch={c.channel} />{displayName(c)}</span>
                  <span className="text-[10px] text-slate-500 shrink-0">{timeAgo(c.last_message_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-xs text-slate-500 truncate">{c.last_message_preview}</span>
                  {c.unread_count > 0 && <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-purple-500 text-[10px] font-bold text-white flex items-center justify-center">{c.unread_count}</span>}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tempStyle[c.lead_temp]}`}>{tempLabel[c.lead_temp]} {c.lead_score}</span>
                  {c.has_trade_in && <span className="badge-blue">Canje</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className="erp-card flex flex-col overflow-hidden max-h-[680px]">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-sm gap-2 p-8"><MessageCircle className="w-8 h-8 opacity-40" />Elegí una conversación</div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white truncate"><ChannelIcon ch={selected.channel} />{displayName(selected)}</div>
                  <div className="text-[11px] text-slate-500">{selected.contact_handle}{!windowOpen && ' · ⚠️ ventana de 24 hs cerrada'}</div>
                </div>
                <select value={selected.mode} onChange={(e) => setConvMode(e.target.value as Conversation['mode'])} className="bg-[#0b0b0e] border border-white/10 rounded-lg text-xs px-2 py-1.5 text-slate-300">
                  <option value="inherit">IA: según global</option><option value="autonomous">IA: autónoma</option><option value="copilot">IA: copiloto</option><option value="human">Solo humano</option>
                </select>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${m.direction === 'out' ? (m.sender === 'ai' ? 'bg-purple-500/20 border border-purple-500/30' : 'bg-emerald-500/15 border border-emerald-500/25') : 'bg-white/5 border border-white/10'}`}>
                      {m.body}
                      <div className="text-[10px] text-slate-500 mt-1 flex gap-2">
                        {m.direction === 'out' && <span>{m.sender === 'ai' ? '🤖 IA' : '👤 Equipo'}</span>}
                        <span>{new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                        {m.delivery_status === 'failed' && <span className="text-rose-400" title={m.error || ''}>no enviado</span>}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Sugerencia del copiloto */}
              {pending && (
                <div className="mx-3 mb-2 p-3 rounded-xl bg-purple-500/10 border border-purple-500/30">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-purple-300 uppercase tracking-wider"><Sparkles className="w-3.5 h-3.5" />Respuesta sugerida</span>
                    <button onClick={() => discard(pending)} className="text-slate-500 hover:text-white" title="Descartar"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  <p className="text-sm text-slate-100 whitespace-pre-wrap">{pending.reply}</p>
                  {pending.reasoning && <p className="text-[11px] text-slate-500 mt-1.5">{pending.reasoning}</p>}
                  <div className="flex gap-2 mt-2">
                    <button disabled={sending || !windowOpen} onClick={() => send(pending.reply, pending.id)} className="btn-primary !py-1.5 !px-3 !text-xs disabled:opacity-50"><Zap className="w-3.5 h-3.5" />Enviar</button>
                    <button onClick={() => setDraft(pending.reply)} className="btn-secondary !py-1.5 !px-3 !text-xs">Editar</button>
                  </div>
                </div>
              )}

              <div className="p-3 border-t border-white/5 flex gap-2 items-end">
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Escribí una respuesta…"
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(draft, pending?.id); }}
                  className="erp-input resize-none flex-1" />
                <button disabled={sending || !draft.trim() || !windowOpen} onClick={() => send(draft, pending?.id)} className="btn-primary h-[42px] disabled:opacity-50"><Send className="w-4 h-4" /></button>
              </div>
            </>
          )}
        </div>

        {/* Contexto del lead */}
        <div className="erp-card p-4 space-y-4 overflow-y-auto max-h-[680px]">
          {!selected ? <p className="text-xs text-slate-500">El análisis del lead aparece acá.</p> : (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Lead score</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tempStyle[selected.lead_temp]}`}>{tempLabel[selected.lead_temp]}</span></div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden"><div className={`h-full rounded-full ${selected.lead_temp === 'caliente' ? 'bg-rose-500' : selected.lead_temp === 'tibio' ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${selected.lead_score}%` }} /></div>
                <div className="text-right text-xs font-mono text-slate-400 mt-1">{selected.lead_score}/100</div>
              </div>
              <dl className="text-xs space-y-2">
                {[
                  ['Intención', intentLabel[selected.intent || 'otro']],
                  ['Modelo de interés', selected.interested_model ? `${selected.interested_model} ${selected.interested_capacity || ''}` : '—'],
                  ['Presupuesto', selected.budget_usd ? money(selected.budget_usd) : '—'],
                  ['Entrega usado', selected.has_trade_in ? `${selected.trade_in_model || 'Sí'}${selected.trade_in_battery ? ` · ${selected.trade_in_battery}%` : ''}` : 'No'],
                  ['Venta estimada', selected.est_sale_usd ? money(selected.est_sale_usd) : '—'],
                ].map(([k, v]) => (<div key={k} className="flex justify-between gap-2"><dt className="text-slate-500">{k}</dt><dd className="text-slate-200 text-right">{v}</dd></div>))}
              </dl>
              {selected.ai_summary && <p className="text-[11px] text-slate-400 bg-white/[0.03] rounded-lg p-2">💡 {selected.ai_summary}</p>}

              <div>
                <div className="flex items-center gap-1.5 mb-2"><ShoppingBag className="w-3.5 h-3.5 text-purple-400" /><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Para ofrecerle</span></div>
                {lastRecs.length === 0 ? <p className="text-xs text-slate-600">Sin recomendaciones todavía.</p> : (
                  <div className="space-y-1.5">
                    {lastRecs.map((r, i) => (
                      <button key={i} onClick={() => addRec(r)} className="w-full text-left p-2 rounded-lg bg-white/[0.03] border border-white/5 hover:border-purple-500/30 transition-colors">
                        <div className="flex justify-between gap-2 text-xs"><span className="text-white font-medium">{r.type === 'upgrade' ? '⬆️ ' : '➕ '}{r.name}</span><span className="font-mono text-slate-300">{money(r.price_usd)}</span></div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{r.reason} · clic para agregar al mensaje</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2 border-t border-white/5">
                <button onClick={() => closeConv('won')} className="flex-1 btn-secondary !justify-center !text-xs !text-emerald-400">Venta cerrada</button>
                <button onClick={() => closeConv('lost')} className="flex-1 btn-secondary !justify-center !text-xs">Perdido</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
