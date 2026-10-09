'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Settings2, Trash2, Plus } from 'lucide-react';

type Tab = 'accessories' | 'trade_in_ranges' | 'ai_faqs';
const tabs: { key: Tab; label: string }[] = [
  { key: 'accessories', label: 'Accesorios (cross-sell)' },
  { key: 'trade_in_ranges', label: 'Cotización de usados' },
  { key: 'ai_faqs', label: 'Preguntas frecuentes' },
];

export default function IaConfigPage() {
  const [tab, setTab] = useState<Tab>('accessories');
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from(tab).select('*').order(tab === 'ai_faqs' ? 'question' : tab === 'accessories' ? 'name' : 'model');
    if (error) setError(error.message); else { setError(null); setRows(data || []); }
  };
  useEffect(() => { setForm({}); load(); /* eslint-disable-next-line */ }, [tab]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, any> = { ...form };
    if (tab === 'accessories') payload.compatible_models = String(form.compatible_models || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (tab === 'ai_faqs') payload.keywords = String(form.keywords || '').split(',').map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase.from(tab).insert(payload);
    if (error) return setError(error.message);
    setForm({}); load();
  };
  const remove = async (id: string) => { await supabase.from(tab).delete().eq('id', id); load(); };
  const f = (k: string, p: string, type = 'text', cls = '') => (
    <input className={`erp-input ${cls}`} type={type} step="0.01" placeholder={p} value={form[k] ?? ''} required={['name', 'model', 'question', 'answer'].includes(k)}
      onChange={(e) => setForm({ ...form, [k]: type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value })} />
  );

  return (
    <div className="space-y-5 pb-10 text-slate-100">
      <div className="flex items-center gap-3 pb-4 border-b border-white/5">
        <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center"><Settings2 className="w-4 h-4 text-slate-300" /></div>
        <div><h1 className="text-xl font-bold text-white">Configuración IA Comercial</h1><p className="text-xs text-slate-500">Lo que la IA usa para cotizar, recomendar y responder</p></div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={tab === t.key ? 'btn-primary' : 'btn-secondary'}>{t.label}</button>)}
      </div>
      {error && <div className="erp-card border-rose-500/30 p-3 text-sm text-rose-300">{error}</div>}

      <form onSubmit={save} className="erp-card p-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        {tab === 'accessories' && (<>
          <div className="col-span-2">{f('name', 'Vidrio templado iPhone 13')}</div>
          <select className="erp-select" value={form.category ?? ''} required onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">Categoría</option>{['funda', 'cargador', 'vidrio', 'cable', 'auricular', 'otro'].map((c) => <option key={c}>{c}</option>)}
          </select>
          {f('compatible_models', 'iPhone 13, iPhone 13 Pro (vacío = todos)')}
          {f('price_usd', 'Precio USD', 'number')}{f('stock', 'Stock', 'number')}
        </>)}
        {tab === 'trade_in_ranges' && (<>
          {f('model', 'iPhone 13')}{f('capacity', '128GB')}{f('min_usd', 'Mín USD', 'number')}{f('max_usd', 'Máx USD', 'number')}{f('min_battery', 'Batería mín %', 'number')}{f('battery_penalty_usd', 'Descuento USD', 'number')}
        </>)}
        {tab === 'ai_faqs' && (<>
          <div className="col-span-2">{f('question', 'Pregunta')}</div><div className="col-span-2">{f('answer', 'Respuesta')}</div>{f('keywords', 'palabras, clave')}
        </>)}
        <button className="btn-primary justify-center"><Plus className="w-4 h-4" />Agregar</button>
      </form>

      <div className="erp-card overflow-x-auto">
        <table className="erp-table">
          <thead className="erp-thead"><tr>
            {tab === 'accessories' && <><th className="erp-th">Nombre</th><th className="erp-th">Cat.</th><th className="erp-th">Compatible</th><th className="erp-th">USD</th><th className="erp-th">Stock</th></>}
            {tab === 'trade_in_ranges' && <><th className="erp-th">Modelo</th><th className="erp-th">Cap.</th><th className="erp-th">Rango USD</th><th className="erp-th">Batería mín</th></>}
            {tab === 'ai_faqs' && <><th className="erp-th">Pregunta</th><th className="erp-th">Respuesta</th></>}
            <th className="erp-th" />
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td className="erp-td text-center text-slate-500" colSpan={6}>Sin datos</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="erp-tr">
                {tab === 'accessories' && <><td className="erp-td text-white">{r.name}</td><td className="erp-td">{r.category}</td><td className="erp-td text-xs text-slate-400">{r.compatible_models?.join(', ') || 'Universal'}</td><td className="erp-td font-mono">${r.price_usd}</td><td className="erp-td">{r.stock}</td></>}
                {tab === 'trade_in_ranges' && <><td className="erp-td text-white">{r.model}</td><td className="erp-td">{r.capacity}</td><td className="erp-td font-mono">${r.min_usd} – ${r.max_usd}</td><td className="erp-td">{r.min_battery}% (−${r.battery_penalty_usd})</td></>}
                {tab === 'ai_faqs' && <><td className="erp-td text-white">{r.question}</td><td className="erp-td text-xs text-slate-400">{r.answer}</td></>}
                <td className="erp-td text-right"><button onClick={() => remove(r.id)} className="btn-ghost"><Trash2 className="w-4 h-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
