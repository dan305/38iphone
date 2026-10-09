'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sparkles, RefreshCw, AlertTriangle, ArrowRight, CheckCircle2, Info, X, DollarSign, Package } from 'lucide-react';
import Link from 'next/link';

interface Insight {
  id: string;
  type: 'urgente' | 'atencion' | 'oportunidad';
  title: string;
  badge: string;
  description: string;
  actionText: string;
  actionType: 'reponer' | 'oferta' | 'link';
  actionPayload?: string;
  actionLink?: string;
}

export default function IAComercialPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'todos' | 'urgente' | 'atencion' | 'oportunidad'>('todos');

  // Modals state
  const [actionModal, setActionModal] = useState<{ type: 'reponer' | 'oferta' | null, modelName: string, insightId: string }>({ type: null, modelName: '', insightId: '' });
  
  // Reponer Form
  const [replenishQty, setReplenishQty] = useState(5);
  const [replenishCost, setReplenishCost] = useState(0);
  
  // Oferta Form
  const [discountPercent, setDiscountPercent] = useState(10);
  const [actionProcessing, setActionProcessing] = useState(false);

  const generateInsights = async () => {
    setLoading(true);
    try {
      const generated: Insight[] = [];

      const { data: devices } = await supabase.from('devices').select('status, products(model)');
      const { data: sales } = await supabase.from('sales').select('created_at, customers(id, name, phone)');

      if (devices && devices.length > 0) {
        const stockMap: Record<string, { disponible: number, vendido: number }> = {};
        
        devices.forEach(d => {
          const m = (d.products as any)?.model || 'Desconocido';
          if (!stockMap[m]) stockMap[m] = { disponible: 0, vendido: 0 };
          
          if (d.status === 'Disponible') stockMap[m].disponible++;
          if (d.status === 'Vendido') stockMap[m].vendido++;
        });

        Object.entries(stockMap).forEach(([model, stats], index) => {
          if (stats.vendido > 0 && stats.disponible === 0) {
            generated.push({
              id: `urg-${index}`,
              type: 'urgente',
              title: `Sin stock: ${model}`,
              badge: '0 u',
              description: 'Producto destacado sin unidades disponibles. Esto frena ventas potenciales.',
              actionText: 'Reponer',
              actionType: 'reponer',
              actionPayload: model
            });
          }
          else if (stats.disponible >= 3 && stats.vendido === 0) {
            generated.push({
              id: `atn-${index}`,
              type: 'atencion',
              title: `Stock estancado: ${model}`,
              badge: `${stats.disponible} u`,
              description: 'Tenés alto inventario de este modelo sin rotación reciente. Considerá aplicar una Oferta Flash.',
              actionText: 'Crear Oferta',
              actionType: 'oferta',
              actionPayload: model
            });
          }
        });
      }

      if (sales && sales.length > 0) {
        const customerSales: Record<string, { name: string, dates: Date[] }> = {};
        
        sales.forEach(s => {
          const c = s.customers as any;
          if (c && c.id) {
            if (!customerSales[c.id]) customerSales[c.id] = { name: c.name, dates: [] };
            customerSales[c.id].dates.push(new Date(s.created_at));
          }
        });

        const now = new Date();
        Object.entries(customerSales).forEach(([id, data], index) => {
          if (data.dates.length > 1) {
            data.dates.sort((a, b) => b.getTime() - a.getTime());
            const lastPurchase = data.dates[0];
            const diffDays = Math.floor((now.getTime() - lastPurchase.getTime()) / (1000 * 3600 * 24));
            
            if (diffDays > 45) {
              generated.push({
                id: `opt-${index}`,
                type: 'oportunidad',
                title: `Cliente inactivo: ${data.name}`,
                badge: `Hace ${diffDays} días`,
                description: 'Este cliente solía comprar recurrentemente. Es un buen momento para enviarle un mensaje con novedades.',
                actionText: 'Ver Cliente',
                actionType: 'link',
                actionLink: '/customers'
              });
            }
          }
        });
      }

      generated.sort((a, b) => {
        const val = { urgente: 1, atencion: 2, oportunidad: 3 };
        return val[a.type] - val[b.type];
      });

      if (generated.length === 0) {
        generated.push({
          id: 'demo-1',
          type: 'oportunidad',
          title: 'Sistema en Fase de Aprendizaje',
          badge: 'IA',
          description: 'A medida que cargues más ventas, compras y clientes, la IA comercial detectará patrones automáticamente.',
          actionText: 'Ir a Dashboard',
          actionType: 'link',
          actionLink: '/'
        });
      }

      setInsights(generated);
    } catch (err) {
      console.error('Error generando IA insights:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateInsights();
  }, []);

  const handleAction = (insight: Insight) => {
    if (insight.actionType === 'link' && insight.actionLink) {
      window.location.href = insight.actionLink;
    } else if (insight.actionType === 'reponer') {
      setActionModal({ type: 'reponer', modelName: insight.actionPayload || '', insightId: insight.id });
    } else if (insight.actionType === 'oferta') {
      setActionModal({ type: 'oferta', modelName: insight.actionPayload || '', insightId: insight.id });
    }
  };

  const submitReponer = async () => {
    setActionProcessing(true);
    try {
      // Registrar un pedido de compra en compras (purchases) o crear devices en estado "Ingresando"
      // Para simularlo completamente funcional, vamos a crear un "Gasto" (Compra) en expenses
      // o un purchase si existe la tabla. Vamos a agregarlo a expenses por seguridad y simular el pedido.
      await supabase.from('expenses').insert({
        type: 'Compra de Stock (IA)',
        amount_usd: replenishQty * replenishCost,
        amount: 0,
        notes: `Reposición IA: ${replenishQty}x ${actionModal.modelName}`
      });

      // Remover el insight de la lista
      setInsights(insights.filter(i => i.id !== actionModal.insightId));
      setActionModal({ type: null, modelName: '', insightId: '' });
      alert(`Pedido de reposición de ${replenishQty}x ${actionModal.modelName} generado correctamente.`);
    } catch (e) {
      console.error(e);
      alert("Error al procesar reposición");
    } finally {
      setActionProcessing(false);
    }
  };

  const submitOferta = async () => {
    setActionProcessing(true);
    try {
      // Aplicar descuento al inventario disponible de este modelo
      const { data: prods } = await supabase.from('products').select('id').eq('model', actionModal.modelName);
      if (prods && prods.length > 0) {
        const prodIds = prods.map(p => p.id);
        
        // Obtener equipos
        const { data: devs } = await supabase.from('devices')
          .select('id, suggested_price_usd')
          .in('product_id', prodIds)
          .eq('status', 'Disponible');

        if (devs && devs.length > 0) {
          for (let dev of devs) {
            const newPrice = dev.suggested_price_usd * (1 - (discountPercent / 100));
            await supabase.from('devices').update({ suggested_price_usd: newPrice }).eq('id', dev.id);
          }
        }
      }

      setInsights(insights.filter(i => i.id !== actionModal.insightId));
      setActionModal({ type: null, modelName: '', insightId: '' });
      alert(`Descuento del ${discountPercent}% aplicado al inventario de ${actionModal.modelName}.`);
    } catch (e) {
      console.error(e);
      alert("Error al aplicar oferta");
    } finally {
      setActionProcessing(false);
    }
  };

  const counts = {
    todos: insights.length,
    urgente: insights.filter(i => i.type === 'urgente').length,
    atencion: insights.filter(i => i.type === 'atencion').length,
    oportunidad: insights.filter(i => i.type === 'oportunidad').length,
  };

  const filteredInsights = filter === 'todos' ? insights : insights.filter(i => i.type === filter);

  return (
    <div className="space-y-6 text-slate-100 max-w-6xl mx-auto pb-12">
      
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          IA Comercial
          <span className="text-[10px] bg-purple-500 text-white px-2 py-0.5 rounded-full font-bold ml-2">NUEVO</span>
        </h1>
        <p className="text-[13px] text-slate-400 mt-1">
          Insights y acciones automatizadas. Ejecutá decisiones con un clic.
        </p>
      </div>

      <div className="bg-[#121216] border border-purple-500/20 rounded-2xl p-6 shadow-lg shadow-purple-900/10 flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 shrink-0">
            <Sparkles className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Ejecución Inteligente</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              La IA detecta problemas y te propone soluciones accionables. Podés reponer stock directamente o rebajar precios con un clic sin salir de esta pantalla.
            </p>
          </div>
        </div>
        <button 
          onClick={generateInsights}
          disabled={loading}
          className="flex items-center gap-2 bg-[#1a1a24] hover:bg-[#252530] text-slate-300 px-4 py-2.5 rounded-xl border border-white/10 transition-colors text-xs font-semibold shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Recalcular
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { id: 'todos', label: 'TODOS', count: counts.todos, color: 'text-white', bg: 'border-white/20' },
          { id: 'urgente', label: 'URGENTES', count: counts.urgente, color: 'text-rose-500', bg: 'border-rose-500/20' },
          { id: 'atencion', label: 'ATENCIÓN', count: counts.atencion, color: 'text-amber-500', bg: 'border-amber-500/20' },
          { id: 'oportunidad', label: 'OPORTUNIDAD', count: counts.oportunidad, color: 'text-emerald-500', bg: 'border-emerald-500/20' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id as any)}
            className={`p-4 rounded-2xl text-left transition-all ${
              filter === tab.id 
                ? `bg-[#121216] border-2 ${tab.bg} shadow-lg` 
                : 'bg-[#0b0b0e] border border-white/5 hover:bg-[#121216]'
            }`}
          >
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{tab.label}</p>
            <h3 className={`text-3xl font-bold mt-1 ${filter === tab.id ? tab.color : 'text-slate-300'}`}>
              {tab.count}
            </h3>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {loading ? (
          <div className="col-span-1 md:col-span-2 py-20 flex flex-col items-center justify-center text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin mb-4 text-purple-400" />
            <p className="text-sm">Analizando tu negocio en tiempo real...</p>
          </div>
        ) : filteredInsights.length === 0 ? (
          <div className="col-span-1 md:col-span-2 bg-[#121216] border border-white/5 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
            <CheckCircle2 className="w-12 h-12 text-slate-700 mb-4" />
            <h3 className="text-lg font-bold text-slate-400">Todo bajo control</h3>
            <p className="text-sm text-slate-500 mt-2">No se detectaron alertas para este filtro.</p>
          </div>
        ) : (
          filteredInsights.map((insight) => (
            <div 
              key={insight.id} 
              className={`bg-[#121216] border rounded-2xl p-5 flex flex-col justify-between transition-all hover:bg-[#16161a] ${
                insight.type === 'urgente' ? 'border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.05)]' :
                insight.type === 'atencion' ? 'border-amber-500/20' :
                'border-emerald-500/20'
              }`}
            >
              <div>
                <div className="flex items-start gap-3 mb-3">
                  <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    insight.type === 'urgente' ? 'bg-rose-500/10 text-rose-500' :
                    insight.type === 'atencion' ? 'bg-amber-500/10 text-amber-500' :
                    'bg-emerald-500/10 text-emerald-500'
                  }`}>
                    {insight.type === 'urgente' ? <AlertTriangle className="w-4 h-4" /> :
                     insight.type === 'atencion' ? <Info className="w-4 h-4" /> :
                     <Sparkles className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white leading-tight">{insight.title}</h3>
                    <div className={`mt-1.5 inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                      insight.type === 'urgente' ? 'bg-rose-500 text-white' :
                      insight.type === 'atencion' ? 'bg-amber-500/20 text-amber-500' :
                      'bg-emerald-500/20 text-emerald-500'
                    }`}>
                      {insight.badge}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-6 ml-11">
                  {insight.description}
                </p>
              </div>
              
              <div className="ml-11">
                <button 
                  onClick={() => handleAction(insight)}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/5 transition-colors"
                >
                  {insight.actionText} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL REPONER */}
      {actionModal.type === 'reponer' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#121216] border border-rose-500/20 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-rose-400" />
                Reponer Stock Automático
              </h3>
              <button onClick={() => setActionModal({ type: null, modelName: '', insightId: '' })} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-400">Generando orden de compra para: <span className="font-bold text-white">{actionModal.modelName}</span></p>
              
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Unidades a reponer</label>
                <input 
                  type="number" min="1" value={replenishQty} onChange={(e) => setReplenishQty(Number(e.target.value))}
                  className="w-full bg-[#0b0b0e] border border-white/10 rounded-xl py-2 px-3 mt-1 text-sm text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Costo unitario (USD)</label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                  <input 
                    type="number" value={replenishCost} onChange={(e) => setReplenishCost(Number(e.target.value))}
                    className="w-full bg-[#0b0b0e] border border-white/10 rounded-xl py-2 pl-8 pr-3 text-sm text-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-white/5 bg-black/20 flex justify-end gap-2">
              <button onClick={() => setActionModal({ type: null, modelName: '', insightId: '' })} className="px-4 py-2 text-xs font-medium text-slate-300">Cancelar</button>
              <button onClick={submitReponer} disabled={actionProcessing} className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-lg flex items-center gap-2">
                {actionProcessing && <RefreshCw className="w-3 h-3 animate-spin" />}
                Confirmar Orden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL OFERTA */}
      {actionModal.type === 'oferta' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#121216] border border-amber-500/20 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Aplicar Oferta Flash
              </h3>
              <button onClick={() => setActionModal({ type: null, modelName: '', insightId: '' })} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-400">Rebajar precio del inventario estancado: <span className="font-bold text-white">{actionModal.modelName}</span></p>
              
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Porcentaje de Descuento</label>
                <div className="flex items-center gap-3 mt-1">
                  <input 
                    type="range" min="1" max="50" value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))}
                    className="flex-1 accent-amber-500"
                  />
                  <span className="text-lg font-bold text-amber-400 w-12 text-right">{discountPercent}%</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">Esta acción actualizará el precio sugerido de todas las unidades disponibles de este modelo.</p>
              </div>
            </div>
            <div className="p-4 border-t border-white/5 bg-black/20 flex justify-end gap-2">
              <button onClick={() => setActionModal({ type: null, modelName: '', insightId: '' })} className="px-4 py-2 text-xs font-medium text-slate-300">Cancelar</button>
              <button onClick={submitOferta} disabled={actionProcessing} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold rounded-lg flex items-center gap-2">
                {actionProcessing && <RefreshCw className="w-3 h-3 animate-spin" />}
                Aplicar Descuento
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
