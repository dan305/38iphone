'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  DollarSign, ShoppingCart, Package, TrendingUp,
  AlertCircle, Users, Target, ArrowRight, X, CheckCircle2
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface Sale {
  id: string;
  created_at: string;
  total_usd: number;
}

interface Device {
  id: string;
  status?: string;
  cost_usd?: number;
  model?: string;
}




export default function DashboardPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [customersCount, setCustomersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [dollarBlue, setDollarBlue] = useState<number>(0);
  const [dollarUsdt, setDollarUsdt] = useState<number>(0);

  // Objetivos
  const [monthlyGoal, setMonthlyGoal] = useState<number | null>(null);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalInput, setGoalInput] = useState<string>('');

  useEffect(() => {
    // Cargar objetivo de localStorage
    const savedGoal = localStorage.getItem('erp_monthly_goal');
    if (savedGoal) {
      setMonthlyGoal(Number(savedGoal));
      setGoalInput(savedGoal);
    }

    // Fetch Dolar
    fetch('https://dolarapi.com/v1/dolares')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const blue = data.find((d: any) => d.casa === 'blue');
          const cripto = data.find((d: any) => d.casa === 'cripto');
          if (blue) setDollarBlue(blue.venta);
          if (cripto) setDollarUsdt(cripto.venta);
        }
      })
      .catch(err => console.error('Error fetching dolar:', err));
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Devices (Stock & Valor)
        const { data: devData } = await supabase.from('devices').select('id, status, cost_usd, model');
        const allDevices = devData || [];
        setDevices(allDevices);

        // 2. Ventas (30 dias y 14 dias para el grafico)
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);

        const { data: salesData } = await supabase
          .from('sales')
          .select('id, created_at, total_usd')
          .gte('created_at', thirtyDaysAgo.toISOString())
          .order('created_at', { ascending: true });

        setSales(salesData || []);

        // 3. Clientes Totales
        const { count } = await supabase.from('customers').select('*', { count: 'exact', head: true });
        setCustomersCount(count || 0);

      } catch (err: any) {
        console.error('Error al cargar dashboard:', err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const saveGoal = () => {
    const val = Number(goalInput);
    if (!isNaN(val) && val > 0) {
      setMonthlyGoal(val);
      localStorage.setItem('erp_monthly_goal', val.toString());
      setShowGoalModal(false);
    } else {
      // Clear goal if 0 or empty
      setMonthlyGoal(null);
      localStorage.removeItem('erp_monthly_goal');
      setShowGoalModal(false);
    }
  };

  // --- CÁLCULOS ---
  const availableDevices = devices.filter((d) => !d.status || d.status.trim().toLowerCase() === 'disponible');
  const stockDisponible = availableDevices.length;
  const valorInventario = availableDevices.reduce((acc, curr) => acc + Number(curr.cost_usd || 0), 0);

  const ventas30D = sales.reduce((acc, curr) => acc + Number(curr.total_usd || 0), 0);
  const operaciones30D = sales.length;

  // Ventas de este mes (para el objetivo)
  const currentMonthSales = sales.filter(s => {
    const saleDate = new Date(s.created_at);
    const now = new Date();
    return saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear();
  }).reduce((acc, curr) => acc + Number(curr.total_usd || 0), 0);

  // Progreso del objetivo
  const goalProgress = monthlyGoal ? Math.min(100, Math.round((currentMonthSales / monthlyGoal) * 100)) : 0;

  // Chart Data: Últimos 14 días
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d;
  });

  const chartData = last14Days.map(date => {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const daySales = sales.filter(s => s.created_at.startsWith(dateStr));
    const totalDay = daySales.reduce((acc, curr) => acc + Number(curr.total_usd || 0), 0);

    return {
      name: date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).replace('.', ''),
      total: totalDay
    };
  });

  // Top Productos (Agrupados por modelo en stock disponible)
  const modelsCount: Record<string, number> = {};
  availableDevices.forEach(d => {
    const m = d.model || 'Sin Modelo Especificado';
    modelsCount[m] = (modelsCount[m] || 0) + 1;
  });

  const topProducts = Object.entries(modelsCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3); // top 3

  // Stock Crítico (Modelos con 2 o menos)
  const stockCritico = Object.entries(modelsCount).filter(([_, count]) => count <= 2);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-100 pb-12 max-w-6xl">

      {/* HEADER */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-[13px] text-slate-400 mt-1 flex items-center gap-2">
          Resumen ejecutivo <span className="text-slate-600">•</span> Cotización Blue $ {dollarBlue.toLocaleString('es-AR')} <span className="text-slate-600">•</span> USDT $ {dollarUsdt.toLocaleString('es-AR')}
        </p>
      </div>

      {/* OBJETIVOS BANNER */}
      {monthlyGoal ? (
        <div className="bg-[#121216] border border-white/5 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between shadow-lg shadow-black/20 gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1 w-full max-w-xl">
              <div className="flex justify-between items-end mb-1.5">
                <h3 className="text-sm font-semibold text-white">Objetivo Mensual: <span className="text-emerald-400">${monthlyGoal.toLocaleString('en-US')}</span></h3>
                <span className="text-xs font-bold text-slate-300">{goalProgress}%</span>
              </div>
              <div className="w-full bg-[#1e1e24] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-2 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${goalProgress}%` }}
                ></div>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">Llevás vendido ${currentMonthSales.toLocaleString('en-US')} este mes.</p>
            </div>
          </div>
          <button
            onClick={() => setShowGoalModal(true)}
            className="text-[11px] text-slate-300 hover:text-white flex items-center gap-1 font-medium transition-colors whitespace-nowrap shrink-0 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10"
          >
            Ajustar meta
          </button>
        </div>
      ) : (
        <div className="bg-[#121216] border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between shadow-lg shadow-black/20 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shrink-0">
              <Target className="w-5 h-5 text-slate-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Sin objetivos definidos</h3>
              <p className="text-[11px] text-slate-400">Definí metas mensuales y vas a ver el progreso acá.</p>
            </div>
          </div>
          <button
            onClick={() => setShowGoalModal(true)}
            className="text-[11px] bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300 px-4 py-2 rounded-xl flex items-center gap-2 font-semibold transition-colors border border-purple-500/20"
          >
            Configurar <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 4 KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* STOCK */}
        <div className="bg-[#121216] border border-white/5 rounded-2xl p-5 shadow-lg shadow-black/20 relative group">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Stock Disponible</div>
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-3xl font-bold text-white font-mono">{stockDisponible}</h2>
              <p className="text-[11px] text-slate-500 mt-1">unidades activas</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
              <Package className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* VALOR INVENTARIO */}
        <div className="bg-[#121216] border border-white/5 rounded-2xl p-5 shadow-lg shadow-black/20 relative group">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Valor Inventario</div>
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-3xl font-bold text-white font-mono">${valorInventario.toLocaleString('en-US')}</h2>
              <p className="text-[11px] text-slate-500 mt-1">Costo estimado</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 border border-white/10">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* VENTAS 30D */}
        <div className="bg-[#121216] border border-white/5 rounded-2xl p-5 shadow-lg shadow-black/20 relative group">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Ventas (30D)</div>
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-3xl font-bold text-white font-mono">${ventas30D.toLocaleString('en-US')}</h2>
              <p className="text-[11px] text-slate-500 mt-1">{operaciones30D} operaciones</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 border border-white/10">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* CLIENTES ACTIVOS */}
        <div className="bg-[#121216] border border-white/5 rounded-2xl p-5 shadow-lg shadow-black/20 relative group">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Clientes Activos</div>
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-3xl font-bold text-white font-mono">{customersCount}</h2>
              <p className="text-[11px] text-slate-500 mt-1">En base de datos</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 border border-white/10">
              <Users className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* CHARTS & TOP PRODUCTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* GRÁFICO DE VENTAS */}
        <div className="lg:col-span-2 bg-[#121216] border border-white/5 rounded-2xl p-6 shadow-lg shadow-black/20">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-sm font-bold text-white">Ventas — últimos 14 días</h3>
              <p className="text-[11px] text-slate-500 mt-1">Totales convertidos a USD</p>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] text-slate-300">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              Activo
            </div>
          </div>

          <div className="h-[250px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#22222a" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#555"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="#555"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) => val === 0 ? '0' : val}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#e4e4e7' }}
                  formatter={(value) => {
                    const numericValue = Number(Array.isArray(value) ? value[0] : value ?? 0);
                    return [`$${Number.isFinite(numericValue) ? numericValue.toFixed(2) : '0.00'}`, 'Ventas USD'];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#e2e8f0"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* TOP PRODUCTOS */}
        <div className="bg-[#121216] border border-white/5 rounded-2xl p-6 shadow-lg shadow-black/20">
          <h3 className="text-sm font-bold text-white">Top productos</h3>
          <p className="text-[11px] text-slate-500 mt-1 mb-6">Por unidades en stock</p>

          <div className="space-y-4">
            {topProducts.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">No hay productos en stock.</p>
            ) : (
              topProducts.map(([model, count], idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#16161a] flex items-center justify-center border border-white/5">
                      <Package className="w-4 h-4 text-slate-400" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200">{model}</div>
                      <div className="text-[10px] text-slate-500">Stock activo</div>
                    </div>
                  </div>
                  <div className="text-xs font-mono text-slate-400 bg-black/30 px-2 py-1 rounded">
                    {count}u
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* STOCK CRÍTICO */}
      <div className="bg-[#1a1608] border border-amber-500/20 rounded-2xl p-5 shadow-lg shadow-black/20">
        <div className="flex items-center gap-2 mb-1">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-amber-500">Stock crítico</h3>
        </div>
        <p className="text-[11px] text-amber-500/70 mb-4">{stockCritico.length} productos con 2 unidades o menos.</p>

        <div className="flex flex-wrap gap-2">
          {stockCritico.length === 0 ? (
            <span className="text-xs text-amber-500/50">Todo el inventario cuenta con buen stock.</span>
          ) : (
            stockCritico.map(([model, count], idx) => (
              <div key={idx} className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                <span className="text-xs text-amber-200">{model}</span>
                <span className="text-[10px] font-bold text-amber-500 bg-amber-500/20 px-1.5 rounded">
                  {count}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* MODAL DE OBJETIVOS */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#121216] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-400" />
                Configurar Objetivo
              </h3>
              <button
                onClick={() => setShowGoalModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-xs text-slate-400 mb-4">
                Establecé tu meta de ventas mensuales en dólares. Podés dejarlo en 0 para desactivarlo.
              </p>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="number"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder="Ej: 5000"
                  className="w-full bg-[#0b0b0e] border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                />
              </div>
            </div>
            <div className="p-4 border-t border-white/5 bg-black/20 flex justify-end gap-2">
              <button
                onClick={() => setShowGoalModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveGoal}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-purple-500/20"
              >
                Guardar Objetivo
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}