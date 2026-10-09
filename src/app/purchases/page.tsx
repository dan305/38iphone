'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ShoppingBag, Plus, Search, RefreshCw, Trash2, Truck, DollarSign, Smartphone } from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
}

interface Product {
  id?: string;
  brand?: string;
  model?: string;
  capacity?: string;
  color?: string;
}

interface Device {
  id: string;
  product_id?: string;
  imei?: string | null;
  serial_number?: string | null;
  battery_health?: number | null;
  condition?: string | null;
  cost_usd?: number | null;
  suggested_price_usd?: number | null;
  status?: string;
  products?: Product | null;
}

interface Purchase {
  id: string;
  created_at: string;
  total_usd: number;
  notes: string | null;
  suppliers: { name: string } | null;
  purchase_items: {
    unit_cost_usd: number;
    devices: Device | null;
  }[];
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [notes, setNotes] = useState('');

  // Device Form State
  const [deviceForm, setDeviceForm] = useState({
    model: 'iPhone 13',
    capacity: '128GB',
    color: 'Negro',
    imei: '',
    serial_number: '',
    battery_health: 85,
    condition: 'Usado',
    cost_usd: 400,
    suggested_price_usd: 550,
  });

  const fetchData = async () => {
    setLoading(true);

    // 1. Cargar Proveedores
    try {
      const { data: suppData } = await supabase
        .from('suppliers')
        .select('id, name')
        .order('name', { ascending: true });
      if (suppData) setSuppliers(suppData);
    } catch (err: any) {
      console.error('Error al cargar proveedores:', err.message);
    }

    // 2. Cargar Compras con relación manual
    try {
      const { data: purchData, error: purchErr } = await supabase
        .from('purchases')
        .select('id, created_at, total_usd, notes, suppliers ( name )')
        .order('created_at', { ascending: false });

      if (purchErr) throw purchErr;

      const { data: itemsData } = await supabase
        .from('purchase_items')
        .select('*');

      const { data: devData } = await supabase
        .from('devices')
        .select('*');

      const { data: prodData } = await supabase
        .from('products')
        .select('*');

      // Unir datos en JS
      const formattedPurchases = (purchData || []).map((purch) => {
        const purchItems = (itemsData || [])
          .filter((item) => item.purchase_id === purch.id)
          .map((item) => {
            const dev = (devData || []).find((d) => d.id === item.device_id);
            const prod = dev ? (prodData || []).find((p) => p.id === dev.product_id) : null;
            
            return {
              unit_cost_usd: item.unit_cost_usd,
              devices: dev ? { ...dev, products: prod || null } : null,
            };
          });

        return {
          ...purch,
          purchase_items: purchItems,
        };
      });

      setPurchases(formattedPurchases as any);
    } catch (err: any) {
      console.error('Error al cargar compras:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!deviceForm.model || !deviceForm.cost_usd) {
      alert('Por favor completa el modelo y el costo en USD.');
      return;
    }

    let createdDeviceId: string | null = null;
    let createdPurchaseId: string | null = null;

    try {
      const cost = parseFloat(deviceForm.cost_usd.toString());
      const price = parseFloat(deviceForm.suggested_price_usd.toString());

      // 1. Buscar o Crear Producto
      let productId = '';
      const { data: existingProd } = await supabase
        .from('products')
        .select('id')
        .eq('model', deviceForm.model)
        .eq('capacity', deviceForm.capacity)
        .eq('color', deviceForm.color)
        .limit(1);

      if (existingProd && existingProd.length > 0) {
        productId = existingProd[0].id;
      } else {
        const { data: newProd, error: prodErr } = await supabase
          .from('products')
          .insert({
            brand: 'Apple',
            model: deviceForm.model,
            capacity: deviceForm.capacity,
            color: deviceForm.color,
          })
          .select('id')
          .single();

        if (prodErr) throw prodErr;
        productId = newProd.id;
      }

      // 2. Crear el Equipo en Inventario
      const { data: devData, error: devErr } = await supabase
        .from('devices')
        .insert({
          product_id: productId,
          imei: deviceForm.imei || null,
          serial_number: deviceForm.serial_number || null,
          battery_health: Number(deviceForm.battery_health),
          condition: deviceForm.condition,
          cost_usd: cost,
          suggested_price_usd: price,
          status: 'Disponible',
        })
        .select('id')
        .single();

      if (devErr) throw devErr;
      createdDeviceId = devData.id;

      // 3. Crear Registro de Compra
      const { data: purchData, error: purchErr } = await supabase
        .from('purchases')
        .insert({
          supplier_id: selectedSupplier || null,
          total_usd: cost,
          notes: notes || null,
        })
        .select('id')
        .single();

      if (purchErr) throw purchErr;
      createdPurchaseId = purchData.id;

      // 4. Crear Item de Compra
      const { error: itemErr } = await supabase.from('purchase_items').insert({
        purchase_id: purchData.id,
        device_id: devData.id,
        unit_cost_usd: cost,
      });

      if (itemErr) throw itemErr;

      // Resetear modal
      setIsModalOpen(false);
      setSelectedSupplier('');
      setNotes('');
      setDeviceForm({
        model: 'iPhone 13',
        capacity: '128GB',
        color: 'Negro',
        imei: '',
        serial_number: '',
        battery_health: 85,
        condition: 'Usado',
        cost_usd: 400,
        suggested_price_usd: 550,
      });

      fetchData();
    } catch (err: any) {
      // Deshacer lo que se alcanzó a crear para no dejar stock suelto
      try {
        if (createdPurchaseId) {
          await supabase.from('purchase_items').delete().eq('purchase_id', createdPurchaseId);
          await supabase.from('purchases').delete().eq('id', createdPurchaseId);
        }
        if (createdDeviceId) await supabase.from('devices').delete().eq('id', createdDeviceId);
      } catch (rbErr) {
        console.error('Error al deshacer la compra:', rbErr);
      }
      alert(`Error al registrar la compra (no se guardó nada): ${err.message}`);
    }
  };

  const handleDelete = async (purchaseId: string) => {
    if (
      !confirm(
        '¿Deseas eliminar este registro de compra?\n\nSi el equipo sigue Disponible en el stock, también se quita del inventario.'
      )
    )
      return;
    try {
      const { data: items, error: itemsErr } = await supabase
        .from('purchase_items')
        .select('device_id')
        .eq('purchase_id', purchaseId);
      if (itemsErr) throw itemsErr;

      const deviceIds = (items || []).map((i) => i.device_id).filter(Boolean) as string[];

      // Solo se pueden quitar del stock los equipos que siguen Disponibles (no vendidos)
      let removableIds: string[] = [];
      if (deviceIds.length > 0) {
        const { data: devs } = await supabase.from('devices').select('id, status').in('id', deviceIds);
        removableIds = (devs || [])
          .filter((d) => !d.status || d.status.trim().toLowerCase() === 'disponible')
          .map((d) => d.id);
        if (removableIds.length < deviceIds.length) {
          alert('Atención: algún equipo de esta compra ya fue vendido o está en uso, así que ese equipo se conserva en el inventario.');
        }
      }

      const { error: delItemsErr } = await supabase.from('purchase_items').delete().eq('purchase_id', purchaseId);
      if (delItemsErr) throw delItemsErr;

      const { error } = await supabase.from('purchases').delete().eq('id', purchaseId);
      if (error) throw error;

      if (removableIds.length > 0) {
        const { error: devErr } = await supabase.from('devices').delete().in('id', removableIds);
        if (devErr) throw devErr;
      }

      fetchData();
    } catch (err: any) {
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  const filteredPurchases = purchases.filter(
    (p) =>
      p.suppliers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.purchase_items?.some((i) => {
        const model = i.devices?.products?.model || '';
        const imei = i.devices?.imei || '';
        const sn = i.devices?.serial_number || '';
        return (
          model.toLowerCase().includes(searchTerm.toLowerCase()) ||
          imei.toLowerCase().includes(searchTerm.toLowerCase()) ||
          sn.toLowerCase().includes(searchTerm.toLowerCase())
        );
      })
  );

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-emerald-400" />
            Compras e Ingreso de Stock
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Registro de adquisición de lotes y alta automática de equipos
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold px-4 py-2.5 rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Registrar Compra
        </button>
      </div>

      {/* Buscador */}
      <div className="flex items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por proveedor, modelo, IMEI o N° de serie..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <button
          onClick={fetchData}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
          title="Recargar"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabla de Compras */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Proveedor</th>
                <th className="px-6 py-4">Equipo Ingresado</th>
                <th className="px-6 py-4">IMEI / N° Serie</th>
                <th className="px-6 py-4 text-right">Costo Total (USD)</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Cargando historial de compras...
                  </td>
                </tr>
              ) : filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No hay compras registradas.
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((purch) => {
                  const item = purch.purchase_items?.[0];
                  const device = item?.devices;
                  const prod = device?.products;

                  return (
                    <tr key={purch.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {new Date(purch.created_at).toLocaleDateString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-6 py-4 font-medium text-white flex items-center gap-2">
                        <Truck className="w-4 h-4 text-slate-500" />
                        {purch.suppliers?.name || <span className="text-slate-500 font-normal">Sin proveedor</span>}
                      </td>
                      <td className="px-6 py-4 text-slate-300">
                        {device ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-200">
                              {prod?.model || 'iPhone'} {prod?.capacity || ''}
                            </span>
                            <span className="text-xs text-slate-400">
                              {prod?.color || ''} • Bat: {device.battery_health}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">
                        {device ? (
                          <div className="space-y-0.5">
                            <div className="text-slate-300">
                              IMEI: {device.imei || 'S/D'}
                            </div>
                            <div className="text-slate-500 text-[11px]">
                              SN: {device.serial_number || 'S/N'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-400 font-mono text-base">
                        ${purch.total_usd ? purch.total_usd.toFixed(2) : '0.00'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(purch.id)}
                          className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                          title="Eliminar compra"
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

      {/* Modal Nueva Compra */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-emerald-400" />
                Registrar Compra / Ingreso de Equipo
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white text-xl">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Proveedor</label>
                <select
                  value={selectedSupplier}
                  onChange={(e) => setSelectedSupplier(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Seleccionar Proveedor (Opcional) --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Modelo *</label>
                  <input
                    type="text"
                    required
                    value={deviceForm.model}
                    onChange={(e) => setDeviceForm({ ...deviceForm, model: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    placeholder="Ej: iPhone 13 Pro"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Capacidad *</label>
                  <input
                    type="text"
                    required
                    value={deviceForm.capacity}
                    onChange={(e) => setDeviceForm({ ...deviceForm, capacity: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    placeholder="Ej: 128GB"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Color *</label>
                  <input
                    type="text"
                    required
                    value={deviceForm.color}
                    onChange={(e) => setDeviceForm({ ...deviceForm, color: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    placeholder="Ej: Grafito"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">IMEI</label>
                  <input
                    type="text"
                    value={deviceForm.imei}
                    onChange={(e) => setDeviceForm({ ...deviceForm, imei: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="15 dígitos"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Número de Serie</label>
                  <input
                    type="text"
                    value={deviceForm.serial_number}
                    onChange={(e) => setDeviceForm({ ...deviceForm, serial_number: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="Número de serie"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Batería (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={deviceForm.battery_health}
                    onChange={(e) => setDeviceForm({ ...deviceForm, battery_health: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Condición</label>
                  <select
                    value={deviceForm.condition}
                    onChange={(e) => setDeviceForm({ ...deviceForm, condition: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Nuevo">Nuevo</option>
                    <option value="Usado">Usado</option>
                    <option value="Reacondicionado">Reacondicionado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Costo de Compra (USD) *</label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={deviceForm.cost_usd}
                      onChange={(e) => setDeviceForm({ ...deviceForm, cost_usd: Number(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Precio Sugerido Venta (USD) *</label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={deviceForm.suggested_price_usd}
                      onChange={(e) => setDeviceForm({ ...deviceForm, suggested_price_usd: Number(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Notas / Observaciones</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="Detalles del lote, factura de compra, etc."
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
                  Guardar Compra e Ingresar Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}