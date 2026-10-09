'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ShieldCheck, Plus, Search, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
}

interface Device {
  id: string;
  model?: string;
  name?: string;
  imei?: string | null;
  serial_number?: string | null;
  products?: { model?: string; capacity?: string } | null;
}

interface Warranty {
  id: string;
  created_at: string;
  customer_id: string | null;
  device_id: string | null;
  device_info: string | null;
  imei_or_sn: string | null;
  issue_description: string;
  coverage_days: number;
  start_date: string;
  expiration_date?: string | null;
  end_date?: string | null;
  status: string;
  resolution_notes: string | null;
  customers?: { name: string; phone?: string } | null;
}

// Convierte 'YYYY-MM-DD' en una fecha LOCAL (evita el corrimiento de un día por UTC)
const parseLocalDate = (value: string): Date => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
};

const toLocalDateStr = (d: Date): string => d.toLocaleDateString('en-CA');

export default function WarrantiesPage() {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [soldDevices, setSoldDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [customDeviceInfo, setCustomDeviceInfo] = useState('');
  const [customImeiOrSn, setCustomImeiOrSn] = useState('');
  const [issueDescription, setIssueDescription] = useState('Garantía de 30 días otorgada');
  const [coverageDays, setCoverageDays] = useState('30');
  const [startDate, setStartDate] = useState('');
  const [status, setStatus] = useState('Vigente');
  const [resolutionNotes, setResolutionNotes] = useState('');

  useEffect(() => {
    setStartDate(toLocalDateStr(new Date()));
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    try {
      const { data: custData } = await supabase
        .from('customers')
        .select('id, name, phone')
        .order('name', { ascending: true });
      if (custData) setCustomers(custData);
    } catch (err: any) {
      console.error('Error al cargar clientes:', err.message);
    }

    try {
      const { data: devData } = await supabase
        .from('devices')
        .select('*, products ( model, capacity )');
      if (devData) setSoldDevices(devData as any);
    } catch (err: any) {
      console.error('Error al cargar equipos:', err.message);
    }

    try {
      const { data: warData, error: warErr } = await supabase
        .from('warranties')
        .select('*, customers ( name, phone )')
        .order('created_at', { ascending: false });

      if (warErr) throw warErr;
      setWarranties((warData as any) || []);
    } catch (err: any) {
      console.error('Error al cargar garantías:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceSelect = (deviceId: string) => {
    setSelectedDevice(deviceId);
    if (deviceId) {
      const dev = soldDevices.find((d) => d.id === deviceId);
      if (dev) {
        const modelName = dev.products?.model || dev.model || dev.name || '';
        const cap = dev.products?.capacity || '';
        setCustomDeviceInfo(`${modelName} ${cap}`.trim());
        setCustomImeiOrSn(dev.imei || dev.serial_number || '');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!issueDescription) {
      alert('Por favor detalla la falla o motivo del reclamo.');
      return;
    }

    try {
      const days = parseInt(coverageDays) || 30;
      const start = startDate ? parseLocalDate(startDate) : new Date();
      const expDate = new Date(start);
      expDate.setDate(expDate.getDate() + days);
      const expStr = toLocalDateStr(expDate);

      const { error } = await supabase.from('warranties').insert({
        customer_id: selectedCustomer || null,
        device_id: selectedDevice || null,
        device_info: customDeviceInfo || 'Equipo no especificado',
        imei_or_sn: customImeiOrSn || null,
        issue_description: issueDescription,
        coverage_days: days,
        start_date: startDate || toLocalDateStr(new Date()),
        expiration_date: expStr,
        end_date: expStr,
        status,
        resolution_notes: resolutionNotes || null,
      });

      if (error) throw error;

      setIsModalOpen(false);
      setSelectedCustomer('');
      setSelectedDevice('');
      setCustomDeviceInfo('');
      setCustomImeiOrSn('');
      setIssueDescription('Garantía de 30 días otorgada');
      setCoverageDays('30');
      setStatus('Vigente');
      setResolutionNotes('');
      setStartDate(toLocalDateStr(new Date()));

      fetchData();
    } catch (err: any) {
      alert(`Error al registrar garantía: ${err.message}`);
    }
  };

  const handleUpdateStatus = async (warrantyId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('warranties')
        .update({ status: newStatus })
        .eq('id', warrantyId);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Error al actualizar estado: ${err.message}`);
    }
  };

  const handleDelete = async (warrantyId: string) => {
    if (!confirm('¿Deseas eliminar esta garantía?')) return;
    try {
      const { error } = await supabase.from('warranties').delete().eq('id', warrantyId);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  const filteredWarranties = warranties.filter((w) => {
    const matchesSearch =
      (w.customers?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.device_info || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.imei_or_sn || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.issue_description || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filterStatus === 'Todos' || w.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            Control de Garantías (30 Días)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Buscá por cliente o IMEI para verificar la vigencia de la garantía
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold px-4 py-2.5 rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Alta de Garantía Manual
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por Nombre del Cliente, IMEI o N° de Serie..."
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
          <option value="Vigente">Vigente</option>
          <option value="En Revisión">En Revisión</option>
          <option value="Aprobado - En Reparación">Aprobado - En Reparación</option>
          <option value="Aprobado - Reemplazo">Aprobado - Reemplazo</option>
          <option value="Rechazado - Falla Externa">Rechazado - Falla Externa</option>
        </select>

        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
          title="Recargar"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Fecha Venta</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Equipo Vendido</th>
                <th className="px-6 py-4">IMEI / N° Serie</th>
                <th className="px-6 py-4">Fecha Vencimiento</th>
                <th className="px-6 py-4">Estado Cobertura</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Cargando historial de garantías...
                  </td>
                </tr>
              ) : filteredWarranties.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No se encontraron registros de garantía.
                  </td>
                </tr>
              ) : (
                filteredWarranties.map((war) => {
                  const startDateObj = war.start_date ? parseLocalDate(war.start_date) : new Date(war.created_at);
                  const rawExp = war.expiration_date || war.end_date;
                  const expDateObj = rawExp ? parseLocalDate(rawExp) : null;
                  const today = new Date();

                  // Vence al terminar el día de vencimiento (no a las 00:00)
                  const expEndOfDay = expDateObj ? new Date(expDateObj.getFullYear(), expDateObj.getMonth(), expDateObj.getDate(), 23, 59, 59, 999) : null;
                  const isExpired = expEndOfDay ? expEndOfDay < today : false;

                  return (
                    <tr key={war.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {startDateObj.toLocaleDateString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-4 font-medium text-white">
                        <div>{war.customers?.name || <span className="text-slate-500 font-normal">Cliente Anónimo</span>}</div>
                        {war.customers?.phone && (
                          <div className="text-[11px] text-slate-500 font-mono">{war.customers.phone}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-300 font-semibold">
                        {war.device_info || 'Equipo de Venta'}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">
                        {war.imei_or_sn ? (
                          <span className="text-emerald-400 font-medium">IMEI: {war.imei_or_sn}</span>
                        ) : (
                          <span className="text-slate-500">Sin IMEI registrado</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs font-mono">
                        {expDateObj ? (
                          <div className="flex flex-col">
                            <span className={isExpired ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                              {expDateObj.toLocaleDateString('es-AR')}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              ({war.coverage_days} días desde la compra)
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {isExpired && war.status === 'Vigente' ? (
                          <span className="px-2.5 py-1 rounded-md font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 w-max">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            VENCIDA (PASARON 30 DÍAS)
                          </span>
                        ) : (
                          <select
                            value={war.status}
                            onChange={(e) => handleUpdateStatus(war.id, e.target.value)}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold border focus:outline-none bg-slate-950 ${
                              war.status === 'Vigente'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            <option value="Vigente">VIGENTE / ACTIVA</option>
                            <option value="En Revisión">EN REVISIÓN TÉCNICA</option>
                            <option value="Aprobado - En Reparación">EN REPARACIÓN POR GARANTÍA</option>
                            <option value="Aprobado - Reemplazo">CAMBIO DE EQUIPO OTORGADO</option>
                            <option value="Rechazado - Falla Externa">RECHAZADO (GOLPE/AGUA)</option>
                          </select>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(war.id)}
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

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                Alta de Garantía Manual
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
                  <option value="">-- Seleccionar Cliente --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Vincular con Equipo</label>
                <select
                  value={selectedDevice}
                  onChange={(e) => handleDeviceSelect(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                >
                  <option value="">-- Seleccionar del Inventario / Ventas --</option>
                  {soldDevices.map((d) => {
                    const modelName = d.products?.model || d.model || d.name || 'iPhone';
                    const capacity = d.products?.capacity || '';
                    const imei = d.imei || d.serial_number || 'S/N';
                    return (
                      <option key={d.id} value={d.id}>
                        {modelName} {capacity} - IMEI/SN: {imei}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Equipo *</label>
                  <input
                    type="text"
                    required
                    value={customDeviceInfo}
                    onChange={(e) => setCustomDeviceInfo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    placeholder="Ej: iPhone 13 128GB"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">IMEI / N° Serie</label>
                  <input
                    type="text"
                    value={customImeiOrSn}
                    onChange={(e) => setCustomImeiOrSn(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="IMEI o N° Serie"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Fecha de Compra</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Días de Cobertura</label>
                  <input
                    type="number"
                    value={coverageDays}
                    onChange={(e) => setCoverageDays(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Motivo / Falla</label>
                <textarea
                  rows={2}
                  required
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
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
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}