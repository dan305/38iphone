'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Smartphone, Lock, User } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: username.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMsg('Usuario o contraseña incorrectos.');
      return;
    }

    router.replace('/');
  };

  return (
    <div className="min-h-screen bg-black text-slate-100 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-8 shadow-2xl space-y-6">
        
        {/* Logo de 38.iphone */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-4 bg-slate-950 border border-slate-800 rounded-2xl text-emerald-400 shadow-inner">
            <Smartphone className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">38.iphone</h1>
          <p className="text-xs text-slate-400">Sistema de Gestión Comercial y Financiera</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Usuario (email)</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Contraseña</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-slate-950 font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/10 text-sm mt-2 cursor-pointer"
          >
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <p className="text-[11px] text-center text-slate-500">
          Acceso exclusivo para personal autorizado de 38.iphone
        </p>
      </div>
    </div>
  );
}