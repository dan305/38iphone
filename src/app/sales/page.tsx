'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ShoppingCart, Plus, Search, RefreshCw, Trash2, DollarSign, UserPlus, X } from 'lucide-react';

interface Customer {
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
  model?: string;
  name?: string;
  capacity?: string | null;
  color?: string | null;
  imei?: string | null;
  serial_number?: string | null;
  suggested_price_usd?: number | null;
  cost_usd?: number | null;
  status?: string;
  products?: Product | null;
}

interface Sale {
  id: string;
  created_at: string;
  total_usd: number;
  payment_method: string;
  notes: string | null;
  customers: { name: string } | null;
  sale_items: {
    price_usd: number;
    devices: Device | null;
  }[];
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableDevices, setAvailableDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Nuevo Cliente Inline
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) return;
    setSavingCustomer(true);
    try {
      const { data, error } = await supabase.from('customers').insert({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || null,
      }).select('id, name').single();
      if (error) throw error;
      // Agregar a la lista y seleccionarlo automáticamente
      setCustomers(prev => [...prev, data]);
      setSelectedCustomer(data.id);
      setShowNewCustomer(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
    } catch (e: any) {
      alert('Error al crear cliente: ' + e.message);
    } finally {
      setSavingCustomer(false);
    }
  };

  // Form State
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [salePriceUsd, setSalePriceUsd] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Efectivo USD');
  const [notes, setNotes] = useState('');

  const fetchData = async () => {
    setLoading(true);

    // 1. Cargar Clientes
    try {
      const { data: custData } = await supabase
        .from('customers')
        .select('id, name')
        .order('name', { ascending: true });
      if (custData) setCustomers(custData);
    } catch (err: any) {
      console.error('Error al cargar clientes:', err.message);
    }

    // 2. Cargar Equipos y Catálogo de Productos
    let allDevicesWithProducts: Device[] = [];
    try {
      const { data: devData, error: devErr } = await supabase
        .from('devices')
        .select('*');

      if (devErr) throw devErr;

      const { data: prodData } = await supabase
        .from('products')
        .select('*');

      allDevicesWithProducts = (devData || []).map((dev) => {
        const prod = (prodData || []).find((p) => p.id === dev.product_id);
        return {
          ...dev,
          products: prod || null,
        };
      });

      const available = allDevicesWithProducts.filter(
        (d) => !d.status || d.status.trim().toLowerCase() === 'disponible'
      );
      setAvailableDevices(available);
    } catch (err: any) {
      console.error('Error al cargar stock disponible:', err.message);
    }

    // 3. Cargar Historial de Ventas
    try {
      const { data: salesData, error: salesErr } = await supabase
        .from('sales')
        .select('id, created_at, total_usd, payment_method, notes, customers ( name )')
        .order('created_at', { ascending: false });

      if (salesErr) throw salesErr;

      const { data: itemsData } = await supabase
        .from('sale_items')
        .select('*');

      const formattedSales = (salesData || []).map((sale) => {
        const saleItems = (itemsData || [])
          .filter((item) => item.sale_id === sale.id)
          .map((item) => {
            const device = allDevicesWithProducts.find((d) => d.id === item.device_id);
            return {
              price_usd: item.price_usd,
              devices: device || null,
            };
          });

        return {
          ...sale,
          sale_items: saleItems,
        };
      });

      setSales(formattedSales as any);
    } catch (err: any) {
      console.error('Error al cargar ventas:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeviceSelect = (deviceId: string) => {
    setSelectedDevice(deviceId);
    const device = availableDevices.find((d) => d.id === deviceId);
    if (device) {
      const price = device.suggested_price_usd ?? device.cost_usd;
      if (price !== undefined && price !== null) {
        setSalePriceUsd(price.toString());
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!selectedDevice || !salePriceUsd) {
      alert('Debes seleccionar un equipo e ingresar el precio de venta.');
      return;
    }

    const price = parseFloat(salePriceUsd);
    if (Number.isNaN(price) || price <= 0) {
      alert('El precio de venta debe ser mayor a 0.');
      return;
    }

    setSaving(true);
    let saleId: string | null = null;
    let warrantyId: string | null = null;
    let markedSold = false;

    const rollback = async () => {
      try {
        if (warrantyId) await supabase.from('warranties').delete().eq('id', warrantyId);
        if (saleId) {
          await supabase.from('sale_items').delete().eq('sale_id', saleId);
          await supabase.from('sales').delete().eq('id', saleId);
        }
        if (markedSold) await supabase.from('devices').update({ status: 'Disponible' }).eq('id', selectedDevice);
      } catch (rbErr) {
        console.error('Error al deshacer la venta:', rbErr);
      }
    };

    try {
      const device = availableDevices.find((d) => d.id === selectedDevice);
      const unitCost = device?.cost_usd || 0;
      const profit = price - unitCost;

      // 0. Verificar que el equipo siga disponible
      const { data: freshDev, error: freshErr } = await supabase
        .from('devices')
        .select('id, status')
        .eq('id', selectedDevice)
        .single();
      if (freshErr) throw freshErr;
      if (freshDev?.status && freshDev.status.trim().toLowerCase() !== 'disponible') {
        throw new Error('Ese equipo ya no está disponible en el stock.');
      }

      // 1. Insertar la venta principal
      const { data: saleData, error: saleErr } = await supabase
        .from('sales')
        .insert({
          customer_id: selectedCustomer || null,
          total_usd: price,
          payment_method: paymentMethod,
          notes: notes || null,
        })
        .select()
        .single();

      if (saleErr) throw saleErr;
      saleId = saleData.id;

      // 2. Insertar el ítem de la venta
      const { error: itemErr } = await supabase.from('sale_items').insert({
        sale_id: saleData.id,
        device_id: selectedDevice,
        sale_price_usd: price,
        price_usd: price,
        unit_cost_usd: unitCost,
        profit_usd: profit,
      });

      if (itemErr) throw itemErr;

      // 3. Actualizar el estado del equipo a "Vendido"
      const { data: updatedRows, error: deviceErr } = await supabase
        .from('devices')
        .update({ status: 'Vendido' })
        .eq('id', selectedDevice)
        .select('id');

      if (deviceErr) throw deviceErr;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('No se pudo actualizar el estado del equipo (revisá los permisos de la base).');
      }
      markedSold = true;

      // 4. CREAR GARANTÍA AUTOMÁTICA DE 30 DÍAS (fecha local exacta)
      const today = new Date();
      const startDateStr = today.toLocaleDateString('en-CA'); // YYYY-MM-DD local

      const expDate = new Date(today);
      expDate.setDate(expDate.getDate() + 30);
      const expDateStr = expDate.toLocaleDateString('en-CA');

      const deviceName = `${device?.products?.model || device?.model || 'iPhone'} ${device?.products?.capacity || ''}`.trim();
      const imeiOrSn = device?.imei || device?.serial_number || null;

      const { data: warData, error: warrantyErr } = await supabase
        .from('warranties')
        .insert({
          customer_id: selectedCustomer || null,
          device_id: selectedDevice,
          device_info: deviceName,
          imei_or_sn: imeiOrSn,
          issue_description: 'Garantía oficial de 30 días generada automáticamente tras la compra',
          coverage_days: 30,
          start_date: startDateStr,
          expiration_date: expDateStr,
          end_date: expDateStr,
          status: 'Vigente',
        })
        .select('id')
        .single();

      if (warrantyErr) throw new Error(`No se pudo generar la garantía: ${warrantyErr.message}`);
      warrantyId = warData.id;

      setIsModalOpen(false);
      setSelectedCustomer('');
      setSelectedDevice('');
      setSalePriceUsd('');
      setPaymentMethod('Efectivo USD');
      setNotes('');
      await fetchData();
      alert('¡Venta realizada y Garantía de 30 días emitida correctamente!');
    } catch (err: any) {
      await rollback();
      alert(`Error al procesar la venta (no se guardó nada):\n${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Eliminar una venta = devolver el equipo al stock y borrar su garantía automática
  const handleDelete = async (saleId: string) => {
    if (
      !confirm(
        '¿Deseas eliminar esta venta?\n\nEl equipo vuelve al stock como Disponible y se elimina su garantía.'
      )
    )
      return;
    try {
      const { data: items, error: itemsErr } = await supabase
        .from('sale_items')
        .select('device_id')
        .eq('sale_id', saleId);
      if (itemsErr) throw itemsErr;

      const deviceIds = (items || []).map((i) => i.device_id).filter(Boolean) as string[];

      if (deviceIds.length > 0) {
        const { error: warErr } = await supabase.from('warranties').delete().in('device_id', deviceIds);
        if (warErr) throw warErr;
      }

      const { error: delItemsErr } = await supabase.from('sale_items').delete().eq('sale_id', saleId);
      if (delItemsErr) throw delItemsErr;

      const { error } = await supabase.from('sales').delete().eq('id', saleId);
      if (error) throw error;

      if (deviceIds.length > 0) {
        const { error: devErr } = await supabase
          .from('devices')
          .update({ status: 'Disponible' })
          .in('id', deviceIds);
        if (devErr) throw devErr;
      }

      fetchData();
    } catch (err: any) {
      alert(`Error al eliminar venta: ${err.message}`);
    }
  };

  const filteredSales = sales.filter(
    (s) =>
      s.customers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.payment_method?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.sale_items?.some((i) => {
        const deviceName = i.devices?.products?.model || i.devices?.model || i.devices?.name || '';
        const imei = i.devices?.imei || '';
        const sn = i.devices?.serial_number || '';
        return (
          deviceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          imei.toLowerCase().includes(searchTerm.toLowerCase()) ||
          sn.toLowerCase().includes(searchTerm.toLowerCase())
        );
      })
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-emerald-400" />
            Registro de Ventas
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Historial de salidas, facturación y emisión de garantías automáticas (30 días)
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold px-4 py-2.5 rounded-lg transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          Nueva Venta
        </button>
      </div>

      <div className="flex items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por cliente, modelo, IMEI, N° de serie o método de pago..."
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

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/80 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Equipo Vendido</th>
                <th className="px-6 py-4">IMEI / N° Serie</th>
                <th className="px-6 py-4">Método de Pago</th>
                <th className="px-6 py-4 text-right">Total (USD)</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Cargando historial de ventas...
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    No hay ventas registradas.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const item = sale.sale_items?.[0];
                  const device = item?.devices;
                  const deviceModel = device?.products?.model || device?.model || device?.name || 'Equipo';
                  const capacity = device?.products?.capacity || device?.capacity || '';
                  const color = device?.products?.color || device?.color || '';

                  return (
                    <tr key={sale.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {new Date(sale.created_at).toLocaleDateString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-6 py-4 font-medium text-white">
                        {sale.customers?.name || <span className="text-slate-500 font-normal">Cliente Anónimo</span>}
                      </td>
                      <td className="px-6 py-4 text-slate-300">
                        {device ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-200">
                              {deviceModel} {capacity}
                            </span>
                            {color && <span className="text-xs text-slate-400">{color}</span>}
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">
                        {device ? (
                          <div className="space-y-0.5">
                            <div className="text-emerald-400 font-medium">
                              IMEI: {device.imei || 'Sin registrar'}
                            </div>
                            <div className="text-slate-500 text-[11px]">
                              SN: {device.serial_number || 'S/N'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <span className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 font-medium border border-slate-700/60">
                          {sale.payment_method || 'Efectivo USD'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-400 font-mono text-base">
                        ${sale.total_usd ? sale.total_usd.toFixed(2) : '0.00'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(sale.id)}
                          className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                          title="Eliminar registro"
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

      {/* Modal Nueva Venta */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-400" />
                Registrar Nueva Venta
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white text-xl">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-400">Cliente</label>
                  <button
                    type="button"
                    onClick={() => setShowNewCustomer(!showNewCustomer)}
                    className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    <UserPlus className="w-3 h-3" />
                    {showNewCustomer ? 'Cancelar' : 'Nuevo cliente'}
                  </button>
                </div>

                {showNewCustomer ? (
                  <div className="bg-slate-950 border border-purple-500/30 rounded-lg p-3 space-y-2">
                    <p className="text-[10px] text-purple-400 font-semibold uppercase tracking-widest">Registrar nuevo cliente</p>
                    <input
                      type="text"
                      placeholder="Nombre completo *"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 placeholder:text-slate-600"
                    />
                    <input
                      type="text"
                      placeholder="Teléfono (opcional)"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 placeholder:text-slate-600"
                    />
                    <button
                      type="button"
                      onClick={handleCreateCustomer}
                      disabled={savingCustomer || !newCustomerName.trim()}
                      className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      {savingCustomer ? 'Guardando...' : 'Guardar y seleccionar'}
                    </button>
                  </div>
                ) : (
                  <select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Cliente Anónimo / Opcional --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Equipo Disponible *</label>
                <select
                  required
                  value={selectedDevice}
                  onChange={(e) => handleDeviceSelect(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                >
                  <option value="">-- Seleccionar Equipo del Stock --</option>
                  {availableDevices.map((d) => {
                    const modelName = d.products?.model || d.model || d.name || 'iPhone';
                    const capacity = d.products?.capacity || d.capacity || '';
                    const color = d.products?.color || d.color ? ` (${d.products?.color || d.color})` : '';
                    const sn = d.serial_number || d.imei || 'S/D';
                    const labelPrice = d.suggested_price_usd ?? d.cost_usd ?? 0;
                    return (
                      <option key={d.id} value={d.id}>
                        {modelName} {capacity}{color} - S/N: {sn} [{labelPrice} USD]
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Precio Final (USD) *</label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={salePriceUsd}
                      onChange={(e) => setSalePriceUsd(e.target.value)}
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
                <label className="block text-xs font-medium text-slate-400 mb-1">Notas / Observaciones</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="Se generará la garantía de 30 días de forma automática."
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
                  disabled={availableDevices.length === 0 || saving}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 rounded-lg text-sm font-semibold transition-colors"
                >
                  {saving ? 'Procesando...' : 'Confirmar Venta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}