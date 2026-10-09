'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Wallet, Users, Plus, Search, RefreshCw, Building2, X, UserPlus, TrendingUp, TrendingDown, Trash2 } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
}

interface Supplier {
  id: string;
  name: string;
}

interface Movement {
  id: string;
  created_at: string;
  person_type: 'customer' | 'supplier';
  person_id: string;
  type: 'debe' | 'pago';
  currency: 'USD' | 'ARS';
  amount: number;
  concept?: string;
}

export default function CuentaCorrientePage() {
  const [activeTab, setActiveTab] = useState<'cuentas' | 'reportes'>('cuentas');
  const [subTab, setSubTab] = useState<'clientes' | 'proveedores'>('clientes');
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal Movimiento
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetType, setTargetType] = useState<'customer' | 'supplier'>('customer');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'ARS'>('USD');
  const [amount, setAmount] = useState('');
  const [movementType, setMovementType] = useState<'debe' | 'pago'>('debe');
  const [concept, setConcept] = useState('');

  // Modal Nuevo Cliente / Proveedor
  const [isNewPersonModalOpen, setIsNewPersonModalOpen] = useState(false);
  const [newPersonType, setNewPersonType] = useState<'customer' | 'supplier'>('customer');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: custData } = await supabase.from('customers').select('*').order('name');
      setCustomers(custData || []);

      const { data: suppData, error: suppErr } = await supabase.from('suppliers').select('*').order('name');
      if (!suppErr) {
        setSuppliers(suppData || []);
      }

      const { data: movData, error: movErr } = await supabase.from('account_movements').select('*').order('created_at', { ascending: false });
      if (!movErr) {
        setMovements(movData || []);
      }
    } catch (err: any) {
      console.error('Error al cargar datos:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Registrar Movimiento (Debe o Pago Parcial)
  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPersonId || !amount) {
      alert('Por favor selecciona una persona e ingresa un monto.');
      return;
    }

    const numAmount = parseFloat(amount) || 0;
    if (numAmount <= 0) {
      alert('El monto debe ser mayor a 0.');
      return;
    }

    try {
      const { error } = await supabase.from('account_movements').insert({
        person_type: targetType,
        person_id: selectedPersonId,
        type: movementType,
        currency: currency,
        amount: numAmount,
        concept: concept || (movementType === 'pago' ? 'Pago parcial / Abono' : 'Deuda registrada')
      });

      if (error) throw error;

      alert('¡Movimiento registrado con éxito! El saldo se actualizó automáticamente.');
      setIsModalOpen(false);
      setSelectedPersonId('');
      setAmount('');
      setConcept('');
      fetchData();
    } catch (err: any) {
      alert(`Error al registrar movimiento: ${err.message}`);
    }
  };

  // Borrar un movimiento individual del historial
  const handleDeleteMovement = async (movementId: string) => {
    if (!confirm('¿Estás seguro de eliminar este movimiento? El saldo se recalculará automáticamente.')) return;

    try {
      const { error } = await supabase.from('account_movements').delete().eq('id', movementId);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Error al eliminar movimiento: ${err.message}`);
    }
  };

  // Saldar cuenta completa de un sólo clic
  const handleSettleAccount = async (personId: string, personType: 'customer' | 'supplier', totalUsd: number, totalArs: number) => {
    if (totalUsd <= 0 && totalArs <= 0) {
      alert('Esta persona ya no tiene saldo pendiente.');
      return;
    }

    if (!confirm('¿Deseas registrar un pago por el total para saldar completamente esta cuenta?')) return;

    try {
      if (totalUsd > 0) {
        const { error } = await supabase.from('account_movements').insert({
          person_type: personType,
          person_id: personId,
          type: 'pago',
          currency: 'USD',
          amount: totalUsd,
          concept: 'Saldar cuenta completa (Pago total)'
        });
        if (error) throw error;
      }

      if (totalArs > 0) {
        const { error } = await supabase.from('account_movements').insert({
          person_type: personType,
          person_id: personId,
          type: 'pago',
          currency: 'ARS',
          amount: totalArs,
          concept: 'Saldar cuenta completa (Pago total)'
        });
        if (error) throw error;
      }

      alert('¡Cuenta saldada con éxito! Quedó en cero.');
      fetchData();
    } catch (err: any) {
      alert(`Error al saldar cuenta: ${err.message}`);
      fetchData();
    }
  };

  const handleCreatePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;

    try {
      if (newPersonType === 'customer') {
        const { error } = await supabase.from('customers').insert({ name: newName, phone: newPhone || null });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('suppliers').insert({ name: newName });
        if (error) throw error;
      }

      alert(`${newPersonType === 'customer' ? 'Cliente' : 'Proveedor'} creado con éxito.`);
      setIsNewPersonModalOpen(false);
      setNewName('');
      setNewPhone('');
      fetchData();
    } catch (err: any) {
      alert(`Error al crear: ${err.message}`);
    }
  };

  // --- CALCULAR SALDOS AUTOMÁTICOS ---
  const getPersonBalance = (personId: string) => {
    const personMovs = movements.filter(m => m.person_id === personId);
    let usd = 0;
    let ars = 0;

    personMovs.forEach(m => {
      const multiplier = m.type === 'debe' ? 1 : -1;
      if (m.currency === 'USD') usd += Number(m.amount) * multiplier;
      if (m.currency === 'ARS') ars += Number(m.amount) * multiplier;
    });

    return { usd: Math.max(0, usd), ars: Math.max(0, ars), movs: personMovs };
  };

  const calculateGlobalTotals = (type: 'customer' | 'supplier') => {
    let usd = 0;
    let ars = 0;
    const people = type === 'customer' ? customers : suppliers;

    people.forEach(p => {
      const bal = getPersonBalance(p.id);
      usd += bal.usd;
      ars += bal.ars;
    });

    return { usd, ars };
  };

  const clientTotals = calculateGlobalTotals('customer');
  const supplierTotals = calculateGlobalTotals('supplier');

  const filteredCustomers = customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredSuppliers = suppliers.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6 text-slate-100 pb-12">
      
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-400" />
            Cuenta Corriente
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Gestión automática de deudas, pagos parciales y saldos en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setNewPersonType('customer'); setIsNewPersonModalOpen(true); }}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-2.5 rounded-xl transition-colors text-xs border border-slate-700 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-emerald-400" /> + Cliente
          </button>
          <button
            onClick={() => { setNewPersonType('supplier'); setIsNewPersonModalOpen(true); }}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-2.5 rounded-xl transition-colors text-xs border border-slate-700 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-blue-400" /> + Proveedor
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm shadow-lg shadow-emerald-500/10 cursor-pointer ml-1"
          >
            <Plus className="w-4 h-4" />
            Registrar Movimiento
          </button>
        </div>
      </div>

      {/* Pestañas Principales */}
      <div className="flex border-b border-slate-800 gap-6">
        <button
          onClick={() => setActiveTab('cuentas')}
          className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'cuentas'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Cuentas y Saldos
        </button>
        <button
          onClick={() => setActiveTab('reportes')}
          className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'reportes'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Reportes y Estadísticas
        </button>
      </div>

      {/* CONTENIDO: CUENTAS */}
      {activeTab === 'cuentas' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setSubTab('clientes')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  subTab === 'clientes'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Clientes ({customers.length})
              </button>
              <button
                onClick={() => setSubTab('proveedores')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  subTab === 'proveedores'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Proveedores ({suppliers.length})
              </button>
            </div>

            <div className="relative w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Buscar por nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Nombre</th>
                    <th className="px-6 py-4">Saldo Pendiente USD</th>
                    <th className="px-6 py-4">Saldo Pendiente ARS</th>
                    <th className="px-6 py-4">Historial de Movimientos (Deudas y Pagos Parciales)</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-500">Cargando cuentas...</td>
                    </tr>
                  ) : subTab === 'clientes' && filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center text-slate-500">No hay clientes registrados.</td>
                    </tr>
                  ) : subTab === 'proveedores' && filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center text-slate-500">No hay proveedores registrados.</td>
                    </tr>
                  ) : (
                    subTab === 'clientes' ? (
                      filteredCustomers.map((c) => {
                        const bal = getPersonBalance(c.id);
                        return (
                          <tr key={c.id} className="hover:bg-slate-800/40 transition-colors align-top">
                            <td className="px-6 py-4 font-semibold text-white flex items-center gap-2">
                              <Users className="w-4 h-4 text-emerald-400" />
                              {c.name}
                            </td>
                            <td className="px-6 py-4 font-mono font-bold text-emerald-400">
                              ${bal.usd.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 font-mono text-slate-300">
                              ${bal.ars.toLocaleString('es-AR')}
                            </td>
                            <td className="px-6 py-4 text-xs font-mono text-slate-300 max-w-sm space-y-2">
                              {bal.movs.length === 0 ? (
                                <span className="text-slate-600 italic">Sin movimientos</span>
                              ) : (
                                bal.movs.map(m => (
                                  <div key={m.id} className="flex justify-between items-center bg-slate-950 p-2 rounded-lg border border-slate-800/80 gap-2">
                                    <div>
                                      <span className={m.type === 'debe' ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                                        {m.type === 'debe' ? 'DEBE' : 'PAGO'}: ${m.amount} {m.currency}
                                      </span>
                                      <p className="text-[10px] text-slate-400">{m.concept || 'Sin detalle'} • {new Date(m.created_at).toLocaleDateString('es-AR')}</p>
                                    </div>
                                    <button
                                      onClick={() => handleDeleteMovement(m.id)}
                                      className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                                      title="Borrar movimiento"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {(bal.usd > 0 || bal.ars > 0) && (
                                <button
                                  onClick={() => handleSettleAccount(c.id, 'customer', bal.usd, bal.ars)}
                                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  Saldar Cuenta (Pagó Todo)
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      filteredSuppliers.map((s) => {
                        const bal = getPersonBalance(s.id);
                        return (
                          <tr key={s.id} className="hover:bg-slate-800/40 transition-colors align-top">
                            <td className="px-6 py-4 font-semibold text-white flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-blue-400" />
                              {s.name}
                            </td>
                            <td className="px-6 py-4 font-mono font-bold text-rose-400">
                              ${bal.usd.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 font-mono text-slate-300">
                              ${bal.ars.toLocaleString('es-AR')}
                            </td>
                            <td className="px-6 py-4 text-xs font-mono text-slate-300 max-w-sm space-y-2">
                              {bal.movs.length === 0 ? (
                                <span className="text-slate-600 italic">Sin movimientos</span>
                              ) : (
                                bal.movs.map(m => (
                                  <div key={m.id} className="flex justify-between items-center bg-slate-950 p-2 rounded-lg border border-slate-800/80 gap-2">
                                    <div>
                                      <span className={m.type === 'debe' ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                        {m.type === 'debe' ? 'DEBE' : 'PAGO'}: ${m.amount} {m.currency}
                                      </span>
                                      <p className="text-[10px] text-slate-400">{m.concept || 'Sin detalle'} • {new Date(m.created_at).toLocaleDateString('es-AR')}</p>
                                    </div>
                                    <button
                                      onClick={() => handleDeleteMovement(m.id)}
                                      className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                                      title="Borrar movimiento"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {(bal.usd > 0 || bal.ars > 0) && (
                                <button
                                  onClick={() => handleSettleAccount(s.id, 'supplier', bal.usd, bal.ars)}
                                  className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  Saldar Cuenta
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO: REPORTES */}
      {activeTab === 'reportes' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Cuánto me deben (Clientes)</p>
                  <h3 className="text-3xl font-bold font-mono text-emerald-400 mt-2">
                    USD $ {clientTotals.usd.toFixed(2)}
                  </h3>
                  {clientTotals.ars > 0 && (
                    <p className="text-sm font-mono text-slate-300 mt-1">
                      + ARS $ {clientTotals.ars.toLocaleString('es-AR')}
                    </p>
                  )}
                </div>
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
              <p className="text-xs text-slate-500 pt-2 border-t border-slate-800">Saldos pendientes a cobrar</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Cuánto debo yo (Proveedores)</p>
                  <h3 className="text-3xl font-bold font-mono text-rose-400 mt-2">
                    USD $ {supplierTotals.usd.toFixed(2)}
                  </h3>
                  {supplierTotals.ars > 0 && (
                    <p className="text-sm font-mono text-slate-300 mt-1">
                      + ARS $ {supplierTotals.ars.toLocaleString('es-AR')}
                    </p>
                  )}
                </div>
                <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl">
                  <TrendingDown className="w-6 h-6" />
                </div>
              </div>
              <p className="text-xs text-slate-500 pt-2 border-t border-slate-800">Saldos pendientes a pagar</p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR MOVIMIENTO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-400" />
                Registrar Movimiento en Cuenta
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white text-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMovement} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Tipo de Cuenta</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setTargetType('customer'); setSelectedPersonId(''); }}
                    className={`py-2 text-xs font-semibold rounded-xl border ${
                      targetType === 'customer'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                        : 'bg-slate-950 text-slate-300 border-slate-800'
                    }`}
                  >
                    Cliente
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTargetType('supplier'); setSelectedPersonId(''); }}
                    className={`py-2 text-xs font-semibold rounded-xl border ${
                      targetType === 'supplier'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                        : 'bg-slate-950 text-slate-300 border-slate-800'
                    }`}
                  >
                    Proveedor
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Seleccionar {targetType === 'customer' ? 'Cliente' : 'Proveedor'} *</label>
                <select
                  required
                  value={selectedPersonId}
                  onChange={(e) => setSelectedPersonId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Seleccionar --</option>
                  {targetType === 'customer' ? (
                    customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                  ) : (
                    suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Operación</label>
                  <select
                    value={movementType}
                    onChange={(e: any) => setMovementType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="debe">Debe (Suma Deuda)</option>
                    <option value="pago">Pago / Abono (Descuenta)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Moneda</label>
                  <select
                    value={currency}
                    onChange={(e: any) => setCurrency(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="ARS">ARS ($)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Monto *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Concepto / Detalle</label>
                <input
                  type="text"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="Ej: Pago parcial $200, seña, etc."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl text-sm font-semibold transition-colors"
                >
                  Guardar Movimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NUEVO CLIENTE / PROVEEDOR */}
      {isNewPersonModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                Registrar Nuevo {newPersonType === 'customer' ? 'Cliente' : 'Proveedor'}
              </h3>
              <button onClick={() => setIsNewPersonModalOpen(false)} className="text-slate-400 hover:text-white text-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePerson} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nombre y Apellido *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder={newPersonType === 'customer' ? 'Ej: Juan Pérez' : 'Ej: Distribuidora Apple'}
                />
              </div>

              {newPersonType === 'customer' && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                    placeholder="11 2345-6789"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewPersonModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl text-xs font-semibold"
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