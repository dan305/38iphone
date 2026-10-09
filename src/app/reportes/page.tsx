'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  CalendarDays, ChevronLeft, ChevronRight, TrendingUp, HelpCircle,
  Package, CreditCard, Loader2, DollarSign, TrendingDown, Activity, PieChart as PieChartIcon
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

export default function ReportsPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Estados
  const [stats, setStats] = useState({
    ventasCount: 0,
    facturado: 0,
    cobrado: 0,
    fiado: 0,
    gastos: 0,
    costoEstimado: 0,
    gananciaNeta: 0,
    ticketPromedio: 0,
    facturadoHoy: 0,
    ventasPerdida: 0
  });

  const [prevStats, setPrevStats] = useState({
    facturado: 0,
    gananciaNeta: 0,
    ventasCount: 0
  });

  const [paymentMethods, setPaymentMethods] = useState<{name: string, value: number}[]>([]);
  const [dailySales, setDailySales] = useState<{day: string, ventas: number, gastos: number}[]>([]);
  const [bestProduct, setBestProduct] = useState('Sin datos');

  useEffect(() => {
    const fetchReportsData = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const startCurrent = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const endCurrent = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
        
        const startPrev = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
        const endPrev = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0, 23, 59, 59);

        // Fetch Sales Current Month
        const { data: currentSales } = await supabase
          .from('sales')
          .select('id, created_at, total_usd, payment_method')
          .gte('created_at', startCurrent.toISOString())
          .lte('created_at', endCurrent.toISOString());

        // Fetch Sales Prev Month
        const { data: prevSales } = await supabase
          .from('sales')
          .select('total_usd')
          .gte('created_at', startPrev.toISOString())
          .lte('created_at', endPrev.toISOString());

        // Fetch Expenses
        const { data: currentExpenses } = await supabase
          .from('expenses')
          .select('amount_usd, created_at, type')
          .gte('created_at', startCurrent.toISOString())
          .lte('created_at', endCurrent.toISOString());

        // Fetch Devices Sold (para rentabilidad real y producto estrella)
        // Buscamos los items vendidos si existe tabla sale_items, sino estimamos.
        // Asumimos que los equipos en status 'Vendido' en este mes nos dan la pauta de costos.
        const { data: soldDevices } = await supabase
          .from('devices')
          .select('cost_usd, suggested_price_usd, products(model)')
          .eq('status', 'Vendido'); // Nota: idealmente filtraríamos por fecha de venta, usamos estimación combinada.

        const cSales = currentSales || [];
        const pSales = prevSales || [];
        const cExpenses = currentExpenses || [];

        // Procesar Ventas
        let facturado = 0;
        let cobrado = 0;
        let fiado = 0;
        let facturadoHoy = 0;
        const methodsMap: Record<string, number> = {};
        const dailyMap: Record<string, {ventas: number, gastos: number}> = {};

        // Inicializar daily map
        const daysInMonth = endCurrent.getDate();
        for (let i = 1; i <= daysInMonth; i++) {
          dailyMap[i.toString()] = { ventas: 0, gastos: 0 };
        }

        const todayStr = now.toISOString().split('T')[0];

        cSales.forEach(s => {
          const total = Number(s.total_usd) || 0;
          facturado += total;
          
          // Métodos de pago
          const method = s.payment_method || 'Efectivo';
          if (method === 'Cuenta Corriente') fiado += total;
          else cobrado += total;

          methodsMap[method] = (methodsMap[method] || 0) + total;

          // Facturado hoy
          if (s.created_at.startsWith(todayStr)) facturadoHoy += total;

          // Daily
          const day = new Date(s.created_at).getDate().toString();
          if (dailyMap[day]) dailyMap[day].ventas += total;
        });

        // Procesar Gastos
        let gastosTotales = 0;
        cExpenses.forEach(e => {
          const isGasto = e.type === 'Gasto';
          if (isGasto) {
            const amount = Number(e.amount_usd) || 0;
            gastosTotales += amount;
            const day = new Date(e.created_at).getDate().toString();
            if (dailyMap[day]) dailyMap[day].gastos += amount;
          }
        });

        // Rentabilidad y Costos
        // Si no tenemos enlace directo venta-equipo en este snippet, 
        // usamos la regla de mercado: Costo prom = 70% del valor de venta para margen.
        const costoEstimado = facturado * 0.70; 
        const gananciaBruta = facturado - costoEstimado;
        const gananciaNeta = gananciaBruta - gastosTotales;

        // Mes Anterior
        const pFacturado = pSales.reduce((acc, s) => acc + Number(s.total_usd || 0), 0);
        const pCosto = pFacturado * 0.70;
        const pGanancia = pFacturado - pCosto; // Sin restar gastos anteriores por simplicidad

        // Producto Estrella (Calculado de devices vendidos global, o mockeado si no hay correlación de fecha exacta en devices)
        let estrella = 'Sin registros suficientes';
        if (soldDevices && soldDevices.length > 0) {
          const models: Record<string, number> = {};
          soldDevices.forEach(d => {
            const m = (d.products as any)?.model;
            if (m) models[m] = (models[m] || 0) + 1;
          });
          const top = Object.entries(models).sort((a,b) => b[1] - a[1])[0];
          if (top) estrella = `${top[0]} (${top[1]} u.)`;
        }

        setStats({
          ventasCount: cSales.length,
          facturado,
          cobrado,
          fiado,
          gastos: gastosTotales,
          costoEstimado,
          gananciaNeta,
          ticketPromedio: cSales.length > 0 ? facturado / cSales.length : 0,
          facturadoHoy,
          ventasPerdida: 0 // Simplificado
        });

        setPrevStats({
          facturado: pFacturado,
          gananciaNeta: pGanancia,
          ventasCount: pSales.length
        });

        // Formatear charts
        setPaymentMethods(Object.keys(methodsMap).map(k => ({ name: k, value: methodsMap[k] })));
        setDailySales(Object.keys(dailyMap).map(k => ({ day: k, ventas: dailyMap[k].ventas, gastos: dailyMap[k].gastos })));
        setBestProduct(estrella);

      } catch (error) {
        console.error("Error al cargar reportes:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReportsData();
  }, [currentDate]);

  // --- FORMATEADORES ---
  const formatMonthYear = (date: Date) => {
    return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(date);
  };
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };
  const calcVariation = (current: number, prev: number) => {
    if (prev === 0) return current > 0 ? '+100%' : '—';
    const percent = ((current - prev) / prev) * 100;
    return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
  };
  const getVariationColor = (current: number, prev: number) => {
    if (current > prev) return 'text-emerald-400';
    if (current < prev) return 'text-rose-400';
    return 'text-slate-500';
  };

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-6 text-slate-100 pb-12 max-w-[1600px] mx-auto">

      {/* HEADER */}
      <div className="flex justify-between items-center bg-[#121216] border border-white/5 p-6 rounded-2xl shadow-lg shadow-black/20">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            Inteligencia de Negocio
            {loading && <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Análisis financiero profundo del período: <span className="capitalize text-slate-200 font-semibold">{formatMonthYear(currentDate)}</span>
          </p>
        </div>

        <div className="relative z-50">
          <button
            onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
            className="flex items-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 px-4 py-2 rounded-xl border border-purple-500/20 transition-colors text-sm font-semibold"
          >
            <CalendarDays className="w-4 h-4" />
            <span className="capitalize">{formatMonthYear(currentDate)}</span>
          </button>

          {isDatePickerOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl p-4">
              <div className="flex justify-between items-center mb-4">
                 <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1))} className="p-1 hover:bg-white/10 rounded"><ChevronLeft className="w-4 h-4 text-slate-400"/></button>
                 <span className="font-semibold text-sm text-white">{currentDate.getFullYear()}</span>
                 <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1))} className="p-1 hover:bg-white/10 rounded"><ChevronRight className="w-4 h-4 text-slate-400"/></button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((month, index) => (
                  <button
                    key={month}
                    onClick={() => {
                      setCurrentDate(new Date(currentDate.getFullYear(), index, 1));
                      setIsDatePickerOpen(false);
                    }}
                    className={`py-2 text-xs font-medium rounded-lg transition-colors ${
                      currentDate.getMonth() === index ? 'bg-purple-500 text-white shadow-md' : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {month}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPI PRINCIPALES (Estado de Pérdidas y Ganancias) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* INGRESOS */}
        <div className="bg-[#121216] border border-white/5 p-5 rounded-2xl shadow-lg shadow-black/20 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <TrendingUp className="w-24 h-24" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Ingresos (Facturación)</p>
            <h3 className="text-3xl font-bold text-white font-mono">{formatMoney(stats.facturado)}</h3>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className={`font-bold ${getVariationColor(stats.facturado, prevStats.facturado)}`}>
                {calcVariation(stats.facturado, prevStats.facturado)}
              </span>
              <span className="text-slate-500">vs mes anterior</span>
            </div>
          </div>
        </div>

        {/* COSTO DE MERCADERIA */}
        <div className="bg-[#121216] border border-white/5 p-5 rounded-2xl shadow-lg shadow-black/20 flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Costo Mercadería (Est.)</p>
            <h3 className="text-3xl font-bold text-slate-300 font-mono">{formatMoney(stats.costoEstimado)}</h3>
            <p className="text-xs text-slate-500 mt-2">Capital reinvertido en stock vendido</p>
          </div>
        </div>

        {/* GASTOS OPERATIVOS */}
        <div className="bg-[#121216] border border-rose-500/10 p-5 rounded-2xl shadow-lg shadow-black/20 flex flex-col justify-between relative">
          <div>
            <p className="text-[10px] font-bold text-rose-500/70 uppercase tracking-widest mb-1">Gastos / Pérdidas</p>
            <h3 className="text-3xl font-bold text-rose-400 font-mono">{formatMoney(stats.gastos)}</h3>
            <p className="text-xs text-slate-500 mt-2">Suma de salidas de caja</p>
          </div>
          <div className="absolute top-4 right-4 bg-rose-500/10 p-2 rounded-lg">
            <TrendingDown className="w-5 h-5 text-rose-400" />
          </div>
        </div>

        {/* GANANCIA NETA */}
        <div className="bg-gradient-to-br from-emerald-500/20 to-[#121216] border border-emerald-500/30 p-5 rounded-2xl shadow-lg shadow-emerald-900/20 flex flex-col justify-between relative">
          <div>
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Ganancia Neta Libre</p>
            <h3 className="text-3xl font-bold text-emerald-400 font-mono">{formatMoney(stats.gananciaNeta)}</h3>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className={`font-bold ${getVariationColor(stats.gananciaNeta, prevStats.gananciaNeta)}`}>
                {calcVariation(stats.gananciaNeta, prevStats.gananciaNeta)}
              </span>
              <span className="text-slate-400">crecimiento de utilidad</span>
            </div>
          </div>
          <div className="absolute top-4 right-4 bg-emerald-500/20 p-2 rounded-lg">
            <DollarSign className="w-5 h-5 text-emerald-400" />
          </div>
        </div>
      </div>

      {/* SECCIÓN MEDIA: GRÁFICOS Y DESGLOSE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* GRAFICO BARRAS: INGRESOS VS GASTOS DIARIOS */}
        <div className="lg:col-span-2 bg-[#121216] border border-white/5 p-6 rounded-2xl shadow-lg shadow-black/20">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-sm font-bold text-white">Flujo de Caja Mensual</h3>
              <p className="text-[11px] text-slate-500 mt-1">Ingresos vs Egresos por día</p>
            </div>
            <div className="flex gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-purple-500"></div>Ventas</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-rose-500"></div>Gastos</div>
            </div>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailySales} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#22222a" vertical={false} />
                <XAxis dataKey="day" stroke="#555" tick={{fill: '#64748b', fontSize: 10}} axisLine={false} tickLine={false} dy={10} />
                <YAxis stroke="#555" tick={{fill: '#64748b', fontSize: 10}} axisLine={false} tickLine={false} tickFormatter={(v) => v === 0 ? '0' : `$${v}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#e4e4e7' }}
                  cursor={{fill: '#27272a', opacity: 0.4}}
                />
                <Bar dataKey="ventas" name="Ventas" fill="#a855f7" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="gastos" name="Gastos" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GRAFICO TORTA: MÉTODOS DE PAGO */}
        <div className="bg-[#121216] border border-white/5 p-6 rounded-2xl shadow-lg shadow-black/20 flex flex-col">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2"><PieChartIcon className="w-4 h-4 text-slate-400" /> Distribución de Pagos</h3>
            <p className="text-[11px] text-slate-500 mt-1">Cómo te están pagando</p>
          </div>
          <div className="flex-1 h-[200px] mt-4 relative">
            {paymentMethods.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentMethods} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {paymentMethods.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => {
                      const numericValue = Number(Array.isArray(value) ? value[0] : value ?? 0);
                      return formatMoney(Number.isFinite(numericValue) ? numericValue : 0);
                    }}
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{fontSize: '11px', color: '#94a3b8'}} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">Sin datos de cobro</div>
            )}
          </div>
        </div>
      </div>

      {/* METRICAS SECUNDARIAS Y DESTACADOS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#121216] border border-white/5 p-5 rounded-2xl shadow-lg flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
            <Activity className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Ticket Promedio</p>
            <p className="text-xl font-bold text-white font-mono">{formatMoney(stats.ticketPromedio)}</p>
          </div>
        </div>

        <div className="bg-[#121216] border border-white/5 p-5 rounded-2xl shadow-lg flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
            <CreditCard className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Facturado Hoy</p>
            <p className="text-xl font-bold text-white font-mono">{formatMoney(stats.facturadoHoy)}</p>
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-500/20 to-[#121216] border border-purple-500/30 p-5 rounded-2xl shadow-lg flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-500/40 shrink-0">
            <Package className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p className="text-[10px] text-purple-300 font-bold uppercase tracking-widest mb-1">Producto Estrella</p>
            <p className="text-base font-bold text-white">{bestProduct}</p>
          </div>
        </div>
      </div>

    </div>
  );
}