'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ArrowLeftRight, Plus, Search, RefreshCw, Trash2, UserPlus, Package } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
}

interface Device {
  id: string;
  model?: string;
  name?: string;
  capacity?: string | null;
  color?: string | null;
  imei?: string | null;
  suggested_price_usd?: number | null;
  cost_usd?: number | null;
  status?: string;
  products?: { model?: string; capacity?: string } | null;
}

interface TradeInRecord {
  id: string;
  created_at: string;
  incoming_device_model: string;
  incoming_valuation_usd: number;
  outgoing_price_usd: number;
  difference_to_pay_usd: number;
  payment_method: string;
  notes: string | null;
  customer_name?: string;
}

export default function TradeInPage() {
  const [records, setRecords] = useState<TradeInRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableDevices, setAvailableDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modal cliente rápido
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');

  // Form State Canje
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [outgoingDevice, setOutgoingDevice] = useState('');
  const [outgoingPrice, setOutgoingPrice] = useState('');
  
  // Usado que entra
  const [incomingModel, setIncomingModel] = useState('');
  const [incomingCapacity, setIncomingCapacity] = useState('128GB');
  const [incomingColor, setIncomingColor] = useState('');
  const [incomingBattery, setIncomingBattery] = useState('85%');
  const [incomingImei, setIncomingImei] = useState('');
  const [incomingValuation, setIncomingValuation] = useState('');
  const [incomingSuggestedPrice, setIncomingSuggestedPrice] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Efectivo USD');
  const [notes, setNotes] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: custData } = await supabase.from('customers').select('id, name, phone').order('name');
      setCustomers(custData || []);

      const { data: devData } = await supabase.from('devices').select('*, products ( model, capacity )');
      if (devData) {
        const available = devData.filter((d) => !d.status || d.status.trim().toLowerCase() === 'disponible');
        setAvailableDevices(available);
      }

      const { data: tradeData, error: tradeErr } = await supabase
        .from('trade_ins')
        .select('*')
        .order('created_at', { ascending: false });

      if (tradeErr) {
        console.error('Error al cargar canjes:', tradeErr.message);
        setRecords([]);
        return;
      }

      const formattedRecords = (tradeData || []).map((t: any) => {
        let custName = 'Cliente General';
        if (t.notes && t.notes.includes('Cliente:')) {
          const extracted = t.notes.split('Cliente:')[1]?.split('|')[0]?.trim();
          if (extracted) custName = extracted;
        }

        let outPrice = Number(t.outgoing_price_usd || t.price_usd || t.total_usd || 0);
        let inVal = Number(t.incoming_valuation_usd || t.valuation_usd || 0);
        let diffPay = Number(t.difference_to_pay_usd || t.difference_usd || 0);

        if (outPrice === 0 && t.notes && t.notes.includes('Se llevó:')) {
          try {
            const match = t.notes.match(/\$([0-9]+\.[0-9]+|\d+)/g);
            if (match && match.length >= 3) {
              inVal = parseFloat(match[0].replace('$', ''));
              outPrice = parseFloat(match[1].replace('$', ''));
              diffPay = parseFloat(match[2].replace('$', ''));
            }
          } catch (e) {}
        }

        if (diffPay === 0 && outPrice > 0) {
          diffPay = outPrice - inVal;
        }

        return {
          id: t.id,
          created_at: t.created_at,
          incoming_device_model: t.incoming_device_model || t.incoming_model || 'iPhone Usado',
          incoming_valuation_usd: inVal,
          outgoing_price_usd: outPrice,
          difference_to_pay_usd: diffPay,
          payment_method: t.payment_method || 'Efectivo USD',
          notes: t.notes || '',
          customer_name: custName,
        };
      });

      setRecords(formattedRecords);
    } catch (err: any) {
      console.error('Error al cargar datos:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleQuickCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName) return;
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert({ name: newClientName, phone: newClientPhone || null })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setCustomers([...customers, data]);
        setSelectedCustomer(data.id);
      }
      setIsNewClientModalOpen(false);
      setNewClientName('');
      setNewClientPhone('');
    } catch (err: any) {
      alert(`Error al crear cliente: ${err.message}`);
    }
  };

  const handleOutgoingSelect = (devId: string) => {
    setOutgoingDevice(devId);
    const dev = availableDevices.find((d) => d.id === devId);
    if (dev) {
      const price = dev.suggested_price_usd ?? dev.cost_usd ?? 0;
      setOutgoingPrice(price.toString());
    }
  };

  const outPriceNum = parseFloat(outgoingPrice) || 0;
  const inValNum = parseFloat(incomingValuation) || 0;
  const differenceNum = outPriceNum - inValNum;

  // ---------- Utilidades de fecha (hora local, formato YYYY-MM-DD) ----------
  const localDateStr = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toLocaleDateString('en-CA');
  };

  // Lee una referencia guardada en las notas: [ref:sale=ID;in=ID;out=ID;war=ID]
  const readRef = (notesText: string | null | undefined, key: string): string | null => {
    if (!notesText) return null;
    const m = notesText.match(new RegExp(`${key}=([^;\\]]+)`));
    return m ? m[1].trim() : null;
  };

  const resetForm = () => {
    setSelectedCustomer('');
    setOutgoingDevice('');
    setOutgoingPrice('');
    setIncomingModel('');
    setIncomingCapacity('128GB');
    setIncomingColor('');
    setIncomingBattery('85%');
    setIncomingImei('');
    setIncomingValuation('');
    setIncomingSuggestedPrice('');
    setPaymentMethod('Efectivo USD');
    setNotes('');
  };

  // ---------- PLAN CANJE: todo automático ----------
  // 1) El usado que entra se suma al stock (Disponible)
  // 2) El equipo que se lleva el cliente se baja del stock (Vendido)
  // 3) Se registra la venta del equipo entregado (con su ítem)
  // 4) Se crea la garantía de 30 días del equipo entregado, ya corriendo desde hoy
  // 5) Se guarda el registro del canje
  // Si algo falla en el medio, se deshace todo para no dejar datos a medias.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!outgoingDevice || !incomingModel.trim() || !incomingValuation || !outgoingPrice) {
      alert('Por favor complete los campos obligatorios del canje.');
      return;
    }
    if (outPriceNum <= 0 || inValNum < 0) {
      alert('Revisá los montos: el precio de venta debe ser mayor a 0 y el valor del usado no puede ser negativo.');
      return;
    }
    if (
      differenceNum < 0 &&
      !confirm(
        `El usado vale $${Math.abs(differenceNum).toFixed(2)} más que el equipo que se lleva el cliente. ` +
          `Habría que devolverle esa diferencia. ¿Continuar igual?`
      )
    ) {
      return;
    }

    setSaving(true);

    const created: {
      incomingDeviceId: string | null;
      saleId: string | null;
      warrantyId: string | null;
    } = { incomingDeviceId: null, saleId: null, warrantyId: null };
    let outgoingMarkedSold = false;

    const rollback = async () => {
      try {
        if (created.warrantyId) {
          await supabase.from('warranties').delete().eq('id', created.warrantyId);
        }
        if (created.saleId) {
          await supabase.from('sale_items').delete().eq('sale_id', created.saleId);
          await supabase.from('sales').delete().eq('id', created.saleId);
        }
        if (outgoingMarkedSold) {
          await supabase.from('devices').update({ status: 'Disponible' }).eq('id', outgoingDevice);
        }
        if (created.incomingDeviceId) {
          await supabase.from('devices').delete().eq('id', created.incomingDeviceId);
        }
      } catch (rbErr) {
        console.error('Error al deshacer el canje:', rbErr);
      }
    };

    try {
      const custObj = customers.find((c) => c.id === selectedCustomer);
      const custNameStr = custObj ? custObj.name : 'Cliente General';
      const devObj = availableDevices.find((d) => d.id === outgoingDevice);
      if (!devObj) throw new Error('No se encontró el equipo seleccionado en el stock.');

      const devModel = devObj.products?.model || devObj.model || 'iPhone';
      const devCapacity = devObj.products?.capacity || devObj.capacity || '';
      const devNameStr = `${devModel} ${devCapacity}`.trim();
      const devCost = Number(devObj.cost_usd || 0);

      // 0. Verificar que el equipo siga disponible (por si se vendió en otra pestaña)
      const { data: freshDev, error: freshErr } = await supabase
        .from('devices')
        .select('id, status')
        .eq('id', outgoingDevice)
        .single();
      if (freshErr) throw freshErr;
      if (freshDev?.status && freshDev.status.trim().toLowerCase() !== 'disponible') {
        throw new Error('El equipo seleccionado ya no está disponible en el stock.');
      }

      const modelClean = incomingModel.trim();
      const colorClean = incomingColor.trim() || 'N/A';
      const imeiClean = incomingImei.trim() || null;
      const fullIncomingModelStr = `${modelClean} ${incomingCapacity} (Color: ${colorClean}, Batería: ${incomingBattery}, IMEI: ${imeiClean || 'N/A'})`;

      // 1. USADO QUE ENTRA -> buscar/crear producto y sumarlo al stock
      let incomingProductId = '';
      const { data: existingProd, error: prodSearchErr } = await supabase
        .from('products')
        .select('id')
        .eq('model', modelClean)
        .eq('capacity', incomingCapacity)
        .eq('color', colorClean)
        .limit(1);
      if (prodSearchErr) throw prodSearchErr;

      if (existingProd && existingProd.length > 0) {
        incomingProductId = existingProd[0].id;
      } else {
        const { data: newProd, error: newProdErr } = await supabase
          .from('products')
          .insert({ brand: 'Apple', model: modelClean, capacity: incomingCapacity, color: colorClean })
          .select('id')
          .single();
        if (newProdErr) throw newProdErr;
        incomingProductId = newProd.id;
      }

      const batteryParsed = parseInt(incomingBattery.replace(/[^0-9]/g, ''), 10);
      const batteryHealth = Number.isNaN(batteryParsed) ? 85 : Math.min(100, Math.max(0, batteryParsed));
      const finalSuggested = parseFloat(incomingSuggestedPrice) || Math.round(inValNum * 1.25 * 100) / 100;

      const { data: newDevice, error: newDevErr } = await supabase
        .from('devices')
        .insert({
          product_id: incomingProductId,
          imei: imeiClean,
          serial_number: null,
          battery_health: batteryHealth,
          condition: 'Usado',
          cost_usd: inValNum,
          suggested_price_usd: finalSuggested,
          status: 'Disponible',
        })
        .select('id')
        .single();
      if (newDevErr) throw new Error(`No se pudo ingresar el usado al stock: ${newDevErr.message}`);
      created.incomingDeviceId = newDevice.id;

      // 2. VENTA del equipo entregado (queda registrada en Ventas)
      const obsText = notes.trim() ? ` | Obs: ${notes.trim()}` : '';
      const saleNotes = `Plan Canje - Tomó usado: ${fullIncomingModelStr} (Valuado: $${inValNum}) | Diferencia: $${differenceNum} | Garantía: 30 Días${obsText}`;

      const { data: saleData, error: saleErr } = await supabase
        .from('sales')
        .insert({
          customer_id: selectedCustomer || null,
          total_usd: outPriceNum,
          payment_method: paymentMethod,
          notes: saleNotes,
        })
        .select('id')
        .single();
      if (saleErr) throw new Error(`No se pudo registrar la venta: ${saleErr.message}`);
      created.saleId = saleData.id;

      const { error: itemErr } = await supabase.from('sale_items').insert({
        sale_id: saleData.id,
        device_id: outgoingDevice,
        sale_price_usd: outPriceNum,
        price_usd: outPriceNum,
        unit_cost_usd: devCost,
        profit_usd: outPriceNum - devCost,
      });
      if (itemErr) throw new Error(`No se pudo registrar el ítem de la venta: ${itemErr.message}`);

      // 3. BAJAR del stock el equipo entregado
      const { data: updatedRows, error: soldErr } = await supabase
        .from('devices')
        .update({ status: 'Vendido' })
        .eq('id', outgoingDevice)
        .select('id');
      if (soldErr) throw new Error(`No se pudo marcar el equipo como vendido: ${soldErr.message}`);
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('No se pudo actualizar el estado del equipo entregado (revisá los permisos de la base).');
      }
      outgoingMarkedSold = true;

      // 4. GARANTÍA de 30 días del equipo entregado, arranca hoy
      const startStr = localDateStr(0);
      const expStr = localDateStr(30);
      const { data: warData, error: warErr } = await supabase
        .from('warranties')
        .insert({
          customer_id: selectedCustomer || null,
          device_id: outgoingDevice,
          device_info: devNameStr,
          imei_or_sn: devObj.imei || null,
          issue_description: 'Garantía oficial de 30 días generada automáticamente (Plan Canje)',
          coverage_days: 30,
          start_date: startStr,
          expiration_date: expStr,
          end_date: expStr,
          status: 'Vigente',
        })
        .select('id')
        .single();
      if (warErr) throw new Error(`No se pudo generar la garantía: ${warErr.message}`);
      created.warrantyId = warData.id;

      // 5. REGISTRO del canje (con referencias para poder revertirlo después)
      const refTag = `[ref:sale=${created.saleId};in=${created.incomingDeviceId};out=${outgoingDevice};war=${created.warrantyId}]`;
      const summaryNote =
        `Cliente: ${custNameStr} | Entregó Usado: ${fullIncomingModelStr} (Valuado: $${inValNum}) | ` +
        `Se llevó: ${devNameStr} ($${outPriceNum}) | Diferencia: $${differenceNum} (${paymentMethod}) | Garantía: 30 Días${obsText} ${refTag}`;

      const { error: tradeErr } = await supabase.from('trade_ins').insert({
        incoming_device_model: fullIncomingModelStr,
        incoming_valuation_usd: inValNum,
        outgoing_price_usd: outPriceNum,
        difference_to_pay_usd: differenceNum,
        payment_method: paymentMethod,
        notes: summaryNote,
      });

      if (tradeErr) {
        // Si la tabla no tiene esas columnas, guardamos todo en las notas
        const { error: tradeErr2 } = await supabase.from('trade_ins').insert({ notes: summaryNote });
        if (tradeErr2) throw new Error(`No se pudo guardar el registro del canje: ${tradeErr2.message}`);
      }

      setIsModalOpen(false);
      resetForm();
      await fetchData();

      alert(
        '¡Plan Canje completado!\n\n' +
          '• Venta registrada en Ventas\n' +
          '• Equipo entregado marcado como Vendido (baja del stock)\n' +
          '• Usado recibido ingresado al stock como Disponible\n' +
          `• Garantía de 30 días activa hasta el ${new Date(expStr + 'T00:00:00').toLocaleDateString('es-AR')}`
      );
    } catch (err: any) {
      await rollback();
      alert(`Error al procesar el canje (no se guardó nada):\n${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Eliminar un canje = revertirlo completo (si tiene referencias guardadas)
  const handleDelete = async (id: string) => {
    const rec = records.find((r) => r.id === id);
    const saleId = readRef(rec?.notes, 'sale');
    const incomingId = readRef(rec?.notes, 'in');
    const outgoingId = readRef(rec?.notes, 'out');
    const warrantyId = readRef(rec?.notes, 'war');
    const hasRefs = !!(saleId || incomingId || outgoingId || warrantyId);

    const msg = hasRefs
      ? 'Se va a REVERTIR este canje completo:\n\n• El equipo entregado vuelve al stock como Disponible\n• Se elimina la venta y su garantía\n• El usado recibido sale del stock\n\n¿Deseas continuar?'
      : 'Este canje es anterior a la conexión automática, así que solo se borra el registro del historial (la venta, el stock y la garantía no se tocan). ¿Continuar?';
    if (!confirm(msg)) return;

    try {
      if (hasRefs) {
        // No se puede revertir si el usado ya se vendió
        if (incomingId) {
          const { data: inDev } = await supabase.from('devices').select('id, status').eq('id', incomingId).maybeSingle();
          if (inDev && inDev.status && inDev.status.trim().toLowerCase() !== 'disponible') {
            alert('No se puede revertir: el usado recibido ya no está Disponible (se vendió o está reservado/en reparación).');
            return;
          }
        }

        if (warrantyId) {
          const { error } = await supabase.from('warranties').delete().eq('id', warrantyId);
          if (error) throw error;
        }
        if (saleId) {
          const { error: e1 } = await supabase.from('sale_items').delete().eq('sale_id', saleId);
          if (e1) throw e1;
          const { error: e2 } = await supabase.from('sales').delete().eq('id', saleId);
          if (e2) throw e2;
        }
        if (outgoingId) {
          const { error } = await supabase.from('devices').update({ status: 'Disponible' }).eq('id', outgoingId);
          if (error) throw error;
        }
        if (incomingId) {
          const { error } = await supabase.from('devices').delete().eq('id', incomingId);
          if (error) throw error;
        }
      }

      const { error } = await supabase.from('trade_ins').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  const filteredRecords = records.filter(
    (r) =>
      (r.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.incoming_device_model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.notes || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-emerald-400" />
            Plan Canje (Parte de Pago)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Toma equipos usados, suma el usado a tu Stock, baja el entregado, factura en Ventas y activa la garantía de 30 días automáticamente.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold px-4 py-2.5 rounded-lg transition-colors text-sm shadow-lg shadow-emerald-500/10"
        >
          <Plus className="w-4 h-4" />
          Nuevo Plan Canje
        </button>
      </div>

      <div className="flex items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por cliente, modelo recibido o notas..."
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

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Equipo Entregado (Venta)</th>
                <th className="px-6 py-4">Usado Recibido (Stock)</th>
                <th className="px-6 py-4 text-right">Valor Usado</th>
                <th className="px-6 py-4 text-right">Diferencia Abonada</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    Cargando historial de canjes...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-500">
                    No hay operaciones de Plan Canje registradas.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 text-xs font-mono text-slate-400">
                      {new Date(r.created_at).toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-6 py-4 font-semibold text-white">{r.customer_name}</td>
                    <td className="px-6 py-4 text-slate-300">
                      <span className="font-bold text-emerald-400 font-mono">${r.outgoing_price_usd.toFixed(2)}</span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-200">
                      <div>{r.incoming_device_model}</div>
                      <div className="text-[11px] text-slate-500 font-mono">Pago diferencia: {r.payment_method}</div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-slate-300">
                      -${r.incoming_valuation_usd.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right font-bold font-mono text-emerald-400 text-base">
                      ${r.difference_to_pay_usd.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                        title="Eliminar"
                      >
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

      {/* Modal Principal Canje */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl p-6 space-y-6 shadow-2xl my-8">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-emerald-400" />
                Registrar Nuevo Plan Canje
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white text-xl">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-medium text-slate-400">Cliente</label>
                  <button
                    type="button"
                    onClick={() => setIsNewClientModalOpen(true)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> + Nuevo cliente
                  </button>
                </div>
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

              {/* 1. Equipo que se lleva */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                <div className="sm:col-span-2">
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">1. Equipo que se lleva el cliente (Va a Ventas, baja del stock y genera Garantía de 30 días)</h4>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Seleccionar Equipo del Stock *</label>
                  <select
                    required
                    value={outgoingDevice}
                    onChange={(e) => handleOutgoingSelect(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Elegir del inventario --</option>
                    {availableDevices.map((d) => {
                      const name = d.products?.model || d.model || 'iPhone';
                      const cap = d.products?.capacity || d.capacity || '';
                      return (
                        <option key={d.id} value={d.id}>
                          {name} {cap} [${d.suggested_price_usd ?? d.cost_usd}]
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Precio de Venta (USD) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={outgoingPrice}
                    onChange={(e) => setOutgoingPrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* 2. Equipo usado que deja (Ingresa al Stock) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                <div className="sm:col-span-3">
                  <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Package className="w-4 h-4" /> 2. Equipo Usado que deja (Ingresa a tu Stock Disponible)
                  </h4>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Modelo *</label>
                  <input
                    type="text"
                    required
                    value={incomingModel}
                    onChange={(e) => setIncomingModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    placeholder="Ej: iPhone 11"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Capacidad *</label>
                  <select
                    value={incomingCapacity}
                    onChange={(e) => setIncomingCapacity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="64GB">64GB</option>
                    <option value="128GB">128GB</option>
                    <option value="256GB">256GB</option>
                    <option value="512GB">512GB</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Color</label>
                  <input
                    type="text"
                    value={incomingColor}
                    onChange={(e) => setIncomingColor(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    placeholder="Ej: Negro / Blanco"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Batería (%)</label>
                  <input
                    type="text"
                    value={incomingBattery}
                    onChange={(e) => setIncomingBattery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="Ej: 85%"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">IMEI / Serie</label>
                  <input
                    type="text"
                    value={incomingImei}
                    onChange={(e) => setIncomingImei(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="Opcional"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Valor Tomado (Costo USD) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={incomingValuation}
                    onChange={(e) => setIncomingValuation(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="0.00"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Precio Sugerido Reventa (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={incomingSuggestedPrice}
                    onChange={(e) => setIncomingSuggestedPrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="Se autocalcula (+25% si se deja vacío)"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Método Pago Diferencia</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Efectivo USD">Efectivo USD</option>
                    <option value="Efectivo ARS">Efectivo ARS</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="USDT / Cripto">USDT / Cripto</option>
                  </select>
                </div>
              </div>

              {/* Resumen Diferencia */}
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex justify-between items-center">
                <div>
                  <div className="text-xs text-emerald-300 font-medium uppercase">Diferencia exacta a abonar:</div>
                  <div className="text-[11px] text-slate-400">Precio equipo - Valor tomado del usado</div>
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-400">
                  ${differenceNum >= 0 ? differenceNum.toFixed(2) : '0.00'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Observaciones</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="Detalles estéticos del usado, etc."
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
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 rounded-lg text-sm font-semibold transition-colors"
                >
                  {saving ? 'Procesando...' : 'Confirmar Plan Canje'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cliente Rápido */}
      {isNewClientModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                Nuevo Cliente Rápido
              </h3>
              <button onClick={() => setIsNewClientModalOpen(false)} className="text-slate-400 hover:text-white text-lg">
                &times;
              </button>
            </div>

            <form onSubmit={handleQuickCreateClient} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nombre y Apellido *</label>
                <input
                  type="text"
                  required
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="Ej: Lucas Gómez"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                  placeholder="11 7639-8561"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewClientModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg text-xs font-semibold"
                >
                  Guardar y Seleccionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}