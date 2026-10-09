'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Wrench, Plus, Search, RefreshCw, Trash2, DollarSign, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
}

interface ServiceOrder {
  id: string;
  created_at: string;
  customer_id: string | null;
  device_info: string | null;
  imei_or_sn: string | null;
  problem_description: string | null;
  diagnosis: string | null;
  estimated_cost_usd: number | null;
  final_cost_usd: number | null;
  status: string;
  notes: string | null;
  customers?: { name: string; phone?: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  Ingresado: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  'En Diagnóstico': 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  'En Reparación': 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  'Listo para Entrega': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  Entregado: 'bg-slate-800 text-slate-400 border-slate-700',
  Cancelado: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
};

export default function ServiceOrdersPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [deviceInfo, setDeviceInfo] = useState('');
  const [imeiOrSn, setImeiOrSn] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [estimatedCostUsd, setEstimatedCostUsd] = useState('');
  const [finalCostUsd, setFinalCostUsd] = useState('');
  const [status, setStatus] = useState('Ingresado');
  const [notes, setNotes] = useState('');

  const fetchData = async () => {
    setLoading(true);

    // 1. Cargar Clientes
    try {
      const { data: custData } = await supabase
        .from('customers')
        .select('id, name, phone')
        .order('name', { ascending: true });
      if (custData) setCustomers(custData);
    } catch (err: any) {
      console.error('Error al cargar clientes:', err.message);
    }

    // 2. Cargar Órdenes de Servicio
    try {
      const { data: ordersData, error: ordersErr } = await supabase
        .from('service_orders')
        .select('*, customers ( name, phone )')
        .order('created_at', { ascending: false });

      if (ordersErr) throw ordersErr;

      setOrders((ordersData as any) || []);
    } catch (err: any) {
      console.error('Error al cargar órdenes de servicio:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!deviceInfo || !problemDescription) {
      alert('Por favor especifica el equipo y la descripción del problema.');
      return;
    }

    try {
      const estCost = estimatedCostUsd ? parseFloat(estimatedCostUsd) : 0;
      const finCost = finalCostUsd ? parseFloat(finalCostUsd) : estCost;

      const { error } = await supabase.from('service_orders').insert({
        customer_id: selectedCustomer || null,
        device_info: deviceInfo,
        imei_or_sn: imeiOrSn || null,
        problem_description: problemDescription,
        issue_description: problemDescription,
        diagnosis: diagnosis || null,
        estimated_cost_usd: estCost,
        final_cost_usd: finCost,
        status,
        notes: notes || null,
      });

      if (error) throw error;

      // Resetear modal
      setIsModalOpen(false);
      setSelectedCustomer('');
      setDeviceInfo('');
      setImeiOrSn('');
      setProblemDescription('');
      setDiagnosis('');
      setEstimatedCostUsd('');
      setFinalCostUsd('');
      setStatus('Ingresado');
      setNotes('');

      fetchData();
    } catch (err: any) {
      alert(`Error al registrar la orden: ${err.message}`);
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('service_orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Error al actualizar estado: ${err.message}`);
    }
  };

  const handleDelete = async (orderId: string) => {
    if (!confirm('¿Deseas eliminar esta orden de servicio?')) return;
    try {
      const { error } = await supabase.from('service_orders').delete().eq('id', orderId);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.device_info?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.imei_or_sn?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.problem_description?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filterStatus === 'Todos' || o.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wrench className="w-6 h-6 text-emerald-400" />
            Servicio Técnico y Reparaciones
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Recepción, diagnóstico y seguimiento de presupuestos de laboratorio
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold px-4 py-2.5 rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Nueva Orden de Servicio
        </button>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por cliente, equipo, IMEI/SN o problema..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 w-full sm:w-auto"
        >
          <option value="Todos">Todos los estados</option>
          <option value="Ingresado">Ingresado</option>
          <option value="En Diagnóstico">En Diagnóstico</option>
          <option value="En Reparación">En Reparación</option>
          <option value="Listo para Entrega">Listo para Entrega</option>
          <option value="Entregado">Entregado</option>
          <option value="Cancelado">Cancelado</option>
        </select>

        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
          title="Recargar"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabla de Órdenes */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Fecha / Orden</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Equipo / IMEI</th>
                <th className="px-6 py-4">Falla / Diagnóstico</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Presupuesto (USD)</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Cargando órdenes de reparación...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No se encontraron órdenes registradas.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  return (
                    <tr key={order.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {new Date(order.created_at).toLocaleDateString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-4 font-medium text-white">
                        <div>{order.customers?.name || <span className="text-slate-500 font-normal">Anónimo</span>}</div>
                        {order.customers?.phone && (
                          <div className="text-[11px] text-slate-500 font-mono">{order.customers.phone}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-300">
                        <div className="font-semibold text-slate-200">{order.device_info || 'S/D'}</div>
                        {order.imei_or_sn && (
                          <div className="text-[11px] font-mono text-slate-500">
                            SN/IMEI: {order.imei_or_sn}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs max-w-xs">
                        <div className="text-slate-200 line-clamp-1">{order.problem_description}</div>
                        {order.diagnosis && (
                          <div className="text-slate-400 line-clamp-1 italic mt-0.5">
                            Diag: {order.diagnosis}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <select
                          value={order.status}
                          onChange={(e) => handleUpdateStatus(order.id, e.target.value)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium border focus:outline-none bg-slate-950 ${
                            STATUS_COLORS[order.status] || 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          <option value="Ingresado">Ingresado</option>
                          <option value="En Diagnóstico">En Diagnóstico</option>
                          <option value="En Reparación">En Reparación</option>
                          <option value="Listo para Entrega">Listo para Entrega</option>
                          <option value="Entregado">Entregado</option>
                          <option value="Cancelado">Cancelado</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-400 font-mono text-base">
                        ${order.final_cost_usd || order.estimated_cost_usd ? (order.final_cost_usd || order.estimated_cost_usd)?.toFixed(2) : '0.00'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(order.id)}
                          className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                          title="Eliminar orden"
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

      {/* Modal Nueva Orden */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Wrench className="w-5 h-5 text-emerald-400" />
                Nueva Orden de Reparación
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white text-xl">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Cliente</label>
                <select
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Cliente Anónimo / Opcional --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Equipo *</label>
                  <input
                    type="text"
                    required
                    value={deviceInfo}
                    onChange={(e) => setDeviceInfo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    placeholder="Ej: iPhone 12 Pro 128GB Azul"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">IMEI / N° Serie</label>
                  <input
                    type="text"
                    value={imeiOrSn}
                    onChange={(e) => setImeiOrSn(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="Serie o IMEI"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Falla Reportada por el Cliente *</label>
                <textarea
                  rows={2}
                  required
                  value={problemDescription}
                  onChange={(e) => setProblemDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="Ej: No enciende, pantalla fisurada, no carga..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Diagnóstico Inicial (Técnico)</label>
                <textarea
                  rows={2}
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="Ej: Módulo de pantalla dañado, reemplazar pin de carga..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Presupuesto Estimado (USD)</label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="number"
                      step="0.01"
                      value={estimatedCostUsd}
                      onChange={(e) => setEstimatedCostUsd(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Estado Inicial</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Ingresado">Ingresado</option>
                    <option value="En Diagnóstico">En Diagnóstico</option>
                    <option value="En Reparación">En Reparación</option>
                  </select>
                </div>
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
                  Registrar Órden
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}