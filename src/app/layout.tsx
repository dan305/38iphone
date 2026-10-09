'use client';

import './globals.css';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AiAssistant from '@/components/AiAssistant';
import {
  LayoutDashboard, Package, ShoppingCart, Wallet, Users, Truck, Wrench,
  DollarSign, ShieldCheck, ArrowLeftRight, TrendingUp, Search, Bell,
  Smartphone, Sparkles, Menu, X, MessageCircle
} from 'lucide-react';

interface DollarRate {
  casa: string; nombre: string; compra: number; venta: number;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [dollarBlue, setDollarBlue] = useState<DollarRate | null>(null);
  const [dollarCripto, setDollarCripto] = useState<DollarRate | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUserEmail(data.session?.user?.email ?? null);
      setAuthChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    if (!userEmail && pathname !== '/login') router.replace('/login');
    else if (userEmail && pathname === '/login') router.replace('/');
  }, [authChecked, userEmail, pathname, router]);

  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (!userEmail) return;
    const fetchDollarRates = async () => {
      try {
        const res = await fetch('https://dolarapi.com/v1/dolares');
        const data = await res.json();
        if (Array.isArray(data)) {
          const blue = data.find((d: any) => d.casa === 'blue');
          const cripto = data.find((d: any) => d.casa === 'cripto');
          if (blue) setDollarBlue(blue);
          if (cripto) setDollarCripto(cripto);
        }
      } catch (err) { console.error('Error al obtener cotización:', err); }
    };
    fetchDollarRates();
    const interval = setInterval(fetchDollarRates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userEmail]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (!authChecked || (!userEmail && pathname !== '/login')) {
    return <html lang="es" className="dark"><body className="bg-[#0b0b0e] text-slate-100 antialiased min-h-screen" /></html>;
  }

  if (pathname === '/login') {
    return <html lang="es" className="dark"><body className="bg-[#0b0b0e] text-slate-100 antialiased">{children}</body></html>;
  }

  const navGroups = [
    {
      title: 'GENERAL', items: [
        { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { href: '/reportes', icon: TrendingUp, label: 'Analytics' },
        { href: '/conversaciones', icon: MessageCircle, label: 'Conversaciones IA' },
        { href: '/ia-comercial', icon: Sparkles, label: 'IA Comercial' },
        { href: '/customers', icon: Users, label: 'Clientes' },
      ]
    },
    {
      title: 'INVENTARIO & COMPRAS', items: [
        { href: '/devices', icon: Package, label: 'Mi inventario' },
        { href: '/purchases', icon: Wallet, label: 'Compras' },
        { href: '/suppliers', icon: Truck, label: 'Proveedores' },
      ]
    },
    {
      title: 'VENTAS', items: [
        { href: '/sales', icon: ShoppingCart, label: 'Ventas registradas' },
        { href: '/trade-in', icon: ArrowLeftRight, label: 'Permutas' },
        { href: '/cuenta-corriente', icon: Wallet, label: 'Cuenta Corriente' },
        { href: '/finance', icon: DollarSign, label: 'Caja y Gastos' },
      ]
    },
    {
      title: 'POST-VENTA', items: [
        { href: '/service-orders', icon: Wrench, label: 'Servicio Técnico' },
        { href: '/warranties', icon: ShieldCheck, label: 'Garantías' },
      ]
    },
  ];

  const mobileNavItems = [
    { href: '/', icon: LayoutDashboard, label: 'Inicio' },
    { href: '/devices', icon: Package, label: 'Stock' },
    { href: '/sales', icon: ShoppingCart, label: 'Ventas' },
    { href: '/conversaciones', icon: MessageCircle, label: 'Chats IA' },
    { href: '/reportes', icon: TrendingUp, label: 'Reportes' },
  ];

  const SidebarNav = () => (
    <>
      {navGroups.map((group, idx) => (
        <div key={idx} className="mb-6">
          <h3 className="px-3 text-[10px] font-bold tracking-widest text-slate-500 mb-2 uppercase">{group.title}</h3>
          <div className="space-y-1">
            {group.items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group ${isActive ? 'bg-purple-500/10 text-purple-400 font-medium' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                    }`}
                >
                  <item.icon className={`w-4 h-4 ${isActive ? 'text-purple-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <html lang="es" className="dark">
      <body className="bg-[#0b0b0e] text-slate-100 min-h-screen flex selection:bg-purple-500/30 selection:text-white antialiased font-sans">

        {/* SIDEBAR - Desktop only */}
        <aside className="w-[260px] bg-[#121216] border-r border-white/5 flex-col hidden md:flex shrink-0 h-screen sticky top-0">
          <div className="px-6 py-5 flex items-center gap-3 border-b border-white/5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Smartphone className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-wide">38iPhone</h1>
              <p className="text-[10px] text-slate-400">ERP & Control By Dan</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
            <SidebarNav />
          </div>
        </aside>

        {/* MOBILE MENU OVERLAY */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
            <div className="relative w-[280px] bg-[#121216] border-r border-white/5 flex flex-col h-full z-10 shadow-2xl">
              <div className="px-5 py-5 flex items-center justify-between border-b border-white/5 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl overflow-hidden border border-white/10">

                  </div>
                  <div>
                    <h1 className="text-sm font-bold text-white">38.iPhone</h1>
                    <p className="text-[10px] text-slate-400">ERP & Control By Dan</p>
                  </div>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="text-slate-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
                <SidebarNav />
              </div>
              <div className="p-4 border-t border-white/5 shrink-0">
                <div className="flex items-center gap-3 mb-3 px-2">
                  <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold text-xs">A</div>
                  <div>
                    <div className="text-xs font-semibold text-white">Administrador</div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[160px]">{userEmail}</div>
                  </div>
                </div>
                <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
                  Cerrar Sesión
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MAIN CONTENT */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0b0b0e] overflow-hidden">
          {/* Top Bar */}
          <header className="h-14 md:h-16 px-4 md:px-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-[#0b0b0e]/90 backdrop-blur-md sticky top-0 z-20">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Hamburger - mobile */}
              <button onClick={() => setMobileMenuOpen(true)} className="md:hidden text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors shrink-0">
                <Menu className="w-5 h-5" />
              </button>
              {/* Logo - mobile */}
              <div className="flex items-center gap-2 md:hidden">
                <div className="w-7 h-7 rounded-lg overflow-hidden border border-white/10">

                </div>
                <span className="text-sm font-bold text-white">38.iPhone</span>
              </div>
              {/* Search - desktop */}
              <div className="hidden md:flex flex-1 max-w-md relative group">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-purple-400 transition-colors" />
                <input type="text" placeholder="Buscar IMEI, producto, cliente..."
                  className="w-full bg-[#16161a] border border-white/5 rounded-xl pl-10 pr-10 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-slate-400">⌘K</div>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3 ml-2 shrink-0">
              <div className="hidden sm:flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <span className="text-[10px] font-medium text-emerald-500">$ Blue</span>
                  <span className="text-xs font-bold text-emerald-400">{dollarBlue ? dollarBlue.venta.toLocaleString('es-AR') : '...'}</span>
                </div>
                <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
                  <span className="text-[10px] font-medium text-blue-500">USDT</span>
                  <span className="text-xs font-bold text-blue-400">{dollarCripto ? dollarCripto.venta.toLocaleString('es-AR') : '...'}</span>
                </div>
              </div>
              <button className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors relative">
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 rounded-full border border-[#0b0b0e]"></span>
              </button>
              <div className="hidden md:flex items-center gap-3 pl-3 border-l border-white/10">
                <div className="text-right">
                  <div className="text-[11px] font-semibold text-slate-200">Administrador</div>
                  <div className="text-[10px] text-slate-500">Sesión Activa</div>
                </div>
                <button onClick={handleLogout}
                  className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold text-xs hover:bg-purple-500/30 transition-colors"
                  title="Cerrar sesión"
                >A</button>
              </div>
            </div>
          </header>

          {/* Page Content — extra bottom padding so content clears the mobile nav bar */}
          <main className="flex-1 overflow-y-auto pb-24 md:pb-0">
            <div className="p-4 md:p-6 max-w-[1600px] mx-auto w-full">
              {children}
            </div>
          </main>
        </div>

        {/* BOTTOM NAV - Mobile only */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-[#121216]/95 border-t border-white/5 backdrop-blur-xl safe-bottom">
          <div className="flex items-stretch h-16">
            {mobileNavItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}
                  className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors relative"
                >
                  {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-purple-500 rounded-full" />}
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-purple-400' : 'text-slate-500'}`} />
                  <span className={`text-[10px] font-medium ${isActive ? 'text-purple-400' : 'text-slate-500'}`}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Asistente IA Flotante */}
        <AiAssistant />

        <style dangerouslySetInnerHTML={{
          __html: `
          .custom-scrollbar::-webkit-scrollbar { width: 4px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #2a2a35; border-radius: 4px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f50; }
          .safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }
        `}} />
      </body>
    </html>
  );
}