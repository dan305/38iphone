'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Wallet,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

interface Expense {
  id: string;
  created_at: string;
  type: string; // 'Gasto' | 'Ingreso Extra'
  category: string;
  description: string;
  amount_usd?: number;
  amount?: number;
  payment_method: string;
  notes: string | null;
}

export default function FinancePage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalSales, setTotalSales] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [type, setType] = useState('Gasto');
  const [category, setCategory] = useState('Alquiler');
  const [description, setDescription] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Efectivo USD');
  const [notes, setNotes] = useState('');

  const fetchData = async () => {
    setLoading(true);

    try {
      // 1. Cargar Gastos/Movimientos
      const { data: expData, error: expErr } = await supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (expErr) throw expErr;
      setExpenses(expData || []);

      // 2. Cargar Ventas para cálculo del Balance
      const { data: salesData } = await supabase
        .from('sales')
        .select('total_usd');

      const sumSales = (salesData || []).reduce((acc, s) => acc + (s.total_usd || 0), 0);
      setTotalSales(sumSales);
    } catch (err: any) {
      console.error('Error al cargar finanzas:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description || !amountUsd) {
      alert('Por favor ingresa la descripción y el monto.');
      return;
    }

    try {
      const amount = parseFloat(amountUsd);

      const { error } = await supabase.from('expenses').insert({
        type,
        category,
        description,
        amount_usd: amount,
        amount: amount,
        payment_method: paymentMethod,
        notes: notes || null,
      });

      if (error) throw error;

      setIsModalOpen(false);
      setType('Gasto');
      setCategory('Alquiler');
      setDescription('');
      setAmountUsd('');
      setPaymentMethod('Efectivo USD');
      setNotes('');

      fetchData();
    } catch (err: any) {
      alert(`Error al registrar movimiento: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Deseas eliminar este registro financiero?')) return;
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  // Cálculos Financieros
  const totalExpenses = expenses
    .filter((e) => e.type === 'Gasto')
    .reduce((acc, e) => acc + (e.amount_usd ?? e.amount ?? 0), 0);

  const totalExtraIncome = expenses
    .filter((e) => e.type === 'Ingreso Extra')
    .reduce((acc, e) => acc + (e.amount_usd ?? e.amount ?? 0), 0);

  const totalIncome = totalSales + totalExtraIncome;
  const netBalance = totalIncome - totalExpenses;

  const filteredExpenses = expenses.filter((e) => {
    const matchesSearch =
      (e.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.payment_method || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'Todos' || e.type === filterType;

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-400" />
            Caja, Gastos y Finanzas
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Control de egresos, egresos operativos y flujo de caja neto
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold px-4 py-2.5 rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Registrar Movimiento
        </button>
      </div>

      {/* Tarjetas Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>TOTAL INGRESOS (VENTAS + EXTRAS)</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            ${totalIncome.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500">
            Ventas: ${totalSales.toFixed(2)} • Extras: ${totalExtraIncome.toFixed(2)}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>TOTAL GASTOS / EGRESOS</span>
            <ArrowDownRight className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400">
            ${totalExpenses.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500">
            {expenses.filter((e) => e.type === 'Gasto').length} gastos registrados
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>BALANCE NETO CAJA</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div
            className={`text-2xl font-bold font-mono ${
              netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            ${netBalance.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500">Resultado operativo acumulado</div>
        </div>
      </div>

      {/* Buscador y Filtros */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por descripción, categoría o método de pago..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 w-full sm:w-auto"
        >
          <option value="Todos">Todos los tipos</option>
          <option value="Gasto">Sólo Gastos</option>
          <option value="Ingreso Extra">Sólo Ingresos Extras</option>
        </select>

        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
          title="Recargar"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabla de Movimientos */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Categoría</th>
                <th className="px-6 py-4">Descripción</th>
                <th className="px-6 py-4">Método de Pago</th>
                <th className="px-6 py-4 text-right">Monto (USD)</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Cargando movimientos...
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No se encontraron registros financieros.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => {
                  const isGasto = exp.type === 'Gasto';
                  const val = exp.amount_usd ?? exp.amount ?? 0;
                  return (
                    <tr key={exp.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {new Date(exp.created_at).toLocaleDateString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <span
                          className={`px-2.5 py-1 rounded-md font-medium border ${
                            isGasto
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {exp.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-white">{exp.category}</td>
                      <td className="px-6 py-4 text-slate-300 max-w-xs">{exp.description}</td>
                      <td className="px-6 py-4 text-xs">
                        <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 font-medium border border-slate-700/60">
                          {exp.payment_method}
                        </span>
                      </td>
                      <td
                        className={`px-6 py-4 text-right font-bold font-mono text-base ${
                          isGasto ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {isGasto ? '-' : '+'}${val.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(exp.id)}
                          className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nuevo Movimiento */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-400" />
                Nuevo Movimiento Financiero
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white text-xl">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tipo de Movimiento</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Gasto">Gasto / Egreso</option>
                    <option value="Ingreso Extra">Ingreso Extra</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Categoría *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Alquiler">Alquiler</option>
                    <option value="Servicios (Luz/Internet)">Servicios (Luz/Internet)</option>
                    <option value="Sueldos / Comisiones">Sueldos / Comisiones</option>
                    <option value="Publicidad / Marketing">Publicidad / Marketing</option>
                    <option value="Repuestos / Insumos">Repuestos / Insumos</option>
                    <option value="Impuestos / Tasas">Impuestos / Tasas</option>
                    <option value="Otros">Otros</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Descripción / Detalle *</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="Ej: Pago de alquiler local"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Monto (USD) *</label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={amountUsd}
                      onChange={(e) => setAmountUsd(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Método de Pago</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Efectivo USD">Efectivo USD</option>
                    <option value="Efectivo ARS">Efectivo ARS</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="USDT / Cripto">USDT / Cripto</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Notas Opcionales</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="Comprobantes, n° de factura, etc."
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg text-sm font-semibold transition-colors"
                >
                  Guardar Movimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}