'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Users,
  UserPlus,
  Search,
  Trash2,
  Phone,
  Mail,
  UserCheck,
  UserX,
  Repeat,
} from 'lucide-react';

interface Customer {
  id: string;
  created_at: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}

interface Sale {
  id: string;
  customer_id: string | null;
  created_at: string;
  total_usd: number;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'todos' | 'nuevos' | 'recurrentes' | 'sin_compras'>('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [currentMonth, setCurrentMonth] = useState<number>(0);
  const [currentYear, setCurrentYear] = useState<number>(2026);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: custData, error: custErr } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (custErr) throw custErr;
      if (custData) setCustomers(custData);

      const { data: salesData, error: salesErr } = await supabase
        .from('sales')
        .select('id, customer_id, created_at, total_usd');

      if (salesErr) throw salesErr;
      if (salesData) setSales(salesData);
    } catch (err: any) {
      console.error('Error al cargar datos de clientes:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const now = new Date();
    setCurrentMonth(now.getMonth());
    setCurrentYear(now.getFullYear());
    fetchData();
  }, []);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      alert('El nombre del cliente es obligatorio.');
      return;
    }

    try {
      const { error } = await supabase.from('customers').insert({
        name,
        phone: phone || null,
        email: email || null,
      });

      if (error) throw error;

      setIsModalOpen(false);
      setName('');
      setPhone('');
      setEmail('');
      fetchData();
    } catch (err: any) {
      alert(`Error al registrar cliente: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Deseas eliminar este cliente?')) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  const customerStats = customers.map((c) => {
    const custSales = sales.filter((s) => s.customer_id === c.id);
    const totalPurchases = custSales.length;
    
    const createdDate = new Date(c.created_at);
    const isNewThisMonth = createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear;

    let lastPurchaseDate: string | null = null;
    if (totalPurchases > 0) {
      const sorted = custSales.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      lastPurchaseDate = new Date(sorted[0].created_at).toLocaleDateString('es-AR');
    }

    return {
      ...c,
      totalPurchases,
      isNewThisMonth,
      isRecurrent: totalPurchases >= 2,
      hasNoPurchases: totalPurchases === 0,
      lastPurchaseDate,
    };
  });

  const totalClients = customers.length;
  const newThisMonthCount = customerStats.filter((c) => c.isNewThisMonth).length;
  const recurrentCount = customerStats.filter((c) => c.isRecurrent).length;
  const noPurchasesCount = customerStats.filter((c) => c.hasNoPurchases).length;

  const filteredCustomers = customerStats.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.phone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (activeTab === 'nuevos') return c.isNewThisMonth;
    if (activeTab === 'recurrentes') return c.isRecurrent;
    if (activeTab === 'sin_compras') return c.hasNoPurchases;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-400" />
            Clientes
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Conozca quién compra, quién vuelve y cómo contactarlo.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold px-4 py-2.5 rounded-lg transition-colors text-sm shadow-lg shadow-emerald-500/10"
        >
          <UserPlus className="w-4 h-4" />
          Nuevo cliente
        </button>
      </div>

      {/* Tarjetas KPI Superiores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>TOTAL DE CLIENTES</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white">{totalClients}</div>
          <div className="text-xs text-slate-500">Clientes activos en el sistema</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>NUEVOS ESTE MES</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-emerald-400">{newThisMonthCount}</div>
          <div className="text-xs text-slate-500">Registrados en el mes actual</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>RECURRENTES</span>
            <Repeat className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-purple-400">{recurrentCount}</div>
          <div className="text-xs text-slate-500">Dos o más compras realizadas</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
            <span>SIN COMPRAS</span>
            <UserX className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-amber-400">{noPurchasesCount}</div>
          <div className="text-xs text-slate-500">Aún sin compras completadas</div>
        </div>
      </div>

      {/* Pestañas de Filtro y Buscador */}
      <div className="flex flex-col lg:flex-row justify-between items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <button
            onClick={() => setActiveTab('todos')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'todos'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Todos ({totalClients})
          </button>
          <button
            onClick={() => setActiveTab('nuevos')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'nuevos'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Nuevos este mes ({newThisMonthCount})
          </button>
          <button
            onClick={() => setActiveTab('recurrentes')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'recurrentes'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Recurrentes ({recurrentCount})
          </button>
          <button
            onClick={() => setActiveTab('sin_compras')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'sin_compras'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Sin compras ({noPurchasesCount})
          </button>
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono, email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Subtítulo indicador */}
      <div className="flex justify-between items-center text-xs text-slate-400 px-1">
        <span>Compras completadas y datos de contacto de sus clientes.</span>
        <span className="font-mono">{filteredCustomers.length} clientes mostrados</span>
      </div>

      {/* Tabla de Clientes */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Contacto</th>
                <th className="px-6 py-4 text-center">Compras</th>
                <th className="px-6 py-4">Última Compra</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    Cargando base de clientes...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
                        <Users className="w-6 h-6" />
                      </div>
                      <div className="text-base font-bold text-white">Todavía no tiene clientes</div>
                      <p className="text-xs text-slate-400 max-w-sm">
                        Guarde el contacto y el historial de compras de cada cliente. Los elige al armar una venta y los necesita para la cuenta corriente.
                      </p>
                      <button
                        onClick={() => setIsModalOpen(true)}
                        className="mt-2 flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold px-4 py-2 rounded-lg text-xs transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Nuevo cliente
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-white flex items-center gap-2">
                        {c.name}
                        {c.isNewThisMonth && (
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-sans">
                            Nuevo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs space-y-1">
                      {c.phone && (
                        <div className="flex items-center gap-1.5 text-slate-300 font-mono">
                          <Phone className="w-3 h-3 text-emerald-400" /> {c.phone}
                        </div>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Mail className="w-3 h-3" /> {c.email}
                        </div>
                      )}
                      {!c.phone && !c.email && (
                        <span className="text-slate-600 italic">Sin contacto registrado</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold font-mono ${
                          c.totalPurchases >= 2
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : c.totalPurchases === 1
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}
                      >
                        {c.totalPurchases} {c.totalPurchases === 1 ? 'compra' : 'compras'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-400">
                      {c.lastPurchaseDate || <span className="text-slate-600">Sin compras</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                        title="Eliminar cliente"
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

      {/* Modal Nuevo Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                Registrar Nuevo Cliente
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white text-xl">
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nombre y Apellido *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="Ej: Juan Pérez"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                  placeholder="Ej: 11 2345-6789"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="correo@ejemplo.com"
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
                  Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}