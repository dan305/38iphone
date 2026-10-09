'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Plus, Search, Smartphone, RefreshCw, Trash2, Tag } from 'lucide-react';

interface Product {
  id?: string;
  brand: string;
  model: string;
  capacity: string;
  color: string;
}

interface Device {
  id: string;
  product_id: string;
  imei: string;
  serial_number: string;
  battery_health: number;
  condition: string;
  cost_usd: number;
  suggested_price_usd: number;
  status: string;
  entry_date: string;
  products?: Product;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Estado del formulario
  const [formData, setFormData] = useState({
    model: 'iPhone 13',
    capacity: '128GB',
    color: 'Negro',
    imei: '',
    serial_number: '',
    battery_health: 85,
    condition: 'Usado',
    cost_usd: 400,
    suggested_price_usd: 550,
    status: 'Disponible'
  });

  // Cargar equipos desde Supabase
  const fetchDevices = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('devices')
        .select(`
          *,
          products (
            brand,
            model,
            capacity,
            color
          )
        `)
        .order('entry_date', { ascending: false });

      if (error) throw error;
      setDevices(data || []);
    } catch (err: any) {
      console.error('Error al cargar equipos:', err.message);
      setLoadError(err.message || 'No se pudo cargar el inventario');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    // Inventario en vivo: cualquier cambio en devices refresca la tabla
    const channel = supabase
      .channel('devices-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => fetchDevices())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Cambiar estado sin abrir modal
  const handleStatusChange = async (id: string, status: string) => {
    const { error } = await supabase.from('devices').update({ status }).eq('id', id);
    if (error) alert(`No se pudo cambiar el estado: ${error.message}`);
    else setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
  };

  // Crear Producto + Registrar Equipo
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      // 1. Buscar si existe el producto o crearlo
      let productId = '';
      const { data: existingProducts } = await supabase
        .from('products')
        .select('id')
        .eq('model', formData.model.trim())
        .eq('capacity', formData.capacity.trim())
        .eq('color', formData.color.trim())
        .limit(1);

      if (existingProducts && existingProducts.length > 0) {
        productId = existingProducts[0].id;
      } else {
        const { data: newProd, error: prodErr } = await supabase
          .from('products')
          .insert({
            brand: 'Apple',
            model: formData.model.trim(),
            capacity: formData.capacity.trim(),
            color: formData.color.trim()
          })
          .select('id')
          .single();

        if (prodErr) throw prodErr;
        productId = newProd.id;
      }

      // 2. Crear el equipo
      const { error: deviceErr } = await supabase.from('devices').insert({
        product_id: productId,
        imei: formData.imei.trim() || null,
        serial_number: formData.serial_number.trim() || null,
        battery_health: Number(formData.battery_health),
        condition: formData.condition,
        cost_usd: Number(formData.cost_usd),
        suggested_price_usd: Number(formData.suggested_price_usd),
        status: formData.status
      });

      if (deviceErr) throw deviceErr;

      // Resetear modal y recargar
      setIsModalOpen(false);
      setFormData({
        model: 'iPhone 13',
        capacity: '128GB',
        color: 'Negro',
        imei: '',
        serial_number: '',
        battery_health: 85,
        condition: 'Usado',
        cost_usd: 400,
        suggested_price_usd: 550,
        status: 'Disponible'
      });
      fetchDevices();
    } catch (err: any) {
      const msg = err.code === '23505' ? 'Ya existe un equipo con ese IMEI o número de serie.' : err.message;
      alert(`Error al registrar equipo: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  // Eliminar equipo
  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este equipo del inventario?')) return;
    try {
      const { error } = await supabase.from('devices').delete().eq('id', id);
      if (error) {
        if (error.code === '23503') {
          throw new Error('Este equipo ya tiene ventas, compras o garantías asociadas, por eso no se puede eliminar. Si no está disponible, dejalo como Vendido.');
        }
        throw error;
      }
      fetchDevices();
    } catch (err: any) {
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  // Filtrado de lista
  const norm = (v?: string | null) => (v || '').trim().toLowerCase();
  const q = norm(searchTerm);
  const filteredDevices = devices.filter((device) => {
    const matchesSearch =
      !q ||
      norm(device.products?.model).includes(q) ||
      norm(device.products?.color).includes(q) ||
      norm(device.imei).includes(q) ||
      norm(device.serial_number).includes(q);
    const matchesStatus = statusFilter === 'Todos' || norm(device.status) === norm(statusFilter);
    return matchesSearch && matchesStatus;
  });

  const available = devices.filter((d) => norm(d.status) === 'disponible');
  const stockCost = available.reduce((a, d) => a + Number(d.cost_usd || 0), 0);
  const stockValue = available.reduce((a, d) => a + Number(d.suggested_price_usd || 0), 0);

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-slate-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Inventario</h1>
            <p className="text-xs text-slate-500 mt-0.5">Equipos registrados por IMEI y estado</p>
          </div>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Ingresar Equipo
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: 'Disponibles', v: String(available.length) },
          { l: 'Total equipos', v: String(devices.length) },
          { l: 'Costo en stock', v: `$${stockCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}` },
          { l: 'Valor de venta', v: `$${stockValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}` },
        ].map((k) => (
          <div key={k.l} className="erp-card p-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{k.l}</div>
            <div className="text-2xl font-bold text-white font-mono">{k.v}</div>
          </div>
        ))}
      </div>

      {loadError && (
        <div className="erp-card border-rose-500/30 p-4 text-sm text-rose-300">
          No se pudo cargar el inventario: {loadError}. Revisá las políticas RLS y que existan las tablas <code>devices</code> y <code>products</code>.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por modelo, IMEI o Serie..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="erp-input pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="erp-select w-full sm:w-44"
        >
          <option value="Todos">Todos los estados</option>
          <option value="Disponible">Disponible</option>
          <option value="Reservado">Reservado</option>
          <option value="Vendido">Vendido</option>
          <option value="En reparación">En reparación</option>
        </select>
        <button onClick={fetchDevices} className="btn-ghost" title="Recargar">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Table */}
      <div className="erp-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">Modelo</th>
                <th className="erp-th">IMEI / Serie</th>
                <th className="erp-th">Batería</th>
                <th className="erp-th">Estado</th>
                <th className="erp-th">Costo</th>
                <th className="erp-th">Precio Sug.</th>
                <th className="erp-th text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="erp-td text-center text-slate-500 py-10">Cargando inventario...</td></tr>
              ) : filteredDevices.length === 0 ? (
                <tr><td colSpan={7} className="erp-td text-center text-slate-500 py-10">No se encontraron equipos.</td></tr>
              ) : (
                filteredDevices.map((device) => (
                  <tr key={device.id} className="erp-tr">
                    <td className="erp-td">
                      <div className="font-semibold text-white text-sm">{device.products?.model || 'Sin modelo'} {device.products?.capacity}</div>
                      <div className="text-xs text-slate-500">{device.products?.color} · {device.condition}</div>
                    </td>
                    <td className="erp-td font-mono text-xs">
                      <div className="text-slate-300">IMEI: {device.imei || '—'}</div>
                      <div className="text-slate-500">SN: {device.serial_number || '—'}</div>
                    </td>
                    <td className="erp-td">
                      <span className={`${(device.battery_health ?? 0) >= 85 ? 'badge-green' :
                        (device.battery_health ?? 0) >= 80 ? 'badge-yellow' : 'badge-red'
                        }`}>{device.battery_health ?? '—'}%</span>
                    </td>
                    <td className="erp-td">
                      <select
                        value={device.status}
                        onChange={(e) => handleStatusChange(device.id, e.target.value)}
                        className={`bg-transparent text-[11px] font-bold rounded-md border px-2 py-1 focus:outline-none cursor-pointer ${
                          norm(device.status) === 'disponible' ? 'text-blue-400 border-blue-500/20 bg-blue-500/10' :
                          norm(device.status) === 'vendido' ? 'text-slate-400 border-white/10 bg-white/5' :
                          'text-amber-400 border-amber-500/20 bg-amber-500/10'}`}
                      >
                        {['Disponible', 'Reservado', 'Vendido', 'En reparación'].map((st) => (
                          <option key={st} value={st} className="bg-[#121216] text-white">{st}</option>
                        ))}
                      </select>
                    </td>
                    <td className="erp-td font-mono text-slate-300">${Number(device.cost_usd || 0).toFixed(2)}</td>
                    <td className="erp-td font-mono font-semibold text-white">${Number(device.suggested_price_usd || 0).toFixed(2)}</td>
                    <td className="erp-td text-right">
                      <button onClick={() => handleDelete(device.id)} className="btn-ghost" title="Eliminar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="erp-modal-overlay">
          <div className="erp-modal max-w-xl">
            <div className="erp-modal-header">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-slate-400" /> Ingresar Nuevo Equipo
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="btn-ghost"><span className="text-xl">×</span></button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="erp-modal-body">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="erp-label">Modelo</label>
                    <input type="text" required value={formData.model} onChange={(e) => setFormData({ ...formData, model: e.target.value })} className="erp-input" placeholder="iPhone 13 Pro" />
                  </div>
                  <div>
                    <label className="erp-label">Capacidad</label>
                    <input type="text" required value={formData.capacity} onChange={(e) => setFormData({ ...formData, capacity: e.target.value })} className="erp-input" placeholder="128GB" />
                  </div>
                  <div>
                    <label className="erp-label">Color</label>
                    <input type="text" required value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="erp-input" placeholder="Negro" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="erp-label">IMEI</label>
                    <input type="text" value={formData.imei} onChange={(e) => setFormData({ ...formData, imei: e.target.value })} className="erp-input font-mono" placeholder="15 dígitos" />
                  </div>
                  <div>
                    <label className="erp-label">N° Serie</label>
                    <input type="text" value={formData.serial_number} onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })} className="erp-input font-mono" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="erp-label">Batería %</label>
                    <input type="number" min="0" max="100" required value={formData.battery_health} onChange={(e) => setFormData({ ...formData, battery_health: Number(e.target.value) })} className="erp-input" />
                  </div>
                  <div>
                    <label className="erp-label">Condición</label>
                    <select value={formData.condition} onChange={(e) => setFormData({ ...formData, condition: e.target.value })} className="erp-select">
                      <option>Nuevo</option><option>Usado</option><option>Reacondicionado</option>
                    </select>
                  </div>
                  <div>
                    <label className="erp-label">Estado</label>
                    <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="erp-select">
                      <option>Disponible</option><option>Reservado</option><option>En reparación</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="erp-label">Costo (USD)</label>
                    <input type="number" step="0.01" required value={formData.cost_usd} onChange={(e) => setFormData({ ...formData, cost_usd: Number(e.target.value) })} className="erp-input" />
                  </div>
                  <div>
                    <label className="erp-label">Precio Sugerido (USD)</label>
                    <input type="number" step="0.01" required value={formData.suggested_price_usd} onChange={(e) => setFormData({ ...formData, suggested_price_usd: Number(e.target.value) })} className="erp-input" />
                  </div>
                </div>
              </div>
              <div className="erp-modal-footer">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Guardando...' : 'Guardar Equipo'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}